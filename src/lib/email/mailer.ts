import { readFile } from "node:fs/promises";
import path from "node:path";

import nodemailer from "nodemailer";
import { z } from "zod";

import type {
  MailDeliveryLedger,
  MailDispatchResult,
  OutboundEmail,
  SmtpConfiguration,
  SmtpConfigurationState,
} from "./types";

type Environment = Readonly<Record<string, string | undefined>>;

interface ProviderResult {
  accepted?: unknown;
  rejected?: unknown;
  messageId?: unknown;
  response?: unknown;
}

interface MailTransport {
  verify(): Promise<unknown>;
  sendMail(options: Readonly<Record<string, unknown>>): Promise<ProviderResult>;
  close(): void;
}

let inlineBrandAttachmentsPromise: ReturnType<
  typeof loadInlineBrandAttachments
> | null = null;

async function loadInlineBrandAttachments() {
  const brandDirectory = path.resolve(process.cwd(), "public/brand/hotlink-ok");
  const [mark, wordmark] = await Promise.all([
    readFile(path.resolve(brandDirectory, "pinvites-mark-email.png")),
    readFile(path.resolve(brandDirectory, "pinvites-wordmark-email.png")),
  ]);
  return [
    {
      filename: "pinvites-mark.png",
      content: mark,
      contentType: "image/png",
      contentDisposition: "inline",
      cid: "pinvites-mark@pinvites",
    },
    {
      filename: "pinvites-wordmark.png",
      content: wordmark,
      contentType: "image/png",
      contentDisposition: "inline",
      cid: "pinvites-wordmark@pinvites",
    },
  ] as const;
}

function inlineBrandAttachments() {
  inlineBrandAttachmentsPromise ??= loadInlineBrandAttachments();
  return inlineBrandAttachmentsPromise;
}

const optionalTrimmedString = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalBoolean = z.preprocess((value) => {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") return value;
  const normalized = value.toLowerCase().trim();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return value;
}, z.boolean().optional());

const smtpEnvironmentSchema = z
  .object({
    SMTP_HOST: optionalTrimmedString,
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
    SMTP_SECURE: optionalBoolean,
    SMTP_USER: optionalTrimmedString,
    SMTP_PASSWORD: optionalSecret,
    SMTP_FROM: optionalTrimmedString,
    SMTP_REPLY_TO: optionalTrimmedString,
    SMTP_REQUIRE_TLS: optionalBoolean,
    SMTP_TLS_REJECT_UNAUTHORIZED: optionalBoolean,
    SMTP_CONNECTION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(120_000)
      .default(15_000),
    SMTP_GREETING_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(120_000)
      .default(15_000),
    SMTP_SOCKET_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(5_000)
      .max(300_000)
      .default(60_000),
    SMTP_MAX_CONNECTIONS: z.coerce.number().int().min(1).max(20).default(3),
    SMTP_MAX_MESSAGES_PER_CONNECTION: z.coerce
      .number()
      .int()
      .min(1)
      .max(1_000)
      .default(100),
  })
  .superRefine((value, context) => {
    if (value.SMTP_USER && !value.SMTP_PASSWORD) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SMTP_PASSWORD"],
        message: "SMTP_PASSWORD is required when SMTP_USER is set.",
      });
    }
    if (value.SMTP_PASSWORD && !value.SMTP_USER) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SMTP_USER"],
        message: "SMTP_USER is required when SMTP_PASSWORD is set.",
      });
    }
  });

const outboundEmailSchema = z.object({
  deliveryKey: z
    .string()
    .trim()
    .min(1)
    .max(191)
    .regex(/^[^\r\n]+$/),
  to: z.string().trim().email().max(320),
  email: z.object({
    subject: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .regex(/^[^\r\n]+$/),
    html: z.string().min(1).max(2_000_000),
    text: z.string().min(1).max(500_000),
  }),
});

