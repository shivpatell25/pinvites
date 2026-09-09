import { createHmac } from "node:crypto";

import { hash, parseOptions, verify } from "@node-rs/argon2";

import { getServerEnvironment } from "@/lib/env";

const ARGON2_POLICY = {
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
} as const;

const MINIMUM_PASSWORD_LENGTH = 12;
const MAXIMUM_PASSWORD_LENGTH = 256;
const MAXIMUM_PASSWORD_BYTES = 1_024;

function passwordPepper(appSecret: string): Buffer {
  return createHmac("sha256", appSecret)
    .update("pinvites:admin-password-pepper:v1", "utf8")
    .digest();
}

function assertPasswordCanBeHashed(password: string): void {
  if (Buffer.byteLength(password, "utf8") > MAXIMUM_PASSWORD_BYTES) {
    throw new RangeError("Password exceeds the maximum encoded length");
  }
}

export interface PasswordStrengthResult {
  valid: boolean;
  errors: string[];
}

export function validateAdminPassword(
  password: string,
): PasswordStrengthResult {
  const errors: string[] = [];

  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    errors.push(`Use at least ${MINIMUM_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > MAXIMUM_PASSWORD_LENGTH) {
    errors.push(`Use no more than ${MAXIMUM_PASSWORD_LENGTH} characters.`);
  }
  if (password.trim().length === 0) {
    errors.push("The password cannot contain only whitespace.");
  }

  return { valid: errors.length === 0, errors };
}

export async function hashPassword(
  password: string,
  appSecret = getServerEnvironment().APP_SECRET,
): Promise<string> {
  assertPasswordCanBeHashed(password);
  return hash(password, {
    ...ARGON2_POLICY,
    secret: passwordPepper(appSecret),
  });
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
  appSecret = getServerEnvironment().APP_SECRET,
): Promise<boolean> {
  try {
    assertPasswordCanBeHashed(password);
    return await verify(encodedHash, password, {
      secret: passwordPepper(appSecret),
    });
  } catch {
    // Malformed hashes and overlong input are authentication failures, not 500s.
    return false;
  }
}

export function passwordHashNeedsUpgrade(encodedHash: string): boolean {
  try {
    const options = parseOptions(encodedHash);
    return (
      // @node-rs/argon2's documented defaults: Argon2id (2), version 0x13 (1).
      options.algorithm !== 2 ||
      options.version !== 1 ||
      options.memoryCost < ARGON2_POLICY.memoryCost ||
      options.timeCost < ARGON2_POLICY.timeCost ||
      options.parallelism < ARGON2_POLICY.parallelism ||
      options.outputLen < ARGON2_POLICY.outputLen
    );
  } catch {
    return true;
  }
}

let dummyPasswordHash: Promise<string> | undefined;

/**
 * Runs the same Argon2 verification path for unknown and known administrators,
 * reducing account-enumeration timing differences at login.
 */
export async function verifyPasswordWithoutEnumeration(
  password: string,
  encodedHash: string | null,
  appSecret = getServerEnvironment().APP_SECRET,
): Promise<boolean> {
  dummyPasswordHash ??= hashPassword(
    "pinvites-dummy-password-not-an-account",
    appSecret,
  );
  const candidateHash = encodedHash ?? (await dummyPasswordHash);
  const valid = await verifyPassword(password, candidateHash, appSecret);
  return encodedHash !== null && valid;
}
