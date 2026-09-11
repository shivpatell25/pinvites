import type { RenderedEmail } from "./types";

export interface EventEmailDetails {
  eventTitle: string;
  hostLine: string;
  dateLine: string;
  venueLine?: string;
  artworkUrl?: string;
}

interface BaseTemplateInput extends EventEmailDetails {
  recipientName?: string;
}

export interface InvitationEmailInput extends BaseTemplateInput {
  invitationUrl: string;
  personalMessage?: string;
  rsvpDeadlineLine?: string;
}

export interface ConfirmationEmailInput extends BaseTemplateInput {
  response: "Yes" | "Maybe" | "No";
  attendeeNames?: readonly string[];
  manageUrl: string;
  message?: string;
}

export interface RsvpUpdateEmailInput extends BaseTemplateInput {
  response: "Yes" | "Maybe" | "No";
  attendeeNames?: readonly string[];
  manageUrl: string;
}

export interface ManagementLinkEmailInput extends BaseTemplateInput {
  manageUrl: string;
  expiresLine?: string;
}

export interface ReminderEmailInput extends BaseTemplateInput {
  invitationUrl: string;
  rsvpDeadlineLine?: string;
  reminderMessage?: string;
}

interface LayoutInput extends EventEmailDetails {
  preheader: string;
  eyebrow: string;
  headline: string;
  greeting: string;
  bodyHtml: string;
  bodyText: string;
  actionLabel: string;
  actionUrl: string;
  actionHint: string;
}

const BRAND = "Pinvites";

export function createInvitationEmail(
  input: InvitationEmailInput,
): RenderedEmail {
  const greeting = greetingFor(input.recipientName);
  const deadlineHtml = input.rsvpDeadlineLine
    ? `<p style="margin:18px 0 0;color:#a1a1a6;font-size:14px;line-height:1.55;">Please reply ${escapeHtml(input.rsvpDeadlineLine)}.</p>`
    : "";
  const messageHtml = input.personalMessage
    ? `<p style="margin:0 0 18px;color:#f5f5f7;font-size:17px;line-height:1.65;">${escapeHtml(input.personalMessage)}</p>`
    : "";
  const intro = `You’re invited to ${input.eventTitle}. Open your personal invitation for the full details and to reply.`;

  return {
    subject: safeSubject(`You’re invited: ${input.eventTitle}`),
    ...renderLayout({
      ...input,
      preheader: `An invitation from ${input.hostLine}`,
      eyebrow: "You’re invited",
      headline: input.eventTitle,
      greeting,
      bodyHtml: `${messageHtml}<p style="margin:0;color:#f5f5f7;font-size:17px;line-height:1.65;">${escapeHtml(intro)}</p>${deadlineHtml}`,
      bodyText: [
        input.personalMessage,
        intro,
        deadlineSentence(input.rsvpDeadlineLine),
      ]
        .filter(isPresent)
        .join("\n\n"),
      actionLabel: "Open invitation",
      actionUrl: input.invitationUrl,
      actionHint:
        "This link is personal to your invitation. Please don’t forward it.",
    }),
  };
}

export function createConfirmationEmail(
  input: ConfirmationEmailInput,
): RenderedEmail {
  const greeting = greetingFor(input.recipientName);
  const attendance = attendanceSummary(input.response, input.attendeeNames);
  const extraMessage = input.message
    ? `<p style="margin:18px 0 0;color:#a1a1a6;font-size:15px;line-height:1.6;">${escapeHtml(input.message)}</p>`
    : "";

  return {
    subject: safeSubject(`RSVP confirmed for ${input.eventTitle}`),
    ...renderLayout({
      ...input,
      preheader: `Your ${input.response} response has been received`,
      eyebrow: "Response received",
      headline:
        input.response === "Yes"
          ? "We’ll see you there."
          : "Thank you for replying.",
      greeting,
      bodyHtml: `<p style="margin:0;color:#f5f5f7;font-size:17px;line-height:1.65;">Your response for <strong>${escapeHtml(input.eventTitle)}</strong> is <strong style="color:#0a84ff;">${escapeHtml(input.response)}</strong>.</p>${attendance.html}${extraMessage}`,
      bodyText: [
        `Your response for ${input.eventTitle} is ${input.response}.`,
        attendance.text,
        input.message,
      ]
        .filter(isPresent)
        .join("\n\n"),
      actionLabel: "Review or change RSVP",
      actionUrl: input.manageUrl,
      actionHint:
        "Keep this private link if you need to update your response later.",
    }),
  };
}

