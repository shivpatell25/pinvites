import { randomUUID } from "node:crypto";

interface CalendarEventBase {
  uid?: string;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  organizer?: {
    name: string;
    email: string;
  };
  sequence?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TimedCalendarEvent extends CalendarEventBase {
  allDay?: false;
  start: Date;
  end: Date;
}

export interface AllDayCalendarEvent extends CalendarEventBase {
  allDay: true;
  /** YYYY-MM-DD in the event's local calendar. */
  startDate: string;
  /** Exclusive YYYY-MM-DD end date. Defaults to the day after startDate. */
  endDate?: string;
}

export type CalendarEvent = TimedCalendarEvent | AllDayCalendarEvent;

export interface CalendarDownload {
  body: string;
  headers: Readonly<Record<string, string>>;
}

export function createIcsCalendar(
  event: CalendarEvent,
  now = new Date(),
): string {
  validateCalendarEvent(event);
  assertValidDate(now, "calendar generation time");

  const uid = event.uid?.trim() || `${randomUUID()}@pinvites`;
  if (/[\r\n]/.test(uid))
    throw new Error("Calendar UID must not contain line breaks.");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pinvites//Invitation Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(uid)}`,
    `DTSTAMP:${formatUtcDateTime(now)}`,
    `CREATED:${formatUtcDateTime(event.createdAt ?? now)}`,
    `LAST-MODIFIED:${formatUtcDateTime(event.updatedAt ?? now)}`,
    `SEQUENCE:${event.sequence ?? 0}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];

  if (event.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(event.startDate)}`);
    lines.push(
      `DTEND;VALUE=DATE:${compactDate(event.endDate ?? addCalendarDays(event.startDate, 1))}`,
    );
  } else {
    lines.push(`DTSTART:${formatUtcDateTime(event.start)}`);
    lines.push(`DTEND:${formatUtcDateTime(event.end)}`);
  }

  if (event.description?.trim())
    lines.push(`DESCRIPTION:${escapeIcsText(event.description.trim())}`);
  if (event.location?.trim())
    lines.push(`LOCATION:${escapeIcsText(event.location.trim())}`);
  if (event.url) lines.push(`URL:${safeHttpUrl(event.url)}`);
  if (event.organizer) {
    lines.push(
      `ORGANIZER;CN=${escapeIcsParameter(event.organizer.name)}:mailto:${validateEmail(event.organizer.email)}`,
    );
  }

  lines.push(
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  );
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

export function createIcsDownload(
  event: CalendarEvent,
  filename = `${event.title || "event"}.ics`,
): CalendarDownload {
  const safeFilename = calendarFilename(filename);
  return {
    body: createIcsCalendar(event),
    headers: {
      "Content-Type": "text/calendar; charset=utf-8; method=PUBLISH",
      "Content-Disposition": `attachment; filename="${safeFilename}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  };
}

export function createGoogleCalendarUrl(event: CalendarEvent): string {
  validateCalendarEvent(event);
  const parameters = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: googleCalendarDates(event),
  });
  if (event.description?.trim())
    parameters.set("details", event.description.trim());
  if (event.location?.trim()) parameters.set("location", event.location.trim());
  if (event.url) parameters.set("sprop", `website:${safeHttpUrl(event.url)}`);

  return `https://calendar.google.com/calendar/render?${parameters.toString()}`;
}

function validateCalendarEvent(event: CalendarEvent): void {
  const title = event.title.trim();
  if (!title || title.length > 500)
    throw new Error(
      "Calendar title is required and must be under 500 characters.",
    );
  if ((event.sequence ?? 0) < 0 || !Number.isInteger(event.sequence ?? 0)) {
    throw new Error("Calendar sequence must be a non-negative integer.");
  }
  if (event.createdAt) assertValidDate(event.createdAt, "createdAt");
  if (event.updatedAt) assertValidDate(event.updatedAt, "updatedAt");

  if (event.allDay) {
    validateDateOnly(event.startDate, "startDate");
    const end = event.endDate ?? addCalendarDays(event.startDate, 1);
    validateDateOnly(end, "endDate");
    if (end <= event.startDate)
      throw new Error("All-day calendar endDate must be after startDate.");
  } else {
    assertValidDate(event.start, "start");
    assertValidDate(event.end, "end");
    if (event.end.getTime() <= event.start.getTime()) {
      throw new Error("Calendar end must be after start.");
    }
  }

  if (event.url) safeHttpUrl(event.url);
  if (event.organizer) {
    if (!event.organizer.name.trim())
      throw new Error("Calendar organizer name is required.");
    validateEmail(event.organizer.email);
  }
}

function googleCalendarDates(event: CalendarEvent): string {
  if (event.allDay) {
    const endDate = event.endDate ?? addCalendarDays(event.startDate, 1);
    return `${compactDate(event.startDate)}/${compactDate(endDate)}`;
  }
  return `${formatUtcDateTime(event.start)}/${formatUtcDateTime(event.end)}`;
}

function formatUtcDateTime(value: Date): string {
  assertValidDate(value, "calendar date");
  return value
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function compactDate(value: string): string {
  validateDateOnly(value, "date");
  return value.replace(/-/g, "");
}

function validateDateOnly(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`${field} is not a valid calendar date.`);
  }
}

function addCalendarDays(value: string, days: number): string {
  validateDateOnly(value, "date");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function safeHttpUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Calendar URL must be absolute.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Calendar URL must use HTTP or HTTPS.");
  }
  return url.toString();
}

function validateEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Calendar organizer email is invalid.");
  }
  return email;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function escapeIcsParameter(value: string): string {
  const clean = value.replace(/[\r\n]+/g, " ").trim();
  return `"${clean.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Fold a content line without splitting a UTF-8 code point (RFC 5545 §3.1). */
function foldIcsLine(line: string): string {
  const segments: string[] = [];
  let current = "";

  for (const character of line) {
    const limit = segments.length === 0 ? 75 : 74;
    if (utf8Length(current + character) > limit && current) {
      segments.push(current);
      current = character;
    } else {
      current += character;
    }
  }
  segments.push(current);
  return segments.join("\r\n ");
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

function calendarFilename(value: string): string {
  const withoutExtension = value.replace(/\.ics$/i, "");
  const safe = withoutExtension
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._ -]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${safe || "event"}.ics`;
}

function assertValidDate(value: Date, field: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${field} must be a valid Date.`);
  }
}
