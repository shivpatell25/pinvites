import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { getServerEnvironment } from "@/lib/env";

type GrantPurpose = "artwork" | "calendar";

function signature(purpose: GrantPurpose, subject: string, expiresAt: number) {
  return createHmac("sha256", getServerEnvironment().APP_SECRET)
    .update(
      `pinvites:public-grant:${purpose}:v1\0${subject}\0${expiresAt}`,
      "utf8",
    )
    .digest("base64url");
}

/** Creates a short-lived bearer grant without exposing an invitation or management token. */
export function createPublicGrant(
  purpose: GrantPurpose,
  subject: string,
  lifetimeSeconds = 6 * 60 * 60,
) {
  const expiresAt = Math.floor(Date.now() / 1000) + lifetimeSeconds;
  return `${expiresAt}.${signature(purpose, subject, expiresAt)}`;
}

export function verifyPublicGrant(
  grant: string | null,
  purpose: GrantPurpose,
  subject: string,
) {
  if (!grant || grant.length > 180) return false;
  const separator = grant.indexOf(".");
  if (separator < 1) return false;
  const expiresText = grant.slice(0, separator);
  const expiresAt = Number(expiresText);
  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt < Math.floor(Date.now() / 1000)
  )
    return false;
  // Grants are intentionally short-lived even if a caller attempts to forge a distant timestamp.
  if (expiresAt > Math.floor(Date.now() / 1000) + 24 * 60 * 60) return false;
  const provided = Buffer.from(grant.slice(separator + 1), "base64url");
  const expected = Buffer.from(
    signature(purpose, subject, expiresAt),
    "base64url",
  );
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}
