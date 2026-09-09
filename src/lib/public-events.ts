import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { authorizedPartySizeLimit } from "@/lib/party-size";
import { createPublicGrant } from "@/lib/public-grants";
import { toDraftAnswerValue } from "@/lib/rsvp-draft";
import { hashToken, hasValidTokenShape } from "@/lib/security/tokens";
import type {
  AnswerDraft,
  PublicEvent,
  PublicQuestion,
  RsvpAccess,
  RsvpDraft,
} from "@/components/public/types";

const publicEventInclude = {
  heroArtwork: true,
  mealOptions: {
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  },
  questions: {
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      options: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
      conditions: { orderBy: [{ sortOrder: "asc" }] },
    },
  },
} satisfies Prisma.EventInclude;

const invitationInclude = {
  invitation: {
    include: {
      household: {
        include: {
          guests: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
          rsvp: {
            include: {
              attendees: {
                orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
              },
              answers: { include: { options: true } },
            },
          },
          event: { include: publicEventInclude },
        },
      },
    },
  },
} satisfies Prisma.InvitationTokenInclude;

type PublicEventRecord = Prisma.EventGetPayload<{
  include: typeof publicEventInclude;
}>;
type TokenRecord = Prisma.InvitationTokenGetPayload<{
  include: typeof invitationInclude;
}>;
type RsvpRecord = NonNullable<TokenRecord["invitation"]["household"]["rsvp"]>;

function acceptingResponses(
  event: Pick<PublicEventRecord, "status" | "rsvpDeadline">,
) {
  return (
    event.status === "PUBLISHED" &&
    (!event.rsvpDeadline || event.rsvpDeadline.getTime() >= Date.now())
  );
}

function artworkUrl(event: PublicEventRecord) {
  if (!event.heroArtwork) return null;
  const encodedKey = event.heroArtwork.storageKey
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  const base = `/media/${event.heroArtwork.id}/${encodedKey}`;
  if (event.isPublic) return base;
  const subject = `${event.heroArtwork.id}\0${event.heroArtwork.storageKey}`;
  return `${base}?grant=${encodeURIComponent(createPublicGrant("artwork", subject))}`;
}

function mapQuestionKind(
  kind: PublicEventRecord["questions"][number]["type"],
): PublicQuestion["kind"] {
  switch (kind) {
    case "SHORT_TEXT":
      return "SHORT_TEXT";
    case "LONG_TEXT":
      return "LONG_TEXT";
    case "SINGLE_SELECT":
      return "SINGLE_CHOICE";
    case "MULTI_SELECT":
      return "MULTIPLE_CHOICE";
    case "BOOLEAN":
      return "BOOLEAN";
  }
}

function mapEvent(event: PublicEventRecord): PublicEvent {
  const calendarBase = `/e/${encodeURIComponent(event.slug)}/calendar.ics`;
  return {
    id: event.id,
    slug: event.slug,
    isPublic: event.isPublic,
    title: event.title,
    subtitle: event.subtitle,
    hostName: event.hostName,
    description: event.description,
    details:
      [event.details, event.dressCode ? `Dress code: ${event.dressCode}` : null]
        .filter(Boolean)
        .join("\n\n") || null,
    artworkUrl: artworkUrl(event),
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt?.toISOString() ?? null,
    isAllDay: event.isAllDay,
    timezone: event.timezone,
    venueName: event.venueName,
    venueAddress: event.venueAddress,
    venueUrl: event.venueUrl,
    primaryColor: event.primaryColor,
    rsvpDeadline: event.rsvpDeadline?.toISOString() ?? null,
    status: acceptingResponses(event) ? "PUBLISHED" : "CLOSED",
    allowMaybe: event.allowMaybe,
    partySizeLimit: event.partySizeLimit,
    calendarUrl: event.isPublic
      ? calendarBase
      : `${calendarBase}?grant=${encodeURIComponent(createPublicGrant("calendar", event.id))}`,
    mealOptions: event.mealOptions.map((meal) => ({
      id: meal.id,
      name: meal.name,
      description: meal.description,
    })),
    questions: event.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      description: question.helpText,
      kind: mapQuestionKind(question.type),
      scope: question.scope,
      required: question.isRequired,
      visibleForResponses: question.visibleForResponses,
      options: question.options.map((option) => ({
        id: option.id,
        label: option.label,
      })),
      conditions: question.conditions.map((condition) => ({
        sourceQuestionId: condition.sourceQuestionId,
        operator: condition.operator,
        optionId: condition.optionId,
        textValue: condition.textValue,
        booleanValue: condition.booleanValue,
      })),
    })),
  };
}

