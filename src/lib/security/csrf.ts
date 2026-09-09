import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { getServerEnvironment } from "@/lib/env";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,}\.[a-f\d]{64}$/i;

function canonicalOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export interface OriginValidationOptions {
  baseUrl?: string;
  trustedOrigins?: readonly string[];
}

export function isTrustedRequestOrigin(
  headers: Headers,
  options: OriginValidationOptions = {},
): boolean {
  const needsEnvironment =
    options.baseUrl === undefined || options.trustedOrigins === undefined;
  const environment = needsEnvironment ? getServerEnvironment() : null;
  const originHeader = headers.get("origin");
  const origin = originHeader ? canonicalOrigin(originHeader) : null;
  if (!origin) {
    return false;
  }

  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    return false;
  }

  const baseOrigin = canonicalOrigin(
    options.baseUrl ?? environment?.BASE_URL ?? "",
  );
  const trustedOrigins =
    options.trustedOrigins ?? environment?.TRUSTED_ORIGINS ?? [];
  return (
    origin === baseOrigin ||
    trustedOrigins.some((allowed) => origin === canonicalOrigin(allowed))
  );
}

export class InvalidRequestOriginError extends Error {
  constructor() {
    super("The request origin is not allowed.");
    this.name = "InvalidRequestOriginError";
  }
}

export function assertCsrfSafeRequest(
  request: Pick<Request, "headers" | "method">,
  options?: OriginValidationOptions,
): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) {
    return;
  }

  if (!isTrustedRequestOrigin(request.headers, options)) {
    throw new InvalidRequestOriginError();
  }
}

function csrfSigningKey(sessionToken: string, appSecret: string): Buffer {
  return createHmac("sha256", appSecret)
    .update("pinvites:csrf:v1\0", "utf8")
    .update(sessionToken, "utf8")
    .digest();
}

/** Creates an optional session-bound token for non-Server-Action forms. */
export function createCsrfToken(
  sessionToken: string,
  appSecret = getServerEnvironment().APP_SECRET,
): string {
  const nonce = randomBytes(24).toString("base64url");
  const signature = createHmac(
    "sha256",
    csrfSigningKey(sessionToken, appSecret),
  )
    .update(nonce, "utf8")
    .digest("hex");
  return `${nonce}.${signature}`;
}

export function verifyCsrfToken(
  token: string,
  sessionToken: string,
  appSecret = getServerEnvironment().APP_SECRET,
): boolean {
  if (!CSRF_TOKEN_PATTERN.test(token) || token.length > 256) {
    return false;
  }

  const separator = token.lastIndexOf(".");
  const nonce = token.slice(0, separator);
  const provided = Buffer.from(token.slice(separator + 1), "hex");
  const expected = createHmac("sha256", csrfSigningKey(sessionToken, appSecret))
    .update(nonce, "utf8")
    .digest();

  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}
