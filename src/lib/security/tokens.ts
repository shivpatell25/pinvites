import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { getServerEnvironment } from "@/lib/env";

export type TokenPurpose =
  "invitation" | "management" | "session" | "csrf" | "admin-invite";

const TOKEN_PREFIX: Record<TokenPurpose, string> = {
  invitation: "pvi",
  management: "pvm",
  session: "pvs",
  csrf: "pvc",
  "admin-invite": "pva",
};

const MINIMUM_RANDOM_BYTES = 32;
const TOKEN_PATTERN = /^(pvi|pvm|pvs|pvc|pva)_[A-Za-z0-9_-]{43,}$/;

function purposeKey(purpose: TokenPurpose, appSecret: string): Buffer {
  return createHmac("sha256", appSecret)
    .update(`pinvites:opaque-token:${purpose}:v1`, "utf8")
    .digest();
}

export function hashToken(
  token: string,
  purpose: TokenPurpose,
  appSecret = getServerEnvironment().APP_SECRET,
): string {
  return createHmac("sha256", purposeKey(purpose, appSecret))
    .update(token, "utf8")
    .digest("hex");
}

export interface GeneratedSecureToken {
  /** The only value that may be sent to a browser or email; never persist it. */
  token: string;
  /** Persist this deterministic HMAC digest and use it for indexed lookups. */
  tokenHash: string;
}

export function generateSecureToken(
  purpose: TokenPurpose,
  appSecret = getServerEnvironment().APP_SECRET,
  randomByteLength = MINIMUM_RANDOM_BYTES,
): GeneratedSecureToken {
  if (
    !Number.isSafeInteger(randomByteLength) ||
    randomByteLength < MINIMUM_RANDOM_BYTES
  ) {
    throw new RangeError(
      `Secure tokens require at least ${MINIMUM_RANDOM_BYTES} random bytes`,
    );
  }

  const token = `${TOKEN_PREFIX[purpose]}_${randomBytes(randomByteLength).toString("base64url")}`;
  return { token, tokenHash: hashToken(token, purpose, appSecret) };
}

export function hasValidTokenShape(
  token: string,
  purpose?: TokenPurpose,
): boolean {
  if (!TOKEN_PATTERN.test(token) || token.length > 256) {
    return false;
  }

  return purpose === undefined || token.startsWith(`${TOKEN_PREFIX[purpose]}_`);
}

export function constantTimeHexEqual(left: string, right: string): boolean {
  if (!/^[a-f\d]+$/i.test(left) || !/^[a-f\d]+$/i.test(right)) {
    return false;
  }

  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

export function verifyTokenHash(
  token: string,
  expectedHash: string,
  purpose: TokenPurpose,
  appSecret = getServerEnvironment().APP_SECRET,
): boolean {
  if (!hasValidTokenShape(token, purpose)) {
    return false;
  }

  return constantTimeHexEqual(
    hashToken(token, purpose, appSecret),
    expectedHash,
  );
}
