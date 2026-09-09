import { describe, expect, it } from "vitest";

import { nextPublicRsvpRateLimitState } from "./public-rsvp-rate-limit-state";

const now = new Date("2026-09-02T12:00:00.000Z");

describe("public RSVP rate limiting", () => {
  it("allows the configured number of attempts and blocks the next", () => {
    const decision = nextPublicRsvpRateLimitState({
      current: {
        attemptCount: 20,
        windowStartedAt: new Date(now.getTime() - 60_000),
        blockedUntil: null,
      },
      now,
      windowMilliseconds: 600_000,
      maximumAttempts: 20,
      blockMilliseconds: 600_000,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.next.attemptCount).toBe(21);
    expect(decision.retryAfterSeconds).toBe(600);
  });

  it("starts a clean window after an expired block", () => {
    const decision = nextPublicRsvpRateLimitState({
      current: {
        attemptCount: 21,
        windowStartedAt: new Date(now.getTime() - 60_000),
        blockedUntil: new Date(now.getTime() - 1_000),
      },
      now,
      windowMilliseconds: 600_000,
      maximumAttempts: 20,
      blockMilliseconds: 600_000,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.next.attemptCount).toBe(1);
    expect(decision.next.windowStartedAt).toEqual(now);
  });
});
