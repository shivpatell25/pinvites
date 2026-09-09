import { createHmac } from "node:crypto";

import { getServerEnvironment } from "@/lib/env";

export function normalizeEmail(email: string): string {
  return email.trim().normalize("NFKC").toLocaleLowerCase("en-US");
}

export function normalizeIpAddress(
  ipAddress: string | null | undefined,
): string {
  const value = ipAddress?.trim();
  return value && value.length <= 64
    ? value.toLocaleLowerCase("en-US")
    : "unknown";
}

/**
 * Produces a one-way, domain-separated identifier for sensitive values such as
 * email addresses and IPs. Raw identifiers are never needed in security logs.
 */
export function hashSensitiveValue(
  value: string,
  domain: string,
  appSecret = getServerEnvironment().APP_SECRET,
): string {
  const domainKey = createHmac("sha256", appSecret)
    .update(`pinvites:${domain}:v1`, "utf8")
    .digest();

  return createHmac("sha256", domainKey).update(value, "utf8").digest("hex");
}
