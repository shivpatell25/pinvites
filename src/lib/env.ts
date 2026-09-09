import { z } from "zod";

const integerFromEnvironment = (minimum: number, maximum: number) =>
  z.coerce.number().int().min(minimum).max(maximum);

const booleanFromEnvironment = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const optionalCsv = z
  .string()
  .optional()
  .transform((value) =>
    value
      ? value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
  );

export const serverEnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z
      .string()
      .min(1)
      .refine(
        (value) =>
          value.startsWith("postgresql://") || value.startsWith("postgres://"),
        "must be a PostgreSQL connection URL",
      ),
    BASE_URL: z.url().transform((value) => new URL(value).origin),
    APP_SECRET: z
      .string()
      .min(
        32,
        "must contain at least 32 characters of high-entropy secret material",
      ),
    MEDIA_ROOT: z.string().min(1).default("./data/media"),
    MAX_UPLOAD_MB: integerFromEnvironment(1, 50).default(15),
    SESSION_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default("pinvites_session"),
    SESSION_ABSOLUTE_TTL_HOURS: integerFromEnvironment(1, 24 * 30).default(168),
    SESSION_IDLE_TTL_MINUTES: integerFromEnvironment(5, 24 * 60).default(1_440),
    LOGIN_RATE_LIMIT_WINDOW_MINUTES: integerFromEnvironment(1, 60).default(15),
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS: integerFromEnvironment(2, 50).default(5),
    LOGIN_RATE_LIMIT_BLOCK_MINUTES: integerFromEnvironment(1, 24 * 60).default(
      30,
    ),
    RSVP_RATE_LIMIT_WINDOW_MINUTES: integerFromEnvironment(1, 60).default(10),
    RSVP_RATE_LIMIT_MAX_ATTEMPTS: integerFromEnvironment(2, 100).default(20),
    RSVP_RATE_LIMIT_BLOCK_MINUTES: integerFromEnvironment(1, 24 * 60).default(
      10,
    ),
    TRUSTED_ORIGINS: optionalCsv,
    TRUST_PROXY_HEADERS: booleanFromEnvironment,
  })
  .superRefine((environment, context) => {
    if (
      environment.NODE_ENV === "production" &&
      !environment.BASE_URL.startsWith("https://")
    ) {
      context.addIssue({
        code: "custom",
        message: "must use HTTPS in production",
        path: ["BASE_URL"],
      });
    }

    for (const [index, origin] of environment.TRUSTED_ORIGINS.entries()) {
      try {
        const parsed = new URL(origin);
        if (parsed.origin !== origin) {
          throw new Error("not an origin");
        }
      } catch {
        context.addIssue({
          code: "custom",
          message: "must contain only comma-separated URL origins",
          path: ["TRUSTED_ORIGINS", index],
        });
      }
    }
  });

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export class EnvironmentValidationError extends Error {
  readonly issues: readonly string[];

  constructor(error: z.ZodError) {
    const issues = error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "environment";
      return `${path}: ${issue.message}`;
    });

    super(`Invalid Pinvites server environment:\n- ${issues.join("\n- ")}`);
    this.name = "EnvironmentValidationError";
    this.issues = issues;
  }
}

let cachedEnvironment: ServerEnvironment | undefined;

export function parseServerEnvironment(
  source: NodeJS.ProcessEnv | Record<string, string | undefined>,
): ServerEnvironment {
  const result = serverEnvironmentSchema.safeParse(source);
  if (!result.success) {
    throw new EnvironmentValidationError(result.error);
  }

  return result.data;
}

export function getServerEnvironment(): ServerEnvironment {
  cachedEnvironment ??= parseServerEnvironment(process.env);
  return cachedEnvironment;
}

/** Only intended for isolated tests that replace process.env. */
export function resetServerEnvironmentCache(): void {
  cachedEnvironment = undefined;
}
