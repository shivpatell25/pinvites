import { describe, expect, it } from "vitest";

import {
  hashPassword,
  passwordHashNeedsUpgrade,
  validateAdminPassword,
  verifyPassword,
} from "@/lib/security/password";

const TEST_SECRET = "test-only-secret-material-that-is-at-least-32-characters";

describe("admin password security", () => {
  it("enforces a passphrase-friendly minimum without brittle composition rules", () => {
    expect(validateAdminPassword("short").valid).toBe(false);
    expect(validateAdminPassword("correct horse battery staple").valid).toBe(
      true,
    );
  });

  it("hashes with Argon2id, verifies correctly, and detects malformed hashes", async () => {
    const encoded = await hashPassword(
      "correct horse battery staple",
      TEST_SECRET,
    );

    expect(encoded).toMatch(/^\$argon2id\$/);
    expect(
      await verifyPassword(
        "correct horse battery staple",
        encoded,
        TEST_SECRET,
      ),
    ).toBe(true);
    expect(
      await verifyPassword("incorrect password", encoded, TEST_SECRET),
    ).toBe(false);
    expect(passwordHashNeedsUpgrade(encoded)).toBe(false);
    expect(passwordHashNeedsUpgrade("malformed")).toBe(true);
  });
});
