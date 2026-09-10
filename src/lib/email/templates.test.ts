import { describe, expect, it } from "vitest";

import { smtpConfigurationFromEnv } from "./mailer";
import { createInvitationEmail, createManagementLinkEmail } from "./templates";

describe("email templates", () => {
  it("renders responsive HTML and plain text without trusting event content", () => {
    const rendered = createInvitationEmail({
      eventTitle: "<script>alert(1)</script>",
      hostLine: "Hosted by Ada & Grace",
      dateLine: "Saturday, October 10",
      venueLine: "The Hall",
      recipientName: "Sam <Guest>",
      invitationUrl: "https://invites.example.test/i/private-token",
      personalMessage: "Please join us & celebrate.",
    });

    expect(rendered.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(rendered.html).not.toContain("<script>alert(1)</script>");
    expect(rendered.html).toContain("@media only screen");
    expect(rendered.html).toContain("#0a84ff");
    expect(rendered.html).toContain(
      "https://invites.example.test/brand/hotlink-ok/pinvites-mark-email.png",
    );
    expect(rendered.html).toContain(
      "https://invites.example.test/brand/hotlink-ok/pinvites-wordmark-email.png",
    );
    expect(rendered.text).toContain(
      "https://invites.example.test/i/private-token",
    );
  });

  it("explains that email address does not authorize RSVP changes", () => {
    const rendered = createManagementLinkEmail({
      eventTitle: "Supper",
      hostLine: "Hosted by Ada",
      dateLine: "October 10",
      manageUrl: "https://invites.example.test/r/private-management-token",
    });

    expect(rendered.text).toContain(
      "Email address alone can’t be used to change an RSVP",
    );
  });
});

describe("SMTP configuration", () => {
  it("clearly reports email as unavailable when SMTP is absent", () => {
    expect(smtpConfigurationFromEnv({})).toEqual({
      configured: false,
      reason:
        "SMTP is not configured. Add SMTP_HOST and SMTP_FROM before sending email.",
    });
  });

  it("rejects partial authentication instead of silently downgrading", () => {
    const state = smtpConfigurationFromEnv({
      SMTP_HOST: "smtp.example.test",
      SMTP_FROM: "Pinvites <invites@example.test>",
      SMTP_USER: "mailer",
    });

    expect(state.configured).toBe(false);
    if (!state.configured)
      expect(state.reason).toContain("SMTP_PASSWORD is required");
  });
});
