import { formatInTimeZone } from "date-fns-tz";

import { db } from "@/lib/db";
import { createIcsDownload, type CalendarEvent } from "@/lib/calendar";
import { verifyPublicGrant } from "@/lib/public-grants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return new Response(null, { status: 404 });
  }
  const event = await db.event.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      details: true,
      startsAt: true,
      endsAt: true,
      isAllDay: true,
      timezone: true,
      venueName: true,
      venueAddress: true,
      status: true,
      isPublic: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!event || (event.status !== "PUBLISHED" && event.status !== "CLOSED")) {
    return new Response(null, { status: 404 });
  }
  const grant = new URL(request.url).searchParams.get("grant");
  if (!event.isPublic && !verifyPublicGrant(grant, "calendar", event.id)) {
    return new Response(null, { status: 404 });
  }

  let calendarEvent: CalendarEvent;
  if (event.isAllDay) {
    const startDate = formatInTimeZone(
      event.startsAt,
      event.timezone,
      "yyyy-MM-dd",
    );
    const localEndDate = event.endsAt
      ? formatInTimeZone(event.endsAt, event.timezone, "yyyy-MM-dd")
      : null;
    calendarEvent = {
      allDay: true,
      title: event.title,
      description: [event.description, event.details]
        .filter(Boolean)
        .join("\n\n"),
      location: [event.venueName, event.venueAddress]
        .filter(Boolean)
        .join(", "),
      uid: `${event.id}@pinvites`,
      startDate,
      ...(localEndDate && localEndDate > startDate
        ? { endDate: localEndDate }
        : {}),
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  } else {
    calendarEvent = {
      title: event.title,
      description: [event.description, event.details]
        .filter(Boolean)
        .join("\n\n"),
      location: [event.venueName, event.venueAddress]
        .filter(Boolean)
        .join(", "),
      uid: `${event.id}@pinvites`,
      start: event.startsAt,
      end:
        event.endsAt ?? new Date(event.startsAt.getTime() + 2 * 60 * 60 * 1000),
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }
  const download = createIcsDownload(calendarEvent, `${event.slug}.ics`);
  await db.analyticsEvent
    .create({
      data: { eventId: event.id, type: "CALENDAR_DOWNLOADED" },
    })
    .catch(() => undefined);
  return new Response(download.body, { headers: download.headers });
}
