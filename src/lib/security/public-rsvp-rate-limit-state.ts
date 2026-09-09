export type PublicRsvpRateLimitBucketState = {
  attemptCount: number;
  windowStartedAt: Date;
  blockedUntil: Date | null;
};

export type RateLimitConsumption = {
  allowed: boolean;
  retryAfterSeconds: number;
  next: PublicRsvpRateLimitBucketState;
};

export function nextPublicRsvpRateLimitState({
  current,
  now,
  windowMilliseconds,
  maximumAttempts,
  blockMilliseconds,
}: {
  current: PublicRsvpRateLimitBucketState | null;
  now: Date;
  windowMilliseconds: number;
  maximumAttempts: number;
  blockMilliseconds: number;
}): RateLimitConsumption {
  if (current?.blockedUntil && current.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((current.blockedUntil.getTime() - now.getTime()) / 1_000),
      ),
      next: current,
    };
  }

  const reset =
    !current ||
    Boolean(current.blockedUntil) ||
    current.windowStartedAt.getTime() + windowMilliseconds <= now.getTime();
  const attemptCount = reset ? 1 : current.attemptCount + 1;
  const allowed = attemptCount <= maximumAttempts;
  const blockedUntil = allowed
    ? null
    : new Date(now.getTime() + blockMilliseconds);

  return {
    allowed,
    retryAfterSeconds: blockedUntil
      ? Math.max(1, Math.ceil((blockedUntil.getTime() - now.getTime()) / 1_000))
      : 0,
    next: {
      attemptCount,
      windowStartedAt: reset ? now : current.windowStartedAt,
      blockedUntil,
    },
  };
}
