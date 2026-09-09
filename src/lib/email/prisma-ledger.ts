import "server-only";

import {
  EmailAttemptStatus,
  EmailStatus,
  type Prisma,
  type PrismaClient,
} from "@/generated/prisma/client";
import { db } from "@/lib/db";

import type {
  DeliveryReservation,
  FailedDeliveryInput,
  MailDeliveryLedger,
  ReserveDeliveryInput,
  SentDeliveryInput,
} from "./types";

interface PrismaMailDeliveryLedgerOptions {
  maxAttempts?: number;
  client?: PrismaClient;
}

/**
 * Database-backed SMTP idempotency and audit log. A SENDING row is never
 * automatically retried because a process can crash after SMTP acceptance but
 * before the database write; blindly retrying that ambiguous state can deliver
 * duplicates. An administrator can reconcile it explicitly.
 */
export class PrismaMailDeliveryLedger implements MailDeliveryLedger {
  private readonly client: PrismaClient;
  private readonly maxAttempts: number;

  constructor(options: PrismaMailDeliveryLedgerOptions = {}) {
    this.client = options.client ?? db;
    this.maxAttempts = options.maxAttempts ?? 3;
    if (
      !Number.isInteger(this.maxAttempts) ||
      this.maxAttempts < 1 ||
      this.maxAttempts > 10
    ) {
      throw new Error("Mail maxAttempts must be an integer between 1 and 10.");
    }
  }

