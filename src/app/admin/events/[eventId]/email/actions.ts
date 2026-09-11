"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { requireEventAccess } from "@/lib/admin-authorization";
import { db } from "@/lib/db";
import {
  createVerifiedMailer,
  sendHouseholdMessage,
  type InvitationDeliveryKind,
} from "@/lib/invitation-delivery";

function emailUrl(eventId: string, values: Record<string, string | number>) {
  const query = new URLSearchParams(
    Object.entries(values).map(([key, value]) => [key, String(value)]),
  );
  return `/admin/events/${eventId}/email?${query.toString()}`;
}

const identifierSchema = z.string().uuid();

function jsonMetadata(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Prisma.InputJsonObject)
    : {};
}

function blockedDelivery(type: "INVITATION" | "REMINDER") {
  return {
    type,
    OR: [
      { status: { in: ["QUEUED", "SENDING"] } },
      {
        status: "FAILED",
        attemptCount: { gte: 3 },
        manualRetryApprovedAt: null,
      },
    ],
  } satisfies Prisma.EmailLogWhereInput;
}

export async function bulkEmailAction(
  eventId: string,
  formData: FormData,
): Promise<void> {
  const admin = await requireAdmin();
  await requireEventAccess(eventId, admin);
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { status: true },
  });
  if (!event || event.status !== "PUBLISHED") {
    redirect(
      emailUrl(eventId, {
        error: "Publish this event before sending invitations or reminders.",
      }),
    );
  }
  if (String(formData.get("confirmation") ?? "") !== "SEND") {
    redirect(
      emailUrl(eventId, {
        error: "Type SEND to confirm an external email delivery.",
      }),
    );
  }
  const mode = String(formData.get("mode") ?? "");
  if (mode !== "INVITATION" && mode !== "REMINDER") {
    redirect(emailUrl(eventId, { error: "Unknown email action." }));
  }
  const kind: InvitationDeliveryKind = mode;
  const nextReminder =
    mode === "REMINDER"
      ? await db.invitation.findFirst({
          where: {
            sentAt: { not: null },
            emailLogs: { none: blockedDelivery("REMINDER") },
            household: {
              eventId,
              archivedAt: null,
              contactEmail: { not: null },
              rsvp: null,
            },
          },
          orderBy: [{ reminderCount: "asc" }, { createdAt: "asc" }],
          select: { reminderCount: true },
        })
      : null;
  const households = await db.household.findMany({
    where: {
      eventId,
      archivedAt: null,
      contactEmail: { not: null },
      rsvp: null,
      ...(mode === "INVITATION"
        ? {
            OR: [
              { invitation: null },
              {
                invitation: {
                  sentAt: null,
                  emailLogs: { none: blockedDelivery("INVITATION") },
                },
              },
            ],
          }
        : {
            invitation: {
              sentAt: { not: null },
              reminderCount: nextReminder?.reminderCount ?? -1,
              emailLogs: { none: blockedDelivery("REMINDER") },
            },
          }),
    },
    orderBy: { createdAt: "asc" },
    take: 250,
    select: { id: true },
  });
  if (!households.length) {
    redirect(
      emailUrl(eventId, {
        error:
          mode === "INVITATION"
            ? "No unsent households with email addresses were found."
            : "No sent, unanswered invitations were found.",
      }),
    );
  }
  let mailer;
  try {
    mailer = await createVerifiedMailer();
  } catch (error) {
    redirect(
      emailUrl(eventId, {
        error: error instanceof Error ? error.message : "SMTP is unavailable.",
      }),
    );
  }

  let sent = 0;
  let duplicates = 0;
  let failed = 0;
  try {
    for (const household of households) {
      try {
        const result = await sendHouseholdMessage({
          eventId,
          householdId: household.id,
          kind,
          mailer,
        });
        if (result.status === "sent") sent += 1;
        else if (result.reason === "retry-exhausted") failed += 1;
        else duplicates += 1;
      } catch (error) {
        console.error("Email delivery failed", {
          eventId,
          householdId: household.id,
          kind,
          error,
        });
        failed += 1;
      }
    }
  } finally {
    mailer.close();
  }
  await db.auditLog.create({
    data: {
      adminId: admin.id,
      eventId,
      action: `email.bulk_${mode.toLowerCase()}`,
      entityType: "EmailLog",
      metadata: { requested: households.length, sent, duplicates, failed },
    },
  });
  revalidatePath(`/admin/events/${eventId}`);
  redirect(emailUrl(eventId, { sent, duplicates, failed }));
}

