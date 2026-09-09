import { describe, expect, it } from "vitest";

import {
  assertCsrfSafeRequest,
  createCsrfToken,
  InvalidRequestOriginError,
  isTrustedRequestOrigin,
  verifyCsrfToken,
} from "@/lib/security/csrf";

const TEST_SECRET = "test-only-secret-material-that-is-at-least-32-characters";
const ORIGIN_OPTIONS = {
  baseUrl: "https://invites.example.com",
  trustedOrigins: ["https://admin.example.com"],
} as const;

describe("CSRF protection", () => {
  it("accepts configured same-site and explicitly trusted origins", () => {
    expect(
      isTrustedRequestOrigin(
        new Headers({
          origin: "https://invites.example.com",
          "sec-fetch-site": "same-origin",
        }),
        ORIGIN_OPTIONS,
      ),
    ).toBe(true);
    expect(
      isTrustedRequestOrigin(
        new Headers({
          origin: "https://admin.example.com",
          "sec-fetch-site": "same-site",
        }),
        ORIGIN_OPTIONS,
      ),
    ).toBe(true);
  });

  it("rejects missing, malformed, and cross-site origins", () => {
    expect(isTrustedRequestOrigin(new Headers(), ORIGIN_OPTIONS)).toBe(false);
    expect(
      isTrustedRequestOrigin(
        new Headers({
          origin: "https://evil.example",
          "sec-fetch-site": "cross-site",
        }),
        ORIGIN_OPTIONS,
      ),
    ).toBe(false);
    expect(() =>
      assertCsrfSafeRequest(
        {
          method: "POST",
          headers: new Headers({ origin: "https://evil.example" }),
        },
        ORIGIN_OPTIONS,
      ),
    ).toThrow(InvalidRequestOriginError);
  });

  it("allows safe reads and verifies optional session-bound form tokens", () => {
    expect(() =>
      assertCsrfSafeRequest(
        { method: "GET", headers: new Headers() },
        ORIGIN_OPTIONS,
      ),
    ).not.toThrow();

    const token = createCsrfToken("pvs_session-token", TEST_SECRET);
    expect(verifyCsrfToken(token, "pvs_session-token", TEST_SECRET)).toBe(true);
    expect(verifyCsrfToken(token, "pvs_other-session", TEST_SECRET)).toBe(
      false,
    );
  });
});