export function createRsvpUpdateEmail(
  input: RsvpUpdateEmailInput,
): RenderedEmail {
  const attendance = attendanceSummary(input.response, input.attendeeNames);

  return {
    subject: safeSubject(`RSVP updated for ${input.eventTitle}`),
    ...renderLayout({
      ...input,
      preheader: `Your updated response is ${input.response}`,
      eyebrow: "Response updated",
      headline: "Your changes are saved.",
      greeting: greetingFor(input.recipientName),
      bodyHtml: `<p style="margin:0;color:#f5f5f7;font-size:17px;line-height:1.65;">Your updated response for <strong>${escapeHtml(input.eventTitle)}</strong> is <strong style="color:#0a84ff;">${escapeHtml(input.response)}</strong>.</p>${attendance.html}`,
      bodyText: [
        `Your updated response for ${input.eventTitle} is ${input.response}.`,
        attendance.text,
      ]
        .filter(isPresent)
        .join("\n\n"),
      actionLabel: "Review RSVP",
      actionUrl: input.manageUrl,
      actionHint: "This private link lets you make another change if needed.",
    }),
  };
}

export function createManagementLinkEmail(
  input: ManagementLinkEmailInput,
): RenderedEmail {
  const expiryHtml = input.expiresLine
    ? `<p style="margin:18px 0 0;color:#a1a1a6;font-size:14px;line-height:1.55;">${escapeHtml(input.expiresLine)}</p>`
    : "";
  const expiryText = input.expiresLine ? `\n\n${input.expiresLine}` : "";

  return {
    subject: safeSubject(`Your private RSVP link for ${input.eventTitle}`),
    ...renderLayout({
      ...input,
      preheader: "Use this private link to review or change your RSVP",
      eyebrow: "Private RSVP link",
      headline: "Your RSVP is a tap away.",
      greeting: greetingFor(input.recipientName),
      bodyHtml: `<p style="margin:0;color:#f5f5f7;font-size:17px;line-height:1.65;">Use the button below to securely review or change your response for <strong>${escapeHtml(input.eventTitle)}</strong>. Email address alone can’t be used to change an RSVP.</p>${expiryHtml}`,
      bodyText: `Use the private link below to securely review or change your response for ${input.eventTitle}. Email address alone can’t be used to change an RSVP.${expiryText}`,
      actionLabel: "Manage RSVP",
      actionUrl: input.manageUrl,
      actionHint:
        "For your privacy, don’t forward this email or share the link.",
    }),
  };
}

export function createReminderEmail(input: ReminderEmailInput): RenderedEmail {
  const reminder =
    input.reminderMessage ??
    `We’d love to know whether you can join us for ${input.eventTitle}.`;
  const deadlineHtml = input.rsvpDeadlineLine
    ? `<p style="margin:18px 0 0;color:#a1a1a6;font-size:14px;line-height:1.55;">Please reply ${escapeHtml(input.rsvpDeadlineLine)}.</p>`
    : "";

  return {
    subject: safeSubject(`A reminder to RSVP: ${input.eventTitle}`),
    ...renderLayout({
      ...input,
      preheader: `A gentle reminder from ${input.hostLine}`,
      eyebrow: "A gentle reminder",
      headline: "Will you be there?",
      greeting: greetingFor(input.recipientName),
      bodyHtml: `<p style="margin:0;color:#f5f5f7;font-size:17px;line-height:1.65;">${escapeHtml(reminder)}</p>${deadlineHtml}`,
      bodyText: [reminder, deadlineSentence(input.rsvpDeadlineLine)]
        .filter(isPresent)
        .join("\n\n"),
      actionLabel: "Reply to invitation",
      actionUrl: input.invitationUrl,
      actionHint:
        "This link is personal to your invitation. Please don’t forward it.",
    }),
  };
}