export class MailDispatchError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly attemptId: string | null;
  readonly smtpAccepted: boolean;
  readonly originalCause: unknown;

  constructor(
    message: string,
    options: {
      code: string;
      retryable: boolean;
      attemptId?: string;
      smtpAccepted?: boolean;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "MailDispatchError";
    this.code = options.code;
    this.retryable = options.retryable;
    this.attemptId = options.attemptId ?? null;
    this.smtpAccepted = options.smtpAccepted ?? false;
    this.originalCause = options.cause;
  }
}

export class SmtpMailer {
  private readonly transport: MailTransport;

  constructor(
    private readonly configuration: SmtpConfiguration,
    private readonly ledger: MailDeliveryLedger,
  ) {
    this.transport = nodemailer.createTransport({
      host: configuration.host,
      port: configuration.port,
      secure: configuration.secure,
      requireTLS: configuration.requireTls,
      pool: true,
      maxConnections: configuration.maxConnections,
      maxMessages: configuration.maxMessagesPerConnection,
      auth:
        configuration.username && configuration.password
          ? {
              user: configuration.username,
              pass: configuration.password,
            }
          : undefined,
      tls: {
        rejectUnauthorized: configuration.rejectUnauthorized,
      },
      connectionTimeout: configuration.connectionTimeoutMs,
      greetingTimeout: configuration.greetingTimeoutMs,
      socketTimeout: configuration.socketTimeoutMs,
    }) as unknown as MailTransport;
  }

  async verify(): Promise<void> {
    try {
      await this.transport.verify();
    } catch (error) {
      const failure = classifySmtpError(error);
      throw new MailDispatchError(
        `SMTP is configured but unavailable: ${failure.message}`,
        {
          ...failure,
          cause: error,
        },
      );
    }
  }

  async send(message: OutboundEmail): Promise<MailDispatchResult> {
    const validation = outboundEmailSchema.safeParse(message);
    if (!validation.success) {
      throw new MailDispatchError("The outbound email is invalid.", {
        code: "INVALID_MESSAGE",
        retryable: false,
        cause: validation.error,
      });
    }

    const fromEmail = mailboxAddress(this.configuration.from, "SMTP_FROM");
    const replyTo = this.configuration.replyTo
      ? mailboxAddress(this.configuration.replyTo, "SMTP_REPLY_TO")
      : undefined;
    const reservation = await this.reserve(message, fromEmail, replyTo);

    if (!reservation.reserved) {
      return {
        status: "duplicate",
        attemptId: reservation.attemptId,
        reason: reservation.reason,
      };
    }

    try {
      await this.ledger.markSending(reservation.attemptId, new Date());
    } catch (error) {
      throw new MailDispatchError(
        "The delivery log is unavailable; no email was sent.",
        {
          code: "LEDGER_UNAVAILABLE",
          retryable: true,
          attemptId: reservation.attemptId,
          cause: error,
        },
      );
    }

    let providerResult: ProviderResult;
    try {
      const attachments = await inlineBrandAttachments();
      providerResult = await this.transport.sendMail({
        from: this.configuration.from,
        replyTo: this.configuration.replyTo,
        to: message.to,
        subject: message.email.subject,
        html: message.email.html,
        text: message.email.text,
        attachments,
        headers: {
          "X-Pinvites-Delivery-Key": message.deliveryKey,
        },
        disableFileAccess: true,
        disableUrlAccess: true,
      });
    } catch (error) {
      const failure = classifySmtpError(error);
      await this.recordFailure(reservation.attemptId, failure, error);
      throw new MailDispatchError(`SMTP delivery failed: ${failure.message}`, {
        ...failure,
        attemptId: reservation.attemptId,
        cause: error,
      });
    }

    const accepted = normalizeAddressList(providerResult.accepted);
    const rejected = normalizeAddressList(providerResult.rejected);
    if (accepted.length === 0) {
      const failure = {
        code: "SMTP_REJECTED",
        message: rejected.length
          ? "The SMTP server rejected the recipient."
          : "The SMTP server did not accept a recipient.",
        retryable: false,
      };
      await this.recordFailure(reservation.attemptId, failure, providerResult);
      throw new MailDispatchError(failure.message, {
        ...failure,
        attemptId: reservation.attemptId,
        cause: providerResult,
      });
    }

    const providerMessageId =
      typeof providerResult.messageId === "string" && providerResult.messageId
        ? providerResult.messageId
        : null;
    const response =
      typeof providerResult.response === "string"
        ? providerResult.response.slice(0, 1_000)
        : null;

    try {
      await this.ledger.markSent({
        attemptId: reservation.attemptId,
        providerMessageId,
        accepted,
        rejected,
        response,
        sentAt: new Date(),
      });
    } catch (error) {
      throw new MailDispatchError(
        "SMTP accepted the email, but its delivery log could not be finalized. Do not retry automatically.",
        {
          code: "LEDGER_WRITE_FAILED_AFTER_ACCEPTANCE",
          retryable: false,
          attemptId: reservation.attemptId,
          smtpAccepted: true,
          cause: error,
        },
      );
    }

    return {
      status: "sent",
      attemptId: reservation.attemptId,
      providerMessageId,
      accepted,
      rejected,
    };
  }

