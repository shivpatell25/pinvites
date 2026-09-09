import "server-only";

import {
  createInvitationEmail,
  createManagementLinkEmail,
  createReminderEmail,
  type MailDispatchResult,
  MailDispatchError,
  PrismaMailDeliveryLedger,
  SmtpMailer,
  smtpConfigurationFromEnv,
} from "@/lib/email";
import { db } from "@/lib/db";
import { getServerEnvironment } from "@/lib/env";
import {
  claimHouseholdDelivery,
  releaseHouseholdDelivery,
} from "@/lib/household-delivery-lock";
import { generateSecureToken } from "@/lib/security/tokens";

export type InvitationDeliveryKind =
  "INVITATION" | "REMINDER" | "MANAGEMENT_LINK";

export class SmtpUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmtpUnavailableError";
  }
}

function eventEmailDetails(event: {
  title: string;
  hostName: string;
  startsAt: Date;
  timezone: string;
  venueName: string | null;
}) {
  return {
    eventTitle: event.title,
    hostLine: `Hosted by ${event.hostName}`,
    dateLine: new Intl.DateTimeFormat("en-US", {
      timeZone: event.timezone,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(event.startsAt),
    ...(event.venueName ? { venueLine: event.venueName } : {}),
  };
}

export async function createVerifiedMailer() {
  const state = smtpConfigurationFromEnv();
  if (!state.configured) throw new SmtpUnavailableError(state.reason);
  const mailer = new SmtpMailer(state.config, new PrismaMailDeliveryLedger());
  try {
    await mailer.verify();
    return mailer;
  } catch (error) {
    mailer.close();
    throw error;
  }
}

export async function sendHouseholdMessage({
  eventId,
  householdId,
  kind,
  mailer,
}: {
  eventId: string;
  householdId: string;
  kind: InvitationDeliveryKind;
  mailer: SmtpMailer;
}) {
  const lease = await claimHouseholdDelivery(eventId, householdId);
  try {
    const household = await db.household.findFirst({
      where: { id: householdId, eventId, archivedAt: null },
      include: { event: true, invitation: true, rsvp: true },
    });
    if (!household) throw new Error("Household not found.");
    if (household.event.status !== "PUBLISHED") {
      throw new Error("Publish this event before sending invitation email.");
    }
    if (kind === "REMINDER" && household.rsvp) {
      throw new Error("A responding household cannot receive a reminder.");
    }
    if (kind === "MANAGEMENT_LINK" && !household.rsvp) {
      throw new Error("A management link requires an RSVP.");
    }
    const recipientEmail =
      kind === "MANAGEMENT_LINK"
        ? (household.rsvp?.contactEmail ?? household.contactEmail)
        : household.contactEmail;
    if (!recipientEmail) throw new Error("Household has no contact email.");

    let invitation =
      household.invitation ??
      (await db.invitation.create({ data: { householdId: household.id } }));
    if (invitation.revokedAt) {
      invitation = await db.invitation.update({
        where: { id: invitation.id },
        data: { status: "CREATED", revokedAt: null, failedAt: null },
      });
    }
    const purpose = kind === "MANAGEMENT_LINK" ? "management" : "invitation";
    const type = kind === "MANAGEMENT_LINK" ? "MANAGEMENT" : "INVITATION";
    const generated = generateSecureToken(purpose);
    const tokenRecord = await db.invitationToken.create({
      data: {
        invitationId: invitation.id,
        type,
        tokenHash: generated.tokenHash,
      },
    });
    const relativeUrl =
      type === "MANAGEMENT"
        ? `/i/manage/${encodeURIComponent(generated.token)}`
        : `/i/${encodeURIComponent(generated.token)}`;
    const absoluteUrl = new URL(
      relativeUrl,
      getServerEnvironment().BASE_URL,
    ).toString();
    const common = {
      ...eventEmailDetails(household.event),
      recipientName: household.contactName,
    };
    const deadline = household.event.rsvpDeadline
      ? `by ${new Intl.DateTimeFormat("en-US", {
          timeZone: household.event.timezone,
          month: "long",
          day: "numeric",
          year: "numeric",
        }).format(household.event.rsvpDeadline)}`
      : undefined;
    const email =
      kind === "INVITATION"
        ? createInvitationEmail({
            ...common,
            invitationUrl: absoluteUrl,
            ...(deadline ? { rsvpDeadlineLine: deadline } : {}),
          })
        : kind === "REMINDER"
          ? createReminderEmail({
              ...common,
              invitationUrl: absoluteUrl,
              ...(deadline ? { rsvpDeadlineLine: deadline } : {}),
            })
          : createManagementLinkEmail({ ...common, manageUrl: absoluteUrl });
    const managementDeliveryVersion =
      kind === "MANAGEMENT_LINK"
        ? (await db.emailLog.count({
            where: { invitationId: invitation.id, type: "MANAGEMENT_LINK" },
          })) + 1
        : null;
    const reminderBaseCount = invitation.reminderCount;
    const deliveryKey =
      kind === "INVITATION"
        ? `invitation:${invitation.id}:v1`
        : kind === "REMINDER"
          ? `reminder:${invitation.id}:v${reminderBaseCount + 1}`
          : `management:${invitation.id}:r${household.rsvp?.revision ?? 0}:v${managementDeliveryVersion}`;

    let result: MailDispatchResult;
    try {
      result = await mailer.send({
        deliveryKey,
        kind,
        to: recipientEmail,
        email,
        eventId,
        householdId,
        invitationId: invitation.id,
        ...(household.rsvp ? { rsvpId: household.rsvp.id } : {}),
      });
    } catch (error) {
      const smtpAccepted =
        error instanceof MailDispatchError && error.smtpAccepted;
      if (smtpAccepted && type === "MANAGEMENT") {
        await revokeOtherManagementTokens(invitation.id, tokenRecord.id).catch(
          (cleanupError: unknown) => {
            console.error(
              "SMTP accepted a management link, but older links could not be revoked",
              cleanupError,
            );
          },
        );
      } else if (!smtpAccepted) {
        await revokeToken(tokenRecord.id).catch((cleanupError: unknown) => {
          console.error(
            "Unable to revoke an unsent invitation token",
            cleanupError,
          );
        });
        if (kind !== "MANAGEMENT_LINK") {
          await db.invitation
            .update({
              where: { id: invitation.id },
              data: { status: "FAILED", failedAt: new Date() },
            })
            .catch((cleanupError: unknown) => {
              console.error(
                "Unable to record invitation delivery failure",
                cleanupError,
              );
            });
        }
      }
      throw error;
    }

    if (result.status !== "sent") {
      // This call did not send the freshly generated bearer token. Keeping it
      // active would expand the credential surface and, for management links,
      // could displace the token that was actually delivered by a concurrent call.
      await revokeToken(tokenRecord.id);
      if (kind !== "MANAGEMENT_LINK" && result.reason === "retry-exhausted") {
        await db.invitation.update({
          where: { id: invitation.id },
          data: { status: "FAILED", failedAt: new Date() },
        });
      }
      if (kind !== "MANAGEMENT_LINK" && result.reason === "already-sent") {
        if (kind === "INVITATION") {
          await db.invitation.update({
            where: { id: invitation.id },
            data: {
              status: "SENT",
              sentAt: invitation.sentAt ?? new Date(),
              failedAt: null,
            },
          });
        } else {
          await recordReminderAccepted(
            invitation.id,
            reminderBaseCount,
            new Date(),
          );
        }
      }
      return result;
    }

    if (kind === "MANAGEMENT_LINK") {
      await revokeOtherManagementTokens(invitation.id, tokenRecord.id);
    } else {
      if (kind === "INVITATION") {
        await db.invitation.update({
          where: { id: invitation.id },
          data: { status: "SENT", sentAt: new Date(), failedAt: null },
        });
      } else {
        await recordReminderAccepted(
          invitation.id,
          reminderBaseCount,
          new Date(),
        );
      }
    }
    return result;
  } finally {
    await releaseHouseholdDelivery(lease).catch((error: unknown) => {
      console.error("Unable to release household delivery lease", error);
    });
  }
}

async function recordReminderAccepted(
  invitationId: string,
  reminderBaseCount: number,
  acceptedAt: Date,
) {
  // Concurrent sends share an idempotency key. Exactly one caller advances the
  // counter whether it performed the SMTP send or observed the accepted send.
  await db.invitation.updateMany({
    where: { id: invitationId, reminderCount: reminderBaseCount },
    data: {
      status: "SENT",
      lastReminderAt: acceptedAt,
      reminderCount: { increment: 1 },
      failedAt: null,
    },
  });
}

async function revokeToken(tokenId: string) {
  await db.invitationToken.updateMany({
    where: { id: tokenId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function revokeOtherManagementTokens(
  invitationId: string,
  activeTokenId: string,
) {
  await db.invitationToken.updateMany({
    where: {
      invitationId,
      type: "MANAGEMENT",
      id: { not: activeTokenId },
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
}