function renderLayout(
  input: LayoutInput,
): Pick<RenderedEmail, "html" | "text"> {
  const actionUrl = safeWebUrl(input.actionUrl);
  const artworkUrl = input.artworkUrl ? safeWebUrl(input.artworkUrl) : null;
  const details = [input.dateLine, input.venueLine].filter(isPresent);
  const detailsHtml = details
    .map(
      (detail) =>
        `<div style="margin-top:6px;color:#f5f5f7;font-size:15px;line-height:1.45;letter-spacing:.005em;">${escapeHtml(detail)}</div>`,
    )
    .join("");
  const artworkHtml = artworkUrl
    ? `<tr><td><img src="${escapeHtml(artworkUrl)}" width="640" alt="" style="display:block;width:100%;max-width:640px;height:auto;border:0;line-height:100%;" /></td></tr>`
    : "";
  const textDetails = details.join("\n");
  const fallbackUrl = escapeHtml(actionUrl);

  return {
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(input.headline)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&display=swap');
    @media only screen and (max-width: 620px) {
      .page-pad { padding: 0 !important; }
      .shell { border-radius: 0 !important; }
      .hero { padding: 26px 24px 36px !important; }
      .content { padding: 34px 24px 30px !important; }
      .headline { font-size: 44px !important; line-height: .96 !important; }
      .brand-mark-type { font-size: 30px !important; }
      .brand-wordmark-type { font-size: 30px !important; }
      .button-cell { display: block !important; }
      .button-link { display: block !important; text-align: center !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f2f2f7;color:#f5f5f7;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(input.preheader)}&#8199;&#65279;&#847;&nbsp;&#8199;&#65279;&#847;&nbsp;</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f2f2f7;">
    <tr>
      <td class="page-pad" align="center" style="padding:32px 16px;">
        <table role="presentation" class="shell" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#000000;border:1px solid #d1d1d6;border-radius:30px;overflow:hidden;box-shadow:0 18px 60px rgba(0,0,0,.12);">
          ${artworkHtml}
          <tr>
            <td class="hero" style="padding:32px 48px 46px;background:#000000;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td valign="middle" style="color:#8e8e93;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;">${escapeHtml(input.eyebrow)}</td>
                  <td align="right" valign="middle">
                    <span role="img" aria-label="Pinvites compact mark" style="display:inline-block;color:#8e8e93;font-family:Georgia,'Times New Roman',serif;font-size:13px;line-height:1;vertical-align:top;">&#10022;</span><span class="brand-mark-type" style="display:inline-block;margin-left:4px;color:#f5f5f7;font-family:'DM Serif Display',Georgia,'Times New Roman',serif;font-size:34px;font-style:italic;font-weight:700;letter-spacing:-.055em;line-height:1;">pi</span>
                  </td>
                </tr>
              </table>
              <h1 class="headline" style="margin:28px 0 34px;max-width:520px;color:#f5f5f7;font-family:Didot,'Bodoni 72','Times New Roman',serif;font-size:58px;font-weight:400;letter-spacing:-.045em;line-height:.96;">${escapeHtml(input.headline)}</h1>
              <div style="height:1px;background:#38383a;font-size:0;line-height:0;">&nbsp;</div>
              <div style="margin-top:25px;color:#a1a1a6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;">${escapeHtml(input.hostLine)}</div>
              <div style="margin-top:15px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">${detailsHtml}</div>
            </td>
          </tr>
          <tr>
            <td class="content" style="padding:42px 48px 36px;background:#1c1c1e;border-top:1px solid #2c2c2e;">
              <p style="margin:0 0 22px;color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:16px;font-weight:700;line-height:1.5;">${escapeHtml(input.greeting)}</p>
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">${input.bodyHtml}</div>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:30px;">
                <tr>
                  <td class="button-cell" style="border-radius:14px;background:#0a84ff;">
                    <a class="button-link" href="${fallbackUrl}" style="display:inline-block;padding:16px 24px;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:700;line-height:1;text-decoration:none;">${escapeHtml(input.actionLabel)}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:20px 0 0;color:#8e8e93;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;line-height:1.55;">${escapeHtml(input.actionHint)}</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:38px;border-top:1px solid #38383a;">
                <tr>
                  <td style="padding-top:24px;">
                    <span class="brand-wordmark-type" role="img" aria-label="Pinvites wordmark" style="display:inline-block;color:#f5f5f7;font-family:'DM Serif Display',Georgia,'Times New Roman',serif;font-size:34px;font-style:italic;font-weight:700;letter-spacing:-.045em;line-height:1;">pinvites</span>
                  </td>
                  <td align="right" valign="bottom" style="padding-top:24px;color:#636366;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;letter-spacing:.12em;text-transform:uppercase;">Invitations, beautifully considered.</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <p style="margin:18px auto 0;max-width:600px;color:#6e6e73;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;line-height:1.5;">If the button doesn’t work, copy and paste this address into your browser:<br><span style="word-break:break-all;">${fallbackUrl}</span></p>
      </td>
    </tr>
  </table>
</body>
</html>`,
    text: `${input.eyebrow.toUpperCase()}\n\n${input.headline}\n${input.hostLine}\n${textDetails}\n\n${input.greeting}\n\n${input.bodyText}\n\n${input.actionLabel}:\n${actionUrl}\n\n${input.actionHint}\n\n— ${BRAND}`,
  };
}

function attendanceSummary(
  response: "Yes" | "Maybe" | "No",
  attendeeNames?: readonly string[],
): { html: string; text: string | null } {
  if (response !== "Yes" || !attendeeNames?.length) {
    return { html: "", text: null };
  }

  const safeNames = attendeeNames.map((name) => name.trim()).filter(Boolean);
  if (!safeNames.length) {
    return { html: "", text: null };
  }

  const label = safeNames.length === 1 ? "Attendee" : "Attendees";
  const names = safeNames.join(", ");
  return {
    html: `<p style="margin:18px 0 0;color:#a1a1a6;font-size:15px;line-height:1.6;"><strong style="color:#f5f5f7;">${label}:</strong> ${escapeHtml(names)}</p>`,
    text: `${label}: ${names}`,
  };
}

function greetingFor(name?: string): string {
  const cleanName = name?.trim();
  return cleanName ? `Hello ${cleanName},` : "Hello,";
}

function deadlineSentence(deadline?: string): string | null {
  return deadline ? `Please reply ${deadline}.` : null;
}

function safeSubject(value: string): string {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 180);
}

function safeWebUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Email links must be absolute URLs.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Email links must use HTTP or HTTPS.");
  }
  return parsed.toString();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });
}

function isPresent<T>(value: T | null | undefined | ""): value is T {
  return value !== null && value !== undefined && value !== "";
}
