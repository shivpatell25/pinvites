import { cookies } from "next/headers";

import type { AdminRole } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getServerEnvironment } from "@/lib/env";
import {
  checkLoginRateLimit,
  recordLoginFailure,
  recordLoginSuccess,
  recordRateLimitedLogin,
} from "@/lib/security/login-rate-limit";
import { hashSensitiveValue, normalizeEmail } from "@/lib/security/identity";
import {
  hashPassword,
  passwordHashNeedsUpgrade,
  verifyPasswordWithoutEnumeration,
} from "@/lib/security/password";
import {
  generateSecureToken,
  hasValidTokenShape,
  hashToken,
} from "@/lib/security/tokens";

const SESSION_ACTIVITY_WRITE_INTERVAL_MS = 5 * 60_000;

export interface AdminPrincipal {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
}

export type AdminCredentialResult =
  | { ok: true; admin: AdminPrincipal }
  | { ok: false; reason: "INVALID_CREDENTIALS" }
  | { ok: false; reason: "RATE_LIMITED"; retryAfterSeconds: number };

export interface AuthenticateAdminInput {
  email: string;
  password: string;
  ipAddress?: string | null;
}

export async function authenticateAdminCredentials(
  input: AuthenticateAdminInput,
): Promise<AdminCredentialResult> {
  const rateLimit = await checkLoginRateLimit(input);
  if (!rateLimit.allowed) {
    await recordRateLimitedLogin(input);
    return {
      ok: false,
      reason: "RATE_LIMITED",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    };
  }

  const normalizedEmail = normalizeEmail(input.email);
  const admin = await db.admin.findUnique({ where: { normalizedEmail } });
  const passwordValid = await verifyPasswordWithoutEnumeration(
    input.password,
    admin?.passwordHash ?? null,
  );

  if (!admin || !passwordValid || !admin.isActive) {
    await recordLoginFailure({
      ...input,
      ...(admin ? { adminId: admin.id } : {}),
      ...(admin && !admin.isActive
        ? { outcome: "INACTIVE_ACCOUNT" as const }
        : {}),
    });
    return { ok: false, reason: "INVALID_CREDENTIALS" };
  }

  if (passwordHashNeedsUpgrade(admin.passwordHash)) {
    const upgradedHash = await hashPassword(input.password);
    await db.admin.update({
      where: { id: admin.id },
      data: { passwordHash: upgradedHash, passwordChangedAt: new Date() },
    });
  }

  await recordLoginSuccess({ ...input, adminId: admin.id });
  return {
    ok: true,
    admin: {
      id: admin.id,
      email: admin.email,
      displayName: admin.displayName,
      role: admin.role,
    },
  };
}

export interface AdminSessionContext {
  ipAddress?: string | null;
  userAgent?: string | null;
  now?: Date;
}

export interface CreatedAdminSession {
  id: string;
  token: string;
  expiresAt: Date;
  idleExpiresAt: Date;
}

export async function createAdminSession(
  adminId: string,
  context: AdminSessionContext = {},
): Promise<CreatedAdminSession> {
  const environment = getServerEnvironment();
  const now = context.now ?? new Date();
  const expiresAt = new Date(
    now.getTime() + environment.SESSION_ABSOLUTE_TTL_HOURS * 60 * 60_000,
  );
  const idleExpiresAt = new Date(
    Math.min(
      expiresAt.getTime(),
      now.getTime() + environment.SESSION_IDLE_TTL_MINUTES * 60_000,
    ),
  );
  const { token, tokenHash } = generateSecureToken(
    "session",
    environment.APP_SECRET,
  );
  const ipAddress = context.ipAddress?.trim();
  const userAgent = context.userAgent?.trim().slice(0, 512);
  const session = await db.adminSession.create({
    data: {
      adminId,
      tokenHash,
      ...(ipAddress
        ? {
            ipHash: hashSensitiveValue(
              ipAddress,
              "admin-session-ip",
              environment.APP_SECRET,
            ),
          }
        : {}),
      ...(userAgent ? { userAgent } : {}),
      expiresAt,
      idleExpiresAt,
      lastSeenAt: now,
    },
    select: { id: true },
  });

  return { id: session.id, token, expiresAt, idleExpiresAt };
}

function sessionCookieOptions(expires: Date) {
  const environment = getServerEnvironment();
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: environment.BASE_URL.startsWith("https://"),
    path: "/",
    expires,
    priority: "high" as const,
  };
}

export async function setAdminSessionCookie(
  session: CreatedAdminSession,
): Promise<void> {
  const environment = getServerEnvironment();
  const cookieStore = await cookies();
  cookieStore.set(
    environment.SESSION_COOKIE_NAME,
    session.token,
    sessionCookieOptions(session.expiresAt),
  );
}

export async function clearAdminSessionCookie(): Promise<void> {
  const environment = getServerEnvironment();
  const cookieStore = await cookies();
  cookieStore.set(
    environment.SESSION_COOKIE_NAME,
    "",
    sessionCookieOptions(new Date(0)),
  );
}

export async function getAdminFromSessionToken(
  token: string,
  now = new Date(),
): Promise<AdminPrincipal | null> {
  if (!hasValidTokenShape(token, "session")) {
    return null;
  }

  const environment = getServerEnvironment();
  const tokenHash = hashToken(token, "session", environment.APP_SECRET);
  const session = await db.adminSession.findUnique({
    where: { tokenHash },
    include: { admin: true },
  });

  if (!session) {
    return null;
  }

  const invalid =
    session.revokedAt !== null ||
    session.expiresAt <= now ||
    session.idleExpiresAt <= now ||
    !session.admin.isActive ||
    session.createdAt < session.admin.passwordChangedAt;

  if (invalid) {
    if (session.revokedAt === null) {
      await db.adminSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: now },
      });
    }
    return null;
  }

  if (
    now.getTime() - session.lastSeenAt.getTime() >=
    SESSION_ACTIVITY_WRITE_INTERVAL_MS
  ) {
    const idleExpiresAt = new Date(
      Math.min(
        session.expiresAt.getTime(),
        now.getTime() + environment.SESSION_IDLE_TTL_MINUTES * 60_000,
      ),
    );
    await db.adminSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { lastSeenAt: now, idleExpiresAt },
    });
  }

  return {
    id: session.admin.id,
    email: session.admin.email,
    displayName: session.admin.displayName,
    role: session.admin.role,
  };
}

export async function getCurrentAdmin(): Promise<AdminPrincipal | null> {
  const environment = getServerEnvironment();
  const cookieStore = await cookies();
  const token = cookieStore.get(environment.SESSION_COOKIE_NAME)?.value;
  return token ? getAdminFromSessionToken(token) : null;
}

export async function revokeAdminSessionToken(
  token: string,
  revokedAt = new Date(),
): Promise<void> {
  if (!hasValidTokenShape(token, "session")) {
    return;
  }

  const tokenHash = hashToken(token, "session");
  await db.adminSession.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt },
  });
}

export async function logoutCurrentAdmin(): Promise<void> {
  const environment = getServerEnvironment();
  const cookieStore = await cookies();
  const token = cookieStore.get(environment.SESSION_COOKIE_NAME)?.value;
  if (token) {
    await revokeAdminSessionToken(token);
  }
  await clearAdminSessionCookie();
}

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Administrator authentication is required.");
    this.name = "AuthenticationRequiredError";
  }
}

export async function requireAdmin(): Promise<AdminPrincipal> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    throw new AuthenticationRequiredError();
  }
  return admin;
}
