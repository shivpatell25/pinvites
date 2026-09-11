export const EMAIL_KINDS = [
  "INVITATION",
  "REMINDER",
  "CONFIRMATION",
  "RSVP_UPDATE",
  "MANAGEMENT_LINK",
  "ADMIN_INVITE",
] as const;

export type EmailKind = (typeof EMAIL_KINDS)[number];

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface MailContext {
  eventId?: string;
  householdId?: string;
  invitationId?: string;
  rsvpId?: string;
}

/**
 * A delivery key identifies one logical message to one recipient. Reusing the
 * key must never cause a second SMTP send.
 */
export interface OutboundEmail extends MailContext {
  deliveryKey: string;
  kind: EmailKind;
  to: string;
  email: RenderedEmail;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export type DeliveryReservation =
  | {
      reserved: true;
      attemptId: string;
    }
  | {
      reserved: false;
      attemptId: string;
      reason: "already-sent" | "in-progress" | "retry-exhausted";
    };

export interface ReserveDeliveryInput extends MailContext {
  idempotencyKey: string;
  kind: EmailKind;
  toEmail: string;
  fromEmail: string;
  replyTo?: string;
  subject: string;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface SentDeliveryInput {
  attemptId: string;
  providerMessageId: string | null;
  accepted: readonly string[];
  rejected: readonly string[];
  response: string | null;
  sentAt: Date;
}

export interface FailedDeliveryInput {
  attemptId: string;
  code: string;
  message: string;
  failedAt: Date;
  retryable: boolean;
}

/**
 * Implement this interface with a transactional database adapter. `reserve`
 * should insert by unique idempotency key and return `reserved: false` when a
 * prior send is already sent or in progress. Failed rows may be reserved for
 * retry according to the application's retry policy.
 */
export interface MailDeliveryLedger {
  reserve(input: ReserveDeliveryInput): Promise<DeliveryReservation>;
  markSending(attemptId: string, startedAt: Date): Promise<void>;
  markSent(input: SentDeliveryInput): Promise<void>;
  markFailed(input: FailedDeliveryInput): Promise<void>;
}

export interface SmtpConfiguration {
  host: string;
  port: number;
  secure: boolean;
  username?: string;
  password?: string;
  from: string;
  replyTo?: string;
  requireTls: boolean;
  rejectUnauthorized: boolean;
  connectionTimeoutMs: number;
  greetingTimeoutMs: number;
  socketTimeoutMs: number;
  maxConnections: number;
  maxMessagesPerConnection: number;
}

export type SmtpConfigurationState =
  | { configured: true; config: SmtpConfiguration }
  | { configured: false; reason: string };

export type MailDispatchResult =
  | {
      status: "sent";
      attemptId: string;
      providerMessageId: string | null;
      accepted: readonly string[];
      rejected: readonly string[];
    }
  | {
      status: "duplicate";
      attemptId: string;
      reason: Exclude<DeliveryReservation, { reserved: true }>["reason"];
    };