  close(): void {
    this.transport.close();
  }

  private async reserve(
    message: OutboundEmail,
    fromEmail: string,
    replyTo?: string,
  ) {
    try {
      return await this.ledger.reserve({
        idempotencyKey: message.deliveryKey,
        kind: message.kind,
        toEmail: message.to.trim().toLowerCase(),
        fromEmail,
        subject: message.email.subject,
        ...(replyTo ? { replyTo } : {}),
        ...(message.eventId ? { eventId: message.eventId } : {}),
        ...(message.householdId ? { householdId: message.householdId } : {}),
        ...(message.invitationId ? { invitationId: message.invitationId } : {}),
        ...(message.rsvpId ? { rsvpId: message.rsvpId } : {}),
        ...(message.metadata ? { metadata: message.metadata } : {}),
      });
    } catch (error) {
      throw new MailDispatchError(
        "The delivery log is unavailable; no email was sent.",
        {
          code: "LEDGER_UNAVAILABLE",
          retryable: true,
          cause: error,
        },
      );
    }
  }

  private async recordFailure(
    attemptId: string,
    failure: { code: string; message: string; retryable: boolean },
    originalError: unknown,
  ): Promise<void> {
    try {
      await this.ledger.markFailed({
        attemptId,
        code: failure.code,
        message: failure.message,
        retryable: failure.retryable,
        failedAt: new Date(),
      });
    } catch (ledgerError) {
      throw new MailDispatchError(
        `SMTP delivery failed and the failure log could not be updated: ${failure.message}`,
        {
          code: "LEDGER_WRITE_FAILED_AFTER_SMTP_FAILURE",
          retryable: false,
          attemptId,
          cause: { originalError, ledgerError },
        },
      );
    }
  }
}

