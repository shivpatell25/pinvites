import { describe, expect, it } from "vitest";

import { authorizedPartySizeLimit } from "./party-size";

describe("authorizedPartySizeLimit", () => {
  it("uses the configured event maximum for public RSVPs", () => {
    expect(
      authorizedPartySizeLimit({
        accessKind: "PUBLIC",
        partySizeLimit: 6,
        allowPlusOne: false,
        namedGuestCount: 0,
      }),
    ).toBe(6);
  });

  it("limits a personalized RSVP without plus-ones to named guests", () => {
    expect(
      authorizedPartySizeLimit({
        accessKind: "PERSONALIZED",
        partySizeLimit: 6,
        allowPlusOne: false,
        namedGuestCount: 2,
      }),
    ).toBe(2);
  });

  it("allows a personalized household to use its full cap with plus-ones", () => {
    expect(
      authorizedPartySizeLimit({
        accessKind: "PERSONALIZED",
        partySizeLimit: 4,
        allowPlusOne: true,
        namedGuestCount: 1,
      }),
    ).toBe(4);
  });
});
