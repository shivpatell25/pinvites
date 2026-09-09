import { describe, expect, it } from "vitest";

import { EnvironmentValidationError, parseServerEnvironment } from "@/lib/env";

const VALID_ENVIRONMENT = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://pinvites:secret@db:5432/pinvites",
  BASE_URL: "https://invites.example.com/path-is-normalized",
  APP_SECRET: "test-only-secret-material-that-is-at-least-32-characters",
};

describe("server environment validation", () => {
  it("normalizes the canonical base origin and applies secure defaults", () => {
    const environment = parseServerEnvironment(VALID_ENVIRONMENT);
    expect(environment.BASE_URL).toBe("https://invites.example.com");
    expect(environment.SESSION_COOKIE_NAME).toBe("pinvites_session");
    expect(environment.LOGIN_RATE_LIMIT_MAX_ATTEMPTS).toBe(5);
  });

  it("rejects non-PostgreSQL databases, weak secrets, and production HTTP", () => {
    expect(() =>
      parseServerEnvironment({
        ...VALID_ENVIRONMENT,
        DATABASE_URL: "sqlite:./data.db",
        APP_SECRET: "weak",
        BASE_URL: "http://invites.example.com",
      }),
    ).toThrow(EnvironmentValidationError);
  });
});
