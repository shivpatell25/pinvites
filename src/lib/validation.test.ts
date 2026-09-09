import { describe, expect, it } from "vitest";

import { eventInputSchema } from "./validation";

const validEvent = {
  title: "A midsummer dinner",
  slug: "midsummer-dinner",
  subtitle: "",
  hostName: "The Hosts",
  description: "",
  details: "",
  timezone: "America/Denver",
  startsAt: new Date("2026-06-20T18:00:00.000Z"),
  endsAt: null,
  rsvpDeadline: null,
  isAllDay: false,
  isPublic: true,
  allowPlusOne: true,
  allowMaybe: true,
  partySizeLimit: 4,
  venueName: "",
  venueAddress: "",
  venueUrl: "",
  dressCode: "",
  primaryColor: null,
};

describe("eventInputSchema", () => {
  it("accepts HTTP and HTTPS venue links", () => {
    expect(
      eventInputSchema.safeParse({
        ...validEvent,
        venueUrl: "https://venue.example/visit",
      }).success,
    ).toBe(true);
  });

  it("rejects executable and non-web URL schemes", () => {
    expect(
      eventInputSchema.safeParse({
        ...validEvent,
        venueUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
    expect(
      eventInputSchema.safeParse({
        ...validEvent,
        venueUrl: "file:///etc/passwd",
      }).success,
    ).toBe(false);
  });
});