export async function sendOneEmailAction(
  eventId: string,
  householdId: string,
  kind: InvitationDeliveryKind,
): Promise<void> {
  const admin = await requireAdmin();
  await requireEventAccess(eventId, admin);
  let mailer;
  try {
    mailer = await createVerifiedMailer();
  } catch (error) {
    redirect(
      emailUrl(eventId, {
        error: error instanceof Error ? error.message : "SMTP is unavailable.",
      }),
    );
  }
  let result;
  try {
    result = await sendHouseholdMessage({ eventId, householdId, kind, mailer });
  } catch (error) {
    redirect(
      emailUrl(eventId, {
        error:
          error instanceof Error ? error.message : "Email delivery failed.",
      }),
    );
  } finally {
    mailer.close();
  }
  await db.auditLog.create({
    data: {
      adminId: admin.id,
      eventId,
      action: `email.${kind.toLowerCase()}`,
      entityType: "Household",
      entityId: householdId,
    },
  });
  if (result.status === "duplicate" && result.reason === "retry-exhausted") {
    redirect(
      emailUrl(eventId, {
        error:
          "This delivery reached its retry limit. Review the delivery log before taking further action.",
      }),
    );
  }
  redirect(
    emailUrl(
      eventId,
      result.status === "sent"
        ? { sent: 1, duplicates: 0, failed: 0 }
        : { sent: 0, duplicates: 1, failed: 0 },
    ),
  );
}

export async function approveEmailRetryAction(
  eventId: string,
  emailLogId: string,
  formData: FormData,
): Promise<void> {
  const admin = await requireAdmin();
  await requireEventAccess(eventId, admin);
  if (
    !identifierSchema.safeParse(eventId).success ||
    !identifierSchema.safeParse(emailLogId).success ||
    String(formData.get("confirmation") ?? "") !== "RETRY"
  ) {
    redirect(
      emailUrl(eventId, {
        error:
          "Confirm that you checked the SMTP provider before approving another delivery attempt.",
      }),
    );
  }

  const now = new Date();
  // This exceeds the maximum configurable SMTP socket timeout (five minutes),
  // preventing an administrator from racing an ordinary in-flight delivery.
  const staleBefore = new Date(now.getTime() - 10 * 60_000);
  let failure: string | null = null;
  try {
    await db.$transaction(async (transaction) => {
      const log = await transaction.emailLog.findFirst({
        where: { id: emailLogId, eventId },
        include: {
          attempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
        },
      });
      const attempt = log?.attempts[0];
      if (!log || !attempt) {
        throw new Error("This delivery could not be found.");
      }
      const isStalled =
        attempt.status === "STARTED" &&
        (log.status === "QUEUED" || log.status === "SENDING") &&
        log.updatedAt <= staleBefore;
      const isExhausted =
        log.status === "FAILED" &&
        log.attemptCount >= 3 &&
        !log.manualRetryApprovedAt;
      if (!isStalled && !isExhausted) {
        throw new Error(
          "This delivery no longer needs approval or is still within its send window.",
        );
      }

      const approvalData = {
        manualRetryApprovedAt: now,
        metadata: {
          ...jsonMetadata(log.metadata),
          manualReconciliation: isStalled
            ? "released-and-approved-for-retry"
            : "additional-retry-approved",
          manuallyReconciledAt: now.toISOString(),
        },
      } satisfies Prisma.EmailLogUpdateManyMutationInput;
      const approved = isStalled
        ? await transaction.emailLog.updateMany({
            where: {
              id: log.id,
              eventId,
              status: { in: ["QUEUED", "SENDING"] },
              updatedAt: { lte: staleBefore },
            },
            data: {
              ...approvalData,
              status: "FAILED",
              failedAt: now,
              errorCode: "MANUAL_RETRY_RELEASE",
              errorMessage:
                "An administrator released this stale or ambiguous delivery and approved one explicit retry after checking the SMTP provider.",
            },
          })
        : await transaction.emailLog.updateMany({
            where: {
              id: log.id,
              eventId,
              status: "FAILED",
              attemptCount: { gte: 3 },
              manualRetryApprovedAt: null,
            },
            data: approvalData,
          });
      if (approved.count !== 1) {
        throw new Error("This delivery changed before retry was approved.");
      }
      if (isStalled) {
        await transaction.emailDeliveryAttempt.update({
          where: { id: attempt.id },
          data: {
            status: "FAILED",
            completedAt: now,
            errorCode: "MANUAL_RETRY_RELEASE",
            errorMessage:
              "Released by an administrator after the delivery became stale.",
          },
        });
        if (log.invitationId && log.type !== "MANAGEMENT_LINK") {
          await transaction.invitation.updateMany({
            where: { id: log.invitationId },
            data: { status: "FAILED", failedAt: now },
          });
        }
      }
      await transaction.auditLog.create({
        data: {
          adminId: admin.id,
          eventId,
          action: "email.retry_approved",
          entityType: "EmailLog",
          entityId: log.id,
          metadata: { previousStatus: log.status },
        },
      });
    });
  } catch (error) {
    failure =
      error instanceof Error ? error.message : "The delivery was not released.";
  }
  if (failure) redirect(emailUrl(eventId, { error: failure }));
  revalidatePath(`/admin/events/${eventId}/email`);
  redirect(emailUrl(eventId, { released: 1 }));
}
