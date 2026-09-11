import { beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({
  verify: vi.fn(),
  sendMail: vi.fn(),
  close: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => transport,
  },
}));

import { MailDispatchError, SmtpMailer } from "./mailer";
import type {
  DeliveryReservation,
  FailedDeliveryInput,
  MailDeliveryLedger,
  ReserveDeliveryInput,
  SentDeliveryInput,
  SmtpConfiguration,
} from "./types";

class MemoryLedger implements MailDeliveryLedger {
  sent: SentDeliveryInput | null = null;
  failed: FailedDeliveryInput | null = null;
  reservations: ReserveDeliveryInput[] = [];

  async reserve(input: ReserveDeliveryInput): Promise<DeliveryReservation> {
    this.reservations.push(input);
    if (this.sent)
      return {
        reserved: false,
        attemptId: "attempt-1",
        reason: "already-sent",
      };
    return { reserved: true, attemptId: "attempt-1" };
  }

  async markSending(): Promise<void> {}

  async markSent(input: SentDeliveryInput): Promise<void> {
    this.sent = input;
  }

  async markFailed(input: FailedDeliveryInput): Promise<void> {
    this.failed = input;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SMTP mailer", () => {
  it("records sent only after the SMTP transport accepts the message and deduplicates the key", async () => {
    transport.sendMail.mockResolvedValueOnce({
      accepted: ["guest@example.test"],
      rejected: [],
      messageId: "provider-message-id",
      response: "250 2.0.0 accepted",
    });
    const ledger = new MemoryLedger();
    const mailer = new SmtpMailer(configuration(), ledger);

    const message = {
      deliveryKey: "invitation:event-1:household-1:v1",
      kind: "INVITATION" as const,
      to: "guest@example.test",
      email: {
        subject: "You’re invited",
        html: "<p>Join us</p>",
        text: "Join us",
      },
    };
    const first = await mailer.send(message);
    const second = await mailer.send(message);
    mailer.close();

    expect(first.status).toBe("sent");
    expect(second).toEqual({
      status: "duplicate",
      attemptId: "attempt-1",
      reason: "already-sent",
    });
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
    expect(transport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "guest@example.test",
        subject: "You’re invited",
        attachments: expect.arrayContaining([
          expect.objectContaining({
            cid: "pinvites-mark@pinvites",
            contentType: "image/png",
            contentDisposition: "inline",
          }),
          expect.objectContaining({
            cid: "pinvites-wordmark@pinvites",
            contentType: "image/png",
            contentDisposition: "inline",
          }),
        ]),
        disableFileAccess: true,
        disableUrlAccess: true,
      }),
    );
    expect(ledger.sent?.accepted).toContain("guest@example.test");
    expect(ledger.failed).toBeNull();
  });

  it("records a real recipient rejection as failed instead of returning success", async () => {
    transport.sendMail.mockRejectedValueOnce(
      Object.assign(new Error("Mailbox unavailable"), {
        code: "EENVELOPE",
        responseCode: 550,
      }),
    );
    const ledger = new MemoryLedger();
    const mailer = new SmtpMailer(configuration(), ledger);

    await expect(
      mailer.send({
        deliveryKey: "reminder:event-1:household-1:v1",
        kind: "REMINDER",
        to: "rejected@example.test",
        email: {
          subject: "Reminder",
          html: "<p>Reminder</p>",
          text: "Reminder",
        },
      }),
    ).rejects.toMatchObject({
      smtpAccepted: false,
    } satisfies Partial<MailDispatchError>);
    mailer.close();

    expect(ledger.sent).toBeNull();
    expect(ledger.failed?.code).toBe("EENVELOPE");
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
  });
});

function configuration(): SmtpConfiguration {
  return {
    host: "smtp.example.test",
    port: 587,
    secure: false,
    from: "Pinvites <invites@example.test>",
    requireTls: false,
    rejectUnauthorized: true,
    connectionTimeoutMs: 2_000,
    greetingTimeoutMs: 2_000,
    socketTimeoutMs: 5_000,
    maxConnections: 1,
    maxMessagesPerConnection: 10,
  };
}
