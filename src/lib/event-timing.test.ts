import { describe, expect, it } from "vitest";

import { getEventTiming } from "./event-timing";

const event = {
  startsAt: "2026-09-18T18:00:00.000Z",
  endsAt: "2026-09-18T21:00:00.000Z",
  timezone: "UTC",
};

describe("getEventTiming", () => {
  it("formats a useful same-day countdown", () => {
    expect(
      getEventTiming(event, new Date("2026-09-18T14:48:00.000Z")),
    ).toMatchObject({
      phase: "UPCOMING",
      label: "Starts in 3h 12m",
      isEventDay: true,
    });
  });

  it("uses the starting-soon state near the start", () => {
    expect(
      getEventTiming(event, new Date("2026-09-18T17:47:00.000Z")),
    ).toMatchObject({ phase: "SOON", label: "Starting soon" });
  });

  it("distinguishes a live event from an ended event", () => {
    expect(
      getEventTiming(event, new Date("2026-09-18T19:00:00.000Z")),
    ).toMatchObject({ phase: "LIVE", label: "Happening now" });
    expect(
      getEventTiming(event, new Date("2026-09-18T22:00:00.000Z")),
    ).toMatchObject({ phase: "ENDED", label: "Event ended" });
  });

  it("uses the event timezone to determine event day", () => {
    const denverEvent = { ...event, timezone: "America/Denver" };
    expect(
      getEventTiming(denverEvent, new Date("2026-09-18T02:00:00.000Z"))
        .isEventDay,
    ).toBe(false);
  });
});