export function smtpConfigurationFromEnv(
  environment: Environment = process.env,
): SmtpConfigurationState {
  const relevantKeys = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_FROM",
    "SMTP_REPLY_TO",
  ] as const;
  const hasConfiguration = relevantKeys.some((key) =>
    Boolean(environment[key]?.trim()),
  );
  if (!hasConfiguration) {
    return {
      configured: false,
      reason:
        "SMTP is not configured. Add SMTP_HOST and SMTP_FROM before sending email.",
    };
  }

  const parsed = smtpEnvironmentSchema.safeParse(environment);
  if (!parsed.success) {
    return {
      configured: false,
      reason: `SMTP configuration is invalid: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "SMTP"}: ${issue.message}`)
        .join("; ")}`,
    };
  }

  if (!parsed.data.SMTP_HOST || !parsed.data.SMTP_FROM) {
    return {
      configured: false,
      reason:
        "SMTP configuration is incomplete. SMTP_HOST and SMTP_FROM are required.",
    };
  }

  try {
    mailboxAddress(parsed.data.SMTP_FROM, "SMTP_FROM");
    if (parsed.data.SMTP_REPLY_TO)
      mailboxAddress(parsed.data.SMTP_REPLY_TO, "SMTP_REPLY_TO");
  } catch (error) {
    return {
      configured: false,
      reason:
        error instanceof Error
          ? error.message
          : "SMTP sender configuration is invalid.",
    };
  }

  return {
    configured: true,
    config: {
      host: parsed.data.SMTP_HOST,
      port: parsed.data.SMTP_PORT,
      secure: parsed.data.SMTP_SECURE ?? parsed.data.SMTP_PORT === 465,
      from: parsed.data.SMTP_FROM,
      ...(parsed.data.SMTP_USER ? { username: parsed.data.SMTP_USER } : {}),
      ...(parsed.data.SMTP_PASSWORD
        ? { password: parsed.data.SMTP_PASSWORD }
        : {}),
      ...(parsed.data.SMTP_REPLY_TO
        ? { replyTo: parsed.data.SMTP_REPLY_TO }
        : {}),
      requireTls: parsed.data.SMTP_REQUIRE_TLS ?? true,
      rejectUnauthorized: parsed.data.SMTP_TLS_REJECT_UNAUTHORIZED ?? true,
      connectionTimeoutMs: parsed.data.SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeoutMs: parsed.data.SMTP_GREETING_TIMEOUT_MS,
      socketTimeoutMs: parsed.data.SMTP_SOCKET_TIMEOUT_MS,
      maxConnections: parsed.data.SMTP_MAX_CONNECTIONS,
      maxMessagesPerConnection: parsed.data.SMTP_MAX_MESSAGES_PER_CONNECTION,
    },
  };
}

function mailboxAddress(value: string, variable: string): string {
  if (/[\r\n]/.test(value)) {
    throw new Error(`${variable} must not contain line breaks.`);
  }
  const bracketed = value.match(/<([^<>]+)>\s*$/)?.[1];
  const candidate = bracketed ?? value;
  const parsed = z.string().trim().email().max(320).safeParse(candidate);
  if (!parsed.success) {
    throw new Error(`${variable} must contain a valid email address.`);
  }
  return parsed.data.toLowerCase();
}

function normalizeAddressList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (typeof entry === "string") return entry;
    if (entry && typeof entry === "object" && "address" in entry) {
      const address = (entry as { address?: unknown }).address;
      if (typeof address === "string") return address;
    }
    return String(entry);
  });
}

function classifySmtpError(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} {
  const details = errorDetails(error);
  const code = details.code ?? "SMTP_ERROR";
  const responseCode = details.responseCode;
  const transientCodes = new Set([
    "ECONNECTION",
    "ECONNRESET",
    "EDNS",
    "ESOCKET",
    "ETIMEDOUT",
    "ETLS",
  ]);
  const permanentCodes = new Set(["EAUTH", "EENVELOPE", "EMESSAGE"]);
  const retryable =
    responseCode !== null
      ? responseCode >= 400 && responseCode < 500
      : transientCodes.has(code)
        ? true
        : permanentCodes.has(code)
          ? false
          : false;

  return {
    code: code.slice(0, 80),
    message: details.message.slice(0, 1_000),
    retryable,
  };
}

function errorDetails(error: unknown): {
  code: string | null;
  responseCode: number | null;
  message: string;
} {
  if (!error || typeof error !== "object") {
    return {
      code: null,
      responseCode: null,
      message: String(error).replace(/[\r\n]+/g, " "),
    };
  }

  const record = error as Record<string, unknown>;
  const message =
    typeof record.message === "string"
      ? record.message.replace(/[\r\n]+/g, " ")
      : "Unknown SMTP error";
  return {
    code: typeof record.code === "string" ? record.code : null,
    responseCode:
      typeof record.responseCode === "number" ? record.responseCode : null,
    message,
  };
}
