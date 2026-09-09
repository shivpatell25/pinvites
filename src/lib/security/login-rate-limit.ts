import {
  LoginAttemptOutcome,
  Prisma,
  RateLimitScope,
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getServerEnvironment } from "@/lib/env";
import {
  hashSensitiveValue,
  normalizeEmail,
  normalizeIpAddress,
} from "@/lib/security/identity";

export interface LoginIdentity {
  email: string;
  ipAddress?: string | null;
}

export interface LoginRateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface RateLimitKey {
  scope: RateLimitScope;
  keyHash: string;
}

export function deriveLoginRateLimitKeys(
  identity: LoginIdentity,
  appSecret = getServerEnvironment().APP_SECRET,
): readonly [RateLimitKey, RateLimitKey] {
  const normalizedEmail = normalizeEmail(identity.email);
  const normalizedIp = normalizeIpAddress(identity.ipAddress);

  return [
    {
      scope: RateLimitScope.EMAIL,
      keyHash: hashSensitiveValue(normalizedEmail, "login-email", appSecret),
    },
    {
      scope: RateLimitScope.IP,
      keyHash: hashSensitiveValue(normalizedIp, "login-ip", appSecret),
    },
  ];
}

function activeBucketKeys(identity: LoginIdentity): readonly RateLimitKey[] {
  const keys = deriveLoginRateLimitKeys(identity);
  // Treating every request with an unavailable address as one global IP would
  // let a handful of failures lock every administrator out. The per-email
  // bucket remains active; deployments can opt into proxy headers explicitly.
  return normalizeIpAddress(identity.ipAddress) === "unknown"
    ? [keys[0]]
    : keys;
}

function secondsUntil(date: Date, now: Date): number {
  return Math.max(1, Math.ceil((date.getTime() - now.getTime()) / 1_000));
}

export async function checkLoginRateLimit(
  identity: LoginIdentity,
  now = new Date(),
): Promise<LoginRateLimitDecision> {
  const environment = getServerEnvironment();
  const keys = activeBucketKeys(identity);
  const buckets = await db.loginRateLimitBucket.findMany({
    where: {
      OR: keys.map(({ scope, keyHash }) => ({ scope, keyHash })),
    },
    select: {
      blockedUntil: true,
      failureCount: true,
      windowStartedAt: true,
    },
  });

  const windowMilliseconds =
    environment.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60_000;
  let retryAfterSeconds = 0;

  for (const bucket of buckets) {
    if (bucket.blockedUntil && bucket.blockedUntil > now) {
      retryAfterSeconds = Math.max(
        retryAfterSeconds,
        secondsUntil(bucket.blockedUntil, now),
      );
      continue;
    }

    const windowEndsAt = new Date(
      bucket.windowStartedAt.getTime() + windowMilliseconds,
    );
    if (
      bucket.failureCount >= environment.LOGIN_RATE_LIMIT_MAX_ATTEMPTS &&
      windowEndsAt > now
    ) {
      retryAfterSeconds = Math.max(
        retryAfterSeconds,
        secondsUntil(windowEndsAt, now),
      );
    }
  }

  return { allowed: retryAfterSeconds === 0, retryAfterSeconds };
}

function isRetryableTransactionError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

async function inSerializableTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isRetryableTransactionError(error)) {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError;
}

export interface FailedLoginInput extends LoginIdentity {
  adminId?: string | null;
  outcome?: "INVALID_CREDENTIALS" | "INACTIVE_ACCOUNT";
  now?: Date;
}

export async function recordLoginFailure(
  input: FailedLoginInput,
): Promise<void> {
  const environment = getServerEnvironment();
  const now = input.now ?? new Date();
  const auditKeys = deriveLoginRateLimitKeys(input, environment.APP_SECRET);
  const keys = activeBucketKeys(input);
  const windowMilliseconds =
    environment.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60_000;
  const blockMilliseconds = environment.LOGIN_RATE_LIMIT_BLOCK_MINUTES * 60_000;

  await inSerializableTransaction(async (transaction) => {
    for (const key of keys) {
      const existing = await transaction.loginRateLimitBucket.findUnique({
        where: { scope_keyHash: key },
      });

      const existingBlockActive =
        existing?.blockedUntil && existing.blockedUntil > now;
      if (existingBlockActive) {
        continue;
      }

      const existingWindowActive =
        existing !== null &&
        existing !== undefined &&
        existing.windowStartedAt.getTime() + windowMilliseconds > now.getTime();
      const failureCount = existingWindowActive ? existing.failureCount + 1 : 1;
      const blockedUntil =
        failureCount >= environment.LOGIN_RATE_LIMIT_MAX_ATTEMPTS
          ? new Date(now.getTime() + blockMilliseconds)
          : null;

      await transaction.loginRateLimitBucket.upsert({
        where: { scope_keyHash: key },
        create: {
          ...key,
          failureCount,
          windowStartedAt: now,
          blockedUntil,
        },
        update: {
          failureCount,
          windowStartedAt:
            existingWindowActive && existing ? existing.windowStartedAt : now,
          blockedUntil,
        },
      });
    }

    await transaction.loginAttempt.create({
      data: {
        ...(input.adminId ? { adminId: input.adminId } : {}),
        emailHash: auditKeys[0].keyHash,
        ipHash: auditKeys[1].keyHash,
        outcome: input.outcome ?? LoginAttemptOutcome.INVALID_CREDENTIALS,
        attemptedAt: now,
      },
    });
  });
}

export interface SuccessfulLoginInput extends LoginIdentity {
  adminId: string;
  now?: Date;
}

export async function recordLoginSuccess(
  input: SuccessfulLoginInput,
): Promise<void> {
  const environment = getServerEnvironment();
  const now = input.now ?? new Date();
  const auditKeys = deriveLoginRateLimitKeys(input, environment.APP_SECRET);
  const keys = activeBucketKeys(input);

  await inSerializableTransaction(async (transaction) => {
    await transaction.loginRateLimitBucket.deleteMany({
      where: { OR: keys.map(({ scope, keyHash }) => ({ scope, keyHash })) },
    });
    await transaction.loginAttempt.create({
      data: {
        adminId: input.adminId,
        emailHash: auditKeys[0].keyHash,
        ipHash: auditKeys[1].keyHash,
        outcome: LoginAttemptOutcome.SUCCESS,
        attemptedAt: now,
      },
    });
    await transaction.admin.update({
      where: { id: input.adminId },
      data: { lastLoginAt: now },
    });
  });
}

export async function recordRateLimitedLogin(
  identity: LoginIdentity,
  now = new Date(),
): Promise<void> {
  const keys = deriveLoginRateLimitKeys(identity);
  await db.loginAttempt.create({
    data: {
      emailHash: keys[0].keyHash,
      ipHash: keys[1].keyHash,
      outcome: LoginAttemptOutcome.RATE_LIMITED,
      attemptedAt: now,
    },
  });
}
