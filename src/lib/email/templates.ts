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
    ? `<p style="margin:18px 0 0;color:#6f6a63;font-size:14px;line-height:1.55;">Please reply ${escapeHtml(input.rsvpDeadlineLine)}.</p>`
    : "";
  const messageHtml = input.personalMessage
    ? `<p style="margin:0 0 18px;color:#302e2b;font-size:17px;line-height:1.65;">${escapeHtml(input.personalMessage)}</p>`
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
      bodyHtml: `${messageHtml}<p style="margin:0;color:#302e2b;font-size:17px;line-height:1.65;">${escapeHtml(intro)}</p>${deadlineHtml}`,
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
    ? `<p style="margin:18px 0 0;color:#6f6a63;font-size:15px;line-height:1.6;">${escapeHtml(input.message)}</p>`
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
      bodyHtml: `<p style="margin:0;color:#302e2b;font-size:17px;line-height:1.65;">Your response for <strong>${escapeHtml(input.eventTitle)}</strong> is <strong>${escapeHtml(input.response)}</strong>.</p>${attendance.html}${extraMessage}`,
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
      bodyHtml: `<p style="margin:0;color:#302e2b;font-size:17px;line-height:1.65;">Your updated response for <strong>${escapeHtml(input.eventTitle)}</strong> is <strong>${escapeHtml(input.response)}</strong>.</p>${attendance.html}`,
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
    ? `<p style="margin:18px 0 0;color:#6f6a63;font-size:14px;line-height:1.55;">${escapeHtml(input.expiresLine)}</p>`
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
      bodyHtml: `<p style="margin:0;color:#302e2b;font-size:17px;line-height:1.65;">Use the button below to securely review or change your response for <strong>${escapeHtml(input.eventTitle)}</strong>. Email address alone can’t be used to change an RSVP.</p>${expiryHtml}`,
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
    ? `<p style="margin:18px 0 0;color:#6f6a63;font-size:14px;line-height:1.55;">Please reply ${escapeHtml(input.rsvpDeadlineLine)}.</p>`
    : "";

  return {
    subject: safeSubject(`A reminder to RSVP: ${input.eventTitle}`),
    ...renderLayout({
      ...input,
      preheader: `A gentle reminder from ${input.hostLine}`,
      eyebrow: "A gentle reminder",
      headline: "Will you be there?",
      greeting: greetingFor(input.recipientName),
      bodyHtml: `<p style="margin:0;color:#302e2b;font-size:17px;line-height:1.65;">${escapeHtml(reminder)}</p>${deadlineHtml}`,
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
        `<div style="margin-top:5px;color:#f6f0e7;font-size:15px;line-height:1.45;letter-spacing:.01em;">${escapeHtml(detail)}</div>`,
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
    @media only screen and (max-width: 620px) {
      .page-pad { padding: 0 !important; }
      .shell { border-radius: 0 !important; }
      .hero { padding: 38px 26px 34px !important; }
      .content { padding: 35px 26px 34px !important; }
      .headline { font-size: 43px !important; line-height: .98 !important; }
      .button-cell { display: block !important; }
      .button-link { display: block !important; text-align: center !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#e9e5de;color:#191816;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(input.preheader)}&#8199;&#65279;&#847;&nbsp;&#8199;&#65279;&#847;&nbsp;</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#e9e5de;">
    <tr>
      <td class="page-pad" align="center" style="padding:30px 16px;">
        <table role="presentation" class="shell" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#fffdf9;border-radius:26px;overflow:hidden;">
          ${artworkHtml}
          <tr>
            <td class="hero" style="padding:48px 52px 44px;background:#191816;">
              <div style="color:#c9b79c;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;">${escapeHtml(input.eyebrow)}</div>
              <h1 class="headline" style="margin:18px 0 24px;color:#fffdf9;font-family:Didot,'Bodoni 72','Times New Roman',serif;font-size:58px;font-weight:500;letter-spacing:-.035em;line-height:.98;">${escapeHtml(input.headline)}</h1>
              <div style="color:#c9b79c;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">${escapeHtml(input.hostLine)}</div>
              <div style="margin-top:18px;">${detailsHtml}</div>
            </td>
          </tr>
          <tr>
            <td class="content" style="padding:43px 52px 44px;">
              <p style="margin:0 0 22px;color:#191816;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:1.5;">${escapeHtml(input.greeting)}</p>
              <div style="font-family:Arial,Helvetica,sans-serif;">${input.bodyHtml}</div>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:30px;">
                <tr>
                  <td class="button-cell" style="border-radius:13px;background:#191816;">
                    <a class="button-link" href="${fallbackUrl}" style="display:inline-block;padding:15px 23px;color:#fffdf9;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;line-height:1;text-decoration:none;">${escapeHtml(input.actionLabel)}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:20px 0 0;color:#7a756e;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.55;">${escapeHtml(input.actionHint)}</p>
              <div style="margin-top:35px;padding-top:22px;border-top:1px solid #e7e1d8;">
                <div style="color:#191816;font-family:Didot,'Bodoni 72','Times New Roman',serif;font-size:24px;font-style:italic;font-weight:600;letter-spacing:-.03em;">${BRAND}</div>
              </div>
            </td>
          </tr>
        </table>
        <p style="margin:18px auto 0;max-width:600px;color:#77716a;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;">If the button doesn’t work, copy and paste this address into your browser:<br><span style="word-break:break-all;">${fallbackUrl}</span></p>
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
    html: `<p style="margin:18px 0 0;color:#6f6a63;font-size:15px;line-height:1.6;"><strong>${label}:</strong> ${escapeHtml(names)}</p>`,
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