  async reserve(input: ReserveDeliveryInput): Promise<DeliveryReservation> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.reserveOnce(input);
      } catch (error) {
        if (!isRetryableTransactionError(error) || attempt === 2) throw error;
      }
    }
    throw new Error("Unable to reserve email delivery.");
  }

  async markSending(attemptId: string, startedAt: Date): Promise<void> {
    await this.client.$transaction(async (transaction) => {
      const attempt = await transaction.emailDeliveryAttempt.findUniqueOrThrow({
        where: { id: attemptId },
        select: { emailLogId: true, status: true },
      });
      if (attempt.status !== EmailAttemptStatus.STARTED) {
        throw new Error("Email delivery attempt is no longer pending.");
      }
      await transaction.emailDeliveryAttempt.update({
        where: { id: attemptId },
        data: { startedAt },
      });
      await transaction.emailLog.update({
        where: { id: attempt.emailLogId },
        data: {
          status: EmailStatus.SENDING,
          lastAttemptAt: startedAt,
          failedAt: null,
          errorCode: null,
          errorMessage: null,
        },
      });
    });
  }

  async markSent(input: SentDeliveryInput): Promise<void> {
    await this.client.$transaction(async (transaction) => {
      const attempt = await transaction.emailDeliveryAttempt.findUniqueOrThrow({
        where: { id: input.attemptId },
        select: {
          emailLogId: true,
          status: true,
          emailLog: { select: { metadata: true, status: true } },
        },
      });
      if (
        attempt.status === EmailAttemptStatus.SENT &&
        attempt.emailLog.status === EmailStatus.SENT
      ) {
        return;
      }
      if (attempt.status !== EmailAttemptStatus.STARTED) {
        throw new Error("Only a started email attempt can be marked sent.");
      }

      await transaction.emailDeliveryAttempt.update({
        where: { id: input.attemptId },
        data: {
          status: EmailAttemptStatus.SENT,
          providerMessageId: input.providerMessageId,
          errorCode: null,
          errorMessage: null,
          completedAt: input.sentAt,
        },
      });
      await transaction.emailLog.update({
        where: { id: attempt.emailLogId },
        data: {
          status: EmailStatus.SENT,
          providerMessageId: input.providerMessageId,
          sentAt: input.sentAt,
          failedAt: null,
          errorCode: null,
          errorMessage: null,
          metadata: mergeMetadata(attempt.emailLog.metadata, {
            smtpAccepted: [...input.accepted],
            smtpRejected: [...input.rejected],
            ...(input.response ? { smtpResponse: input.response } : {}),
          }),
        },
      });
    });
  }

  async markFailed(input: FailedDeliveryInput): Promise<void> {
    await this.client.$transaction(async (transaction) => {
      const attempt = await transaction.emailDeliveryAttempt.findUniqueOrThrow({
        where: { id: input.attemptId },
        select: {
          emailLogId: true,
          status: true,
          emailLog: { select: { metadata: true } },
        },
      });
      if (attempt.status === EmailAttemptStatus.FAILED) return;
      if (attempt.status !== EmailAttemptStatus.STARTED) {
        throw new Error("Only a started email attempt can be marked failed.");
      }

      await transaction.emailDeliveryAttempt.update({
        where: { id: input.attemptId },
        data: {
          status: EmailAttemptStatus.FAILED,
          errorCode: input.code.slice(0, 100),
          errorMessage: input.message.slice(0, 4_000),
          completedAt: input.failedAt,
        },
      });
      await transaction.emailLog.update({
        where: { id: attempt.emailLogId },
        data: {
          status: EmailStatus.FAILED,
          failedAt: input.failedAt,
          errorCode: input.code.slice(0, 100),
          errorMessage: input.message.slice(0, 4_000),
          metadata: mergeMetadata(attempt.emailLog.metadata, {
            smtpFailureRetryable: input.retryable,
          }),
        },
      });
    });
  }

  private async reserveOnce(
    input: ReserveDeliveryInput,
  ): Promise<DeliveryReservation> {
    return this.client.$transaction(
      async (transaction) => {
        const existing = await transaction.emailLog.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: {
            attempts: {
              orderBy: { attemptNumber: "desc" },
              take: 1,
              select: { id: true },
            },
          },
        });

        if (!existing) {
          const createData: Prisma.EmailLogUncheckedCreateInput = {
            type: input.kind,
            status: EmailStatus.QUEUED,
            toEmail: input.toEmail,
            fromEmail: input.fromEmail,
            subject: input.subject,
            idempotencyKey: input.idempotencyKey,
            attemptCount: 1,
            ...(input.eventId ? { eventId: input.eventId } : {}),
            ...(input.householdId ? { householdId: input.householdId } : {}),
            ...(input.invitationId ? { invitationId: input.invitationId } : {}),
            ...(input.rsvpId ? { rsvpId: input.rsvpId } : {}),
            ...(input.replyTo ? { replyTo: input.replyTo } : {}),
            ...(input.metadata ? { metadata: jsonObject(input.metadata) } : {}),
            attempts: {
              create: {
                attemptNumber: 1,
                status: EmailAttemptStatus.STARTED,
              },
            },
          };
          const created = await transaction.emailLog.create({
            data: createData,
            include: { attempts: { select: { id: true }, take: 1 } },
          });
          const deliveryAttempt = created.attempts[0];
          if (!deliveryAttempt)
            throw new Error("Email attempt was not created.");
          return { reserved: true, attemptId: deliveryAttempt.id };
        }

        const latestId = existing.attempts[0]?.id ?? existing.id;
        if (existing.status === EmailStatus.SENT) {
          return {
            reserved: false,
            attemptId: latestId,
            reason: "already-sent",
          };
        }
        if (
          existing.status === EmailStatus.QUEUED ||
          existing.status === EmailStatus.SENDING
        ) {
          return {
            reserved: false,
            attemptId: latestId,
            reason: "in-progress",
          };
        }
        const hasManualRetryApproval = Boolean(existing.manualRetryApprovedAt);
        if (
          existing.status === EmailStatus.SKIPPED ||
          (existing.attemptCount >= this.maxAttempts && !hasManualRetryApproval)
        ) {
          return {
            reserved: false,
            attemptId: latestId,
            reason: "retry-exhausted",
          };
        }

        const attemptNumber = existing.attemptCount + 1;
        const deliveryAttempt = await transaction.emailDeliveryAttempt.create({
          data: {
            emailLogId: existing.id,
            attemptNumber,
            status: EmailAttemptStatus.STARTED,
          },
          select: { id: true },
        });
        await transaction.emailLog.update({
          where: { id: existing.id },
          data: {
            status: EmailStatus.QUEUED,
            attemptCount: attemptNumber,
            errorCode: null,
            errorMessage: null,
            failedAt: null,
            ...(hasManualRetryApproval
              ? {
                  manualRetryApprovedAt: null,
                  manualRetryConsumedAt: new Date(),
                }
              : {}),
          },
        });
        return { reserved: true, attemptId: deliveryAttempt.id };
      },
      { isolationLevel: "Serializable" },
    );
  }
}

function jsonObject(
  value: Readonly<Record<string, string | number | boolean | null>>,
): Prisma.InputJsonObject {
  return { ...value };
}

function mergeMetadata(
  current: Prisma.JsonValue | null,
  additions: Record<string, Prisma.InputJsonValue>,
): Prisma.InputJsonObject {
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? (current as Record<string, Prisma.InputJsonValue>)
      : {};
  return { ...base, ...additions };
}

function isRetryableTransactionError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === "P2002" || code === "P2034";
}
