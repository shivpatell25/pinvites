import { headers } from "next/headers";

import { getServerEnvironment } from "@/lib/env";

function headerAddress(value: string | null) {
  const address = value?.trim();
  return address && address.length <= 64 ? address : null;
}

/** Resolve only headers supplied or overwritten by the deployment's trusted edge. */
export function trustedClientIp(requestHeaders: Headers) {
  const realIp = headerAddress(requestHeaders.get("x-real-ip"));
  if (realIp) return realIp;
  const cloudflareIp = headerAddress(requestHeaders.get("cf-connecting-ip"));
  if (cloudflareIp) return cloudflareIp;
  const forwarded = requestHeaders
    .get("x-forwarded-for")
    ?.split(",")
    .map((value) => headerAddress(value))
    .filter((value): value is string => Boolean(value));
  return forwarded?.at(-1) ?? null;
}

export async function requestContext() {
  const requestHeaders = await headers();
  const environment = getServerEnvironment();
  const ipAddress = environment.TRUST_PROXY_HEADERS
    ? trustedClientIp(requestHeaders)
    : null;

  return {
    ipAddress,
    userAgent: requestHeaders.get("user-agent")?.slice(0, 512) ?? null,
  };
}
