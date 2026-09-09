import { db } from "@/lib/db";
import { getServerEnvironment } from "@/lib/env";
import { nextPublicRsvpRateLimitState } from "@/lib/security/public-rsvp-rate-limit-state";

function retryable(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return error.code === "P2002" || error.code === "P2034";
}

export async function consumePublicRsvpRateLimit(
  keyHash: string,
  now = new Date(),
) {
  const environment = getServerEnvironment();
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await db.$transaction(
        async (transaction) => {
          const current =
            await transaction.publicRsvpRateLimitBucket.findUnique({
              where: { keyHash },
            });
          const decision = nextPublicRsvpRateLimitState({
            current,
            now,
            windowMilliseconds:
              environment.RSVP_RATE_LIMIT_WINDOW_MINUTES * 60_000,
            maximumAttempts: environment.RSVP_RATE_LIMIT_MAX_ATTEMPTS,
            blockMilliseconds:
              environment.RSVP_RATE_LIMIT_BLOCK_MINUTES * 60_000,
          });
          if (decision.next !== current) {
            await transaction.publicRsvpRateLimitBucket.upsert({
              where: { keyHash },
              create: { keyHash, ...decision.next },
              update: decision.next,
            });
          }
          return {
            allowed: decision.allowed,
            retryAfterSeconds: decision.retryAfterSeconds,
          };
        },
        { isolationLevel: "Serializable" },
      );

      const retentionBoundary = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
      await db.publicRsvpRateLimitBucket
        .deleteMany({
          where: {
            updatedAt: { lt: retentionBoundary },
            OR: [{ blockedUntil: null }, { blockedUntil: { lt: now } }],
          },
        })
        .catch(() => undefined);
      return result;
    } catch (error) {
      if (!retryable(error) || attempt === 2) throw error;
      lastError = error;
    }
  }

  throw lastError;
}
