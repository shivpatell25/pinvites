import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { eventAccessWhere } from "@/lib/admin-authorization";
import { createGuestCsvDownload } from "@/lib/csv";
import { db } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const admin = await requireAdmin();
  const { eventId } = await params;
  const event = await db.event.findFirst({
    where: eventAccessWhere(admin, eventId),
    select: { slug: true },
  });
  if (!event) return new NextResponse("Not found", { status: 404 });
  const households = await db.household.findMany({
    where: { eventId, archivedAt: null },
    orderBy: { displayName: "asc" },
    include: { invitation: true, rsvp: { include: { attendees: true } } },
  });
  const download = createGuestCsvDownload(
    households.map((household) => ({
      name: household.contactName,
      email: household.contactEmail,
      phone: household.contactPhone,
      partyName: household.displayName,
      maxPartySize: household.partySizeLimit,
      allowPlusOne: household.allowPlusOne,
      tags: household.tags,
      notes: household.notes,
      response: household.rsvp?.response ?? null,
      confirmedAttendees:
        household.rsvp?.attendees.filter(
          (attendee) => attendee.status === "CONFIRMED",
        ).length ?? 0,
      invitationSentAt: household.invitation?.sentAt ?? null,
      invitationLinkOpenedAt: household.invitation?.firstOpenedAt ?? null,
      respondedAt: household.invitation?.respondedAt ?? null,
    })),
    `${event.slug}-guests.csv`,
  );
  return new NextResponse(download.body, { headers: download.headers });
}
