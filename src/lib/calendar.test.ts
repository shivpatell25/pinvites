import { describe, expect, it } from "vitest";

import { createGoogleCalendarUrl, createIcsCalendar } from "./calendar";

describe("calendar utilities", () => {
  it("creates a standards-shaped UTC ICS event and escapes user text", () => {
    const ics = createIcsCalendar(
      {
        uid: "event-123@pinvites.test",
        title: "Dinner, dancing & friends",
        description: "First line\nSecond; line",
        location: "The Hall, Denver",
        start: new Date("2026-10-10T23:00:00.000Z"),
        end: new Date("2026-10-11T03:00:00.000Z"),
      },
      new Date("2026-01-01T00:00:00.000Z"),
    );

    expect(ics).toContain("DTSTART:20261010T230000Z");
    expect(ics).toContain("SUMMARY:Dinner\\, dancing & friends");
    expect(ics).toContain("DESCRIPTION:First line\\nSecond\\; line");
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("uses an exclusive end date for an all-day Google Calendar link", () => {
    const url = new URL(
      createGoogleCalendarUrl({
        allDay: true,
        title: "Garden party",
        startDate: "2026-06-14",
      }),
    );

    expect(url.origin).toBe("https://calendar.google.com");
    expect(url.searchParams.get("dates")).toBe("20260614/20260615");
  });
});
