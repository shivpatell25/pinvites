import { describe, expect, it } from "vitest";

import {
  constantTimeHexEqual,
  generateSecureToken,
  hasValidTokenShape,
  hashToken,
  verifyTokenHash,
} from "@/lib/security/tokens";

const TEST_SECRET = "test-only-secret-material-that-is-at-least-32-characters";

describe("opaque security tokens", () => {
  it("generates unique 256-bit invitation tokens and stores only a digest", () => {
    const first = generateSecureToken("invitation", TEST_SECRET);
    const second = generateSecureToken("invitation", TEST_SECRET);

    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).toHaveLength(64);
    expect(first.tokenHash).not.toContain(first.token);
    expect(hasValidTokenShape(first.token, "invitation")).toBe(true);
    expect(
      verifyTokenHash(first.token, first.tokenHash, "invitation", TEST_SECRET),
    ).toBe(true);
  });

  it("domain-separates invitation, management, and session hashes", () => {
    const { token } = generateSecureToken("invitation", TEST_SECRET);
    expect(hashToken(token, "invitation", TEST_SECRET)).not.toBe(
      hashToken(token, "management", TEST_SECRET),
    );
    expect(
      verifyTokenHash(
        token,
        hashToken(token, "invitation", TEST_SECRET),
        "management",
        TEST_SECRET,
      ),
    ).toBe(false);
  });

  it("creates a distinct one-time administrator invitation credential", () => {
    const invite = generateSecureToken("admin-invite", TEST_SECRET);

    expect(hasValidTokenShape(invite.token, "admin-invite")).toBe(true);
    expect(
      verifyTokenHash(
        invite.token,
        invite.tokenHash,
        "admin-invite",
        TEST_SECRET,
      ),
    ).toBe(true);
    expect(hashToken(invite.token, "admin-invite", TEST_SECRET)).not.toBe(
      hashToken(invite.token, "session", TEST_SECRET),
    );
  });

  it("rejects malformed and modified values", () => {
    const { token, tokenHash } = generateSecureToken("management", TEST_SECRET);
    expect(
      verifyTokenHash(`${token}x`, tokenHash, "management", TEST_SECRET),
    ).toBe(false);
    expect(hasValidTokenShape("not-a-token")).toBe(false);
    expect(constantTimeHexEqual("not-hex", "not-hex")).toBe(false);
  });
});