function mapExistingRsvp(
  rsvp: RsvpRecord,
  household: TokenRecord["invitation"]["household"],
): RsvpDraft {
  const questionsById = new Map(
    household.event.questions.map((question) => [question.id, question]),
  );
  const answers: AnswerDraft[] = rsvp.answers.map((answer) => {
    const question = questionsById.get(answer.questionId);
    const optionIds = answer.options.map((option) => option.optionId);

    return {
      questionId: answer.questionId,
      subjectKey: answer.attendeeId ?? "household",
      value: toDraftAnswerValue({
        questionType: question?.type,
        optionIds,
        booleanValue: answer.booleanValue,
        textValue: answer.textValue,
      }),
    };
  });
  return {
    response: rsvp.response,
    contactName: household.contactName,
    contactEmail: rsvp.contactEmail ?? household.contactEmail ?? "",
    attendees: rsvp.attendees.map((attendee) => ({
      key: attendee.id,
      guestId: attendee.guestId,
      fullName: attendee.fullName,
      mealOptionId: attendee.mealOptionId ?? "",
      dietaryRestrictions: attendee.dietaryRestrictions ?? "",
    })),
    answers,
    message: rsvp.message ?? "",
    revision: rsvp.revision,
  };
}

function tokenIsUsable(record: TokenRecord) {
  return (
    !record.revokedAt &&
    !record.invitation.revokedAt &&
    (!record.expiresAt || record.expiresAt.getTime() > Date.now())
  );
}

export async function getPublicEvent(
  slug: string,
  options: { trackView?: boolean } = {},
): Promise<{ event: PublicEvent; access: RsvpAccess } | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const event = await db.event.findUnique({
    where: { slug },
    include: publicEventInclude,
  });
  if (
    !event ||
    !event.isPublic ||
    (event.status !== "PUBLISHED" && event.status !== "CLOSED")
  ) {
    return null;
  }
  if (options.trackView !== false) {
    await db.analyticsEvent
      .create({
        data: { eventId: event.id, type: "PUBLIC_EVENT_VIEWED" },
      })
      .catch(() => undefined);
  }
  return {
    event: mapEvent(event),
    access: {
      kind: "PUBLIC",
      token: null,
      householdName: null,
      partySizeLimit: authorizedPartySizeLimit({
        accessKind: "PUBLIC",
        partySizeLimit: event.partySizeLimit,
        allowPlusOne: event.allowPlusOne,
        namedGuestCount: 0,
      }),
      canRespond: acceptingResponses(event),
      members: [],
      initialRsvp: null,
    },
  };
}

export async function getPersonalInvitation(
  rawToken: string,
  kind: "INVITATION" | "MANAGEMENT",
  source?: "qr",
): Promise<{ event: PublicEvent; access: RsvpAccess } | null> {
  const purpose = kind === "INVITATION" ? "invitation" : "management";
  if (!hasValidTokenShape(rawToken, purpose)) return null;
  const record = await db.invitationToken.findUnique({
    where: { tokenHash: hashToken(rawToken, purpose) },
    include: invitationInclude,
  });
  if (!record || record.type !== kind || !tokenIsUsable(record)) return null;
  const { invitation } = record;
  const { household } = invitation;
  if (household.archivedAt) return null;
  const { event } = household;
  if (event.status !== "PUBLISHED" && event.status !== "CLOSED") return null;

  const now = new Date();
  await db.$transaction(async (transaction) => {
    await transaction.invitationToken.update({
      where: { id: record.id },
      data: { lastUsedAt: now },
    });
    if (kind !== "INVITATION") return;
    await transaction.invitation.update({
      where: { id: invitation.id },
      data: {
        firstOpenedAt: invitation.firstOpenedAt ?? now,
        lastOpenedAt: now,
        openCount: { increment: 1 },
      },
    });
    await transaction.analyticsEvent.create({
      data: {
        eventId: event.id,
        householdId: household.id,
        invitationId: invitation.id,
        type: "INVITATION_OPENED",
      },
    });
    if (source === "qr") {
      await transaction.analyticsEvent.create({
        data: {
          eventId: event.id,
          householdId: household.id,
          invitationId: invitation.id,
          type: "QR_CODE_OPENED",
        },
      });
    }
  });

  const existingRsvp = household.rsvp;
  const canRespond =
    acceptingResponses(event) &&
    (kind === "MANAGEMENT" ? Boolean(existingRsvp) : !existingRsvp);
  return {
    event: mapEvent(event),
    access: {
      kind,
      token: rawToken,
      householdName: household.displayName,
      partySizeLimit: authorizedPartySizeLimit({
        accessKind: "PERSONALIZED",
        partySizeLimit: household.partySizeLimit,
        allowPlusOne: household.allowPlusOne,
        namedGuestCount: household.guests.length,
      }),
      canRespond,
      members: household.guests.map((guest) => ({
        guestId: guest.id,
        fullName: guest.fullName,
      })),
      initialRsvp:
        kind === "MANAGEMENT" && existingRsvp
          ? mapExistingRsvp(existingRsvp, household)
          : null,
    },
  };
}
