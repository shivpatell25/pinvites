import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export type GuestActivityItem = {
  id: string;
  kind: "VIEW" | "RESPONSE" | "PARTY" | "ANSWERS";
  message: string;
  occurredAt: string;
};

const activityTypes = [
  "PUBLIC_EVENT_VIEWED",
  "INVITATION_OPENED",
  "RSVP_SUBMITTED",
  "RSVP_UPDATED",
  "GUEST_ADDED",
  "GUEST_REMOVED",
  "RSVP_ANSWERS_UPDATED",
] as const;

function metadataObject(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function metadataString(value: Prisma.JsonValue | undefined) {
  return typeof value === "string" ? value : null;
}

function metadataNumber(value: Prisma.JsonValue | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function responseLabel(value: string | null) {
  if (value === "YES") return "Going";
  if (value === "MAYBE") return "Maybe";
  if (value === "NO") return "Not going";
  return "their response";
}

export async function getGuestActivity(
  eventId: string,
  take = 30,
): Promise<GuestActivityItem[]> {
  const records = await db.analyticsEvent.findMany({
    where: { eventId, type: { in: [...activityTypes] } },
    take: Math.min(Math.max(take, 1), 60),
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    include: {
      household: { select: { contactName: true, displayName: true } },
      rsvp: { select: { response: true } },
    },
  });

  return records.map((record) => {
    const metadata = metadataObject(record.metadata);
    const actor =
      record.household?.contactName ||
      record.household?.displayName ||
      "A guest";
    const response = responseLabel(
      metadataString(metadata?.response) ?? record.rsvp?.response ?? null,
    );
    let kind: GuestActivityItem["kind"] = "RESPONSE";
    let message: string;

    switch (record.type) {
      case "PUBLIC_EVENT_VIEWED":
        kind = "VIEW";
        message = "Someone viewed the public invitation";
        break;
      case "INVITATION_OPENED":
        kind = "VIEW";
        message = `${actor} viewed the invitation`;
        break;
      case "RSVP_SUBMITTED":
        message = `${actor} RSVP’d ${response}`;
        break;
      case "RSVP_UPDATED":
        message =
          metadataString(metadata?.actor) === "HOST"
            ? `Host updated ${actor}’s RSVP to ${response}`
            : `${actor} changed their RSVP to ${response}`;
        break;
      case "GUEST_ADDED": {
        kind = "PARTY";
        const count = metadataNumber(metadata?.count) ?? 1;
        message =
          metadataString(metadata?.actor) === "HOST"
            ? `Host added ${count === 1 ? "a guest" : `${count} guests`} to ${actor}’s RSVP`
            : `${actor} added ${count === 1 ? "a guest" : `${count} guests`}`;
        break;
      }
      case "GUEST_REMOVED": {
        kind = "PARTY";
        const count = metadataNumber(metadata?.count) ?? 1;
        message =
          metadataString(metadata?.actor) === "HOST"
            ? `Host removed ${count === 1 ? "a guest" : `${count} guests`} from ${actor}’s RSVP`
            : `${actor} removed ${count === 1 ? "a guest" : `${count} guests`}`;
        break;
      }
      case "RSVP_ANSWERS_UPDATED":
        kind = "ANSWERS";
        message = `${actor} updated their RSVP answers`;
        break;
      default:
        message = `${actor} updated their RSVP`;
    }
    return {
      id: record.id,
      kind,
      message,
      occurredAt: record.occurredAt.toISOString(),
    };
  });
}
