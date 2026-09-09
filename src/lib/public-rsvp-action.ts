"use server";

import { headers } from "next/headers";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import type { RsvpActionState } from "@/components/public/types";
import { db } from "@/lib/db";
import {
  createConfirmationEmail,
  createRsvpUpdateEmail,
  PrismaMailDeliveryLedger,
  SmtpMailer,
  smtpConfigurationFromEnv,
} from "@/lib/email";
import { getServerEnvironment } from "@/lib/env";
import { trustedClientIp } from "@/lib/request";
import { isTrustedRequestOrigin } from "@/lib/security/csrf";
import {
  hashSensitiveValue,
  normalizeEmail,
  normalizeIpAddress,
} from "@/lib/security/identity";
import {
  generateSecureToken,
  hashToken,
  hasValidTokenShape,
} from "@/lib/security/tokens";
import { consumePublicRsvpRateLimit } from "@/lib/security/public-rsvp-rate-limit";

const answerValueSchema = z.union([
  z.string().max(2_000),
  z.array(z.string().uuid()).max(50),
  z.boolean(),
]);

const payloadSchema = z
  .object({
    response: z.enum(["YES", "MAYBE", "NO"]),
    contactName: z.string().trim().min(1).max(160),
    contactEmail: z.union([z.literal(""), z.string().trim().email().max(320)]),
    attendees: z
      .array(
        z.object({
          key: z.string().uuid(),
          guestId: z.string().uuid().nullable(),
          fullName: z.string().trim().min(1).max(160),
          mealOptionId: z.union([z.literal(""), z.string().uuid()]),
          dietaryRestrictions: z.string().trim().max(2_000),
        }),
      )
      .max(30),
    answers: z
      .array(
        z.object({
          questionId: z.string().uuid(),
          subjectKey: z.union([z.literal("household"), z.string().uuid()]),
          value: answerValueSchema,
        }),
      )
      .max(300),
    message: z.string().trim().max(2_000),
    revision: z.number().int().positive().nullable(),
  })
  .strict();

const actionInputSchema = z.object({
  eventId: z.string().uuid(),
  accessKind: z.enum(["PUBLIC", "INVITATION", "MANAGEMENT"]),
  accessToken: z.string().max(256),
});

const eventInclude = {
  mealOptions: { where: { isActive: true } },
  questions: {
    where: { isActive: true },
    include: {
      options: { where: { isActive: true } },
      conditions: { orderBy: [{ sortOrder: "asc" }] },
    },
  },
} satisfies Prisma.EventInclude;

const tokenInclude = {
  invitation: {
    include: {
      household: {
        include: {
          guests: true,
          rsvp: true,
          event: { include: eventInclude },
        },
      },
    },
  },
} satisfies Prisma.InvitationTokenInclude;

type ActionEvent = Prisma.EventGetPayload<{ include: typeof eventInclude }>;
type ActionQuestion = ActionEvent["questions"][number];
type ParsedPayload = z.infer<typeof payloadSchema>;

class PublicRsvpError extends Error {}

function actionError(message: string): RsvpActionState {
  return { status: "ERROR", message, manageUrl: null, submittedResponse: null };
}

function clientIp(requestHeaders: Headers) {
  if (!getServerEnvironment().TRUST_PROXY_HEADERS) return null;
  return trustedClientIp(requestHeaders);
}

function answerFor(
  payload: ParsedPayload,
  questionId: string,
  subjectKey: string,
) {
  return payload.answers.find(
    (answer) =>
      answer.questionId === questionId && answer.subjectKey === subjectKey,
  )?.value;
}

function isAnswered(value: z.infer<typeof answerValueSchema> | undefined) {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "boolean";
}

function conditionMatches(
  condition: ActionQuestion["conditions"][number],
  payload: ParsedPayload,
  subjectKey: string,
) {
  const value =
    answerFor(payload, condition.sourceQuestionId, subjectKey) ??
    answerFor(payload, condition.sourceQuestionId, "household");
  if (condition.operator === "IS_ANSWERED") return isAnswered(value);
  if (condition.operator === "IS_NOT_ANSWERED") return !isAnswered(value);
  const expected =
    condition.optionId ?? condition.textValue ?? condition.booleanValue;
  const contains = Array.isArray(value)
    ? typeof expected === "string" && value.includes(expected)
    : typeof value === "string" && typeof expected === "string"
      ? value.toLocaleLowerCase().includes(expected.toLocaleLowerCase())
      : value === expected;
  const equals = Array.isArray(value)
    ? typeof expected === "string" && value.includes(expected)
    : value === expected;
  if (condition.operator === "EQUALS") return equals;
  if (condition.operator === "NOT_EQUALS") return !equals;
  if (condition.operator === "CONTAINS") return contains;
  return !contains;
}

function isQuestionVisible(
  question: ActionQuestion,
  payload: ParsedPayload,
  subjectKey: string,
) {
  return (
    question.visibleForResponses.includes(payload.response) &&
    question.conditions.every((condition) =>
      conditionMatches(condition, payload, subjectKey),
    )
  );
}

function validateAnswer(
  question: ActionQuestion,
  value: z.infer<typeof answerValueSchema>,
) {
  const optionIds = new Set(question.options.map((option) => option.id));
  if (question.type === "SHORT_TEXT" || question.type === "LONG_TEXT") {
    if (typeof value !== "string")
      throw new PublicRsvpError("One of the written answers is invalid.");
    return;
  }
  if (question.type === "BOOLEAN") {
    if (typeof value !== "boolean")
      throw new PublicRsvpError("One of the Yes or No answers is invalid.");
    return;
  }
  if (question.type === "SINGLE_SELECT") {
    if (typeof value !== "string" || !optionIds.has(value)) {
      throw new PublicRsvpError(
        "One of the selected answers is no longer available.",
      );
    }
    return;
  }
  if (
    !Array.isArray(value) ||
    value.some((optionId) => !optionIds.has(optionId))
  ) {
    throw new PublicRsvpError(
      "One or more selected answers are no longer available.",
    );
  }
}

function validateQuestions(event: ActionEvent, payload: ParsedPayload) {
  const questions = new Map(
    event.questions.map((question) => [question.id, question]),
  );
  const attendeeKeys = new Set(
    payload.attendees.map((attendee) => attendee.key),
  );
  for (const answer of payload.answers) {
    const question = questions.get(answer.questionId);
    if (!question)
      throw new PublicRsvpError(
        "One of the event questions is no longer available.",
      );
    if (question.scope === "HOUSEHOLD" && answer.subjectKey !== "household") {
      throw new PublicRsvpError("A household answer has an invalid recipient.");
    }
    if (question.scope === "ATTENDEE" && !attendeeKeys.has(answer.subjectKey)) {
      throw new PublicRsvpError("An attendee answer has an invalid recipient.");
    }
    if (question.scope === "ATTENDEE" && payload.response === "NO") {
      throw new PublicRsvpError(
        "Attendee answers cannot be submitted with a No response.",
      );
    }
    validateAnswer(question, answer.value);
  }

  for (const question of event.questions) {
    const subjectKeys =
      question.scope === "HOUSEHOLD"
        ? ["household"]
        : payload.response === "NO"
          ? []
          : payload.attendees.map((attendee) => attendee.key);
    for (const subjectKey of subjectKeys) {
      if (!isQuestionVisible(question, payload, subjectKey)) continue;
      const value = answerFor(payload, question.id, subjectKey);
      if (question.isRequired && !isAnswered(value)) {
        throw new PublicRsvpError(`Please answer “${question.prompt}”.`);
      }
    }
  }
}

function ensureEventCanAccept(event: ActionEvent, payload: ParsedPayload) {
  if (event.status !== "PUBLISHED") {
    throw new PublicRsvpError("This event is no longer accepting responses.");
  }
  if (event.rsvpDeadline && event.rsvpDeadline.getTime() < Date.now()) {
    throw new PublicRsvpError(
      "The RSVP deadline has passed. Please contact the host.",
    );
  }
  if (payload.response === "MAYBE" && !event.allowMaybe) {
    throw new PublicRsvpError("This event is not accepting Maybe responses.");
  }
}

type SubmissionResult = {
  event: ActionEvent;
  rsvpId: string;
  revision: number;
  householdId: string;
  invitationId: string;
  recipientName: string;
  recipientEmail: string | null;
  attendeeNames: string[];
  response: "YES" | "MAYBE" | "NO";
  message: string;
  manageToken: string;
  wasUpdate: boolean;
};

async function persistSubmission(
  input: z.infer<typeof actionInputSchema>,
  payload: ParsedPayload,
  ipHash: string | null,
  userAgent: string | null,
): Promise<SubmissionResult> {
  return db.$transaction(
    async (tx) => {
      let event: ActionEvent;
      let household: {
        id: string;
        displayName: string;
        contactName: string;
        contactEmail: string | null;
        partySizeLimit: number;
        allowPlusOne: boolean;
        archivedAt: Date | null;
        guests: Array<{ id: string }>;
      };
      let invitation: { id: string };
      let existingRsvp: { id: string; revision: number } | null;
      let primaryPublicGuestId: string | null = null;

      if (input.accessKind === "PUBLIC") {
        const publicEvent = await tx.event.findUnique({
          where: { id: input.eventId },
          include: eventInclude,
        });
        if (!publicEvent || !publicEvent.isPublic) {
          throw new PublicRsvpError("This invitation is unavailable.");
        }
        event = publicEvent;
        ensureEventCanAccept(event, payload);
        if (!payload.contactEmail) {
          throw new PublicRsvpError(
            "Enter an email address so we can send your private management link.",
          );
        }
        const primaryName =
          payload.response === "NO"
            ? payload.contactName
            : (payload.attendees[0]?.fullName ?? payload.contactName);
        const createdHousehold = await tx.household.create({
          data: {
            eventId: event.id,
            displayName: payload.contactName,
            contactName: payload.contactName,
            contactEmail: payload.contactEmail || null,
            normalizedEmail: payload.contactEmail
              ? normalizeEmail(payload.contactEmail)
              : null,
            partySizeLimit: event.partySizeLimit,
            allowPlusOne: event.allowPlusOne,
            guests: {
              create: { fullName: primaryName, isPrimary: true, sortOrder: 0 },
            },
          },
          include: { guests: true },
        });
        const createdInvitation = await tx.invitation.create({
          data: { householdId: createdHousehold.id },
        });
        household = createdHousehold;
        invitation = createdInvitation;
        existingRsvp = null;
        primaryPublicGuestId = createdHousehold.guests[0]?.id ?? null;
      } else {
        const purpose =
          input.accessKind === "INVITATION" ? "invitation" : "management";
        if (!hasValidTokenShape(input.accessToken, purpose)) {
          throw new PublicRsvpError(
            "This private link is invalid or has expired.",
          );
        }
        const token = await tx.invitationToken.findUnique({
          where: { tokenHash: hashToken(input.accessToken, purpose) },
          include: tokenInclude,
        });
        if (
          !token ||
          token.type !== input.accessKind ||
          token.revokedAt ||
          token.invitation.revokedAt ||
          token.invitation.household.archivedAt ||
          (token.expiresAt && token.expiresAt.getTime() <= Date.now())
        ) {
          throw new PublicRsvpError(
            "This private link is invalid or has expired.",
          );
        }
        const tokenHousehold = token.invitation.household;
        if (tokenHousehold.eventId !== input.eventId) {
          throw new PublicRsvpError(
            "This private link does not belong to this event.",
          );
        }
        event = tokenHousehold.event;
        ensureEventCanAccept(event, payload);
        household = tokenHousehold;
        invitation = token.invitation;
        existingRsvp = tokenHousehold.rsvp;
        if (input.accessKind === "INVITATION" && existingRsvp) {
          throw new PublicRsvpError(
            "This invitation has already been answered. Use the private management link from your confirmation email to make changes.",
          );
        }
        if (input.accessKind === "MANAGEMENT" && !existingRsvp) {
          throw new PublicRsvpError(
            "There is no RSVP associated with this management link.",
          );
        }
        await tx.invitationToken.update({
          where: { id: token.id },
          data: { lastUsedAt: new Date() },
        });
      }

      if (payload.response !== "NO") {
        const invitedLimit = household.allowPlusOne
          ? household.partySizeLimit
          : Math.min(
              household.partySizeLimit,
              Math.max(household.guests.length, 1),
            );
        const limit =
          input.accessKind === "PUBLIC"
            ? event.allowPlusOne
              ? event.partySizeLimit
              : 1
            : invitedLimit;
        if (payload.attendees.length < 1 || payload.attendees.length > limit) {
          throw new PublicRsvpError(
            `This invitation allows up to ${limit} ${limit === 1 ? "person" : "people"}.`,
          );
        }
      }

      const knownGuestIds = new Set(household.guests.map((guest) => guest.id));
      const submittedGuestIds = payload.attendees
        .map((attendee) => attendee.guestId)
        .filter((guestId): guestId is string => Boolean(guestId));
      if (new Set(submittedGuestIds).size !== submittedGuestIds.length) {
        throw new PublicRsvpError(
          "A named guest can only appear once in an RSVP.",
        );
      }
      if (submittedGuestIds.some((guestId) => !knownGuestIds.has(guestId))) {
        throw new PublicRsvpError(
          "One of the guests does not belong to this invitation.",
        );
      }
      if (
        input.accessKind !== "PUBLIC" &&
        !household.allowPlusOne &&
        payload.response !== "NO" &&
        payload.attendees.some((attendee) => attendee.guestId === null)
      ) {
        throw new PublicRsvpError(
          "This invitation is limited to the named guests.",
        );
      }

      const mealIds = new Set(event.mealOptions.map((meal) => meal.id));
      if (
        payload.attendees.some(
          (attendee) =>
            attendee.mealOptionId && !mealIds.has(attendee.mealOptionId),
        )
      ) {
        throw new PublicRsvpError(
          "One of the selected meals is no longer available.",
        );
      }
      validateQuestions(event, payload);

      let rsvpId: string;
      let revision: number;
      const wasUpdate = Boolean(existingRsvp);
      if (existingRsvp) {
        if (payload.revision !== existingRsvp.revision) {
          throw new PublicRsvpError(
            "This RSVP changed in another window. Refresh the page before saving again.",
          );
        }
        revision = existingRsvp.revision + 1;
        const update = await tx.rsvp.updateMany({
          where: { id: existingRsvp.id, revision: existingRsvp.revision },
          data: {
            response: payload.response,
            message: payload.message || null,
            revision,
            submittedAt: new Date(),
          },
        });
        if (update.count !== 1) {
          throw new PublicRsvpError(
            "This RSVP changed in another window. Refresh the page before saving again.",
          );
        }
        rsvpId = existingRsvp.id;
        await tx.rsvpAnswer.deleteMany({ where: { rsvpId } });
        await tx.attendee.deleteMany({ where: { rsvpId } });
      } else {
        revision = 1;
        const rsvp = await tx.rsvp.create({
          data: {
            householdId: household.id,
            invitationId: invitation.id,
            response: payload.response,
            message: payload.message || null,
            contactEmail: household.contactEmail,
            revision,
          },
        });
        rsvpId = rsvp.id;
      }

      const attendeeIdByKey = new Map<string, string>();
      if (payload.response !== "NO") {
        for (const [index, attendee] of payload.attendees.entries()) {
          const guestId =
            input.accessKind === "PUBLIC" && index === 0
              ? primaryPublicGuestId
              : attendee.guestId;
          const created = await tx.attendee.create({
            data: {
              rsvpId,
              guestId,
              fullName: attendee.fullName,
              status: payload.response === "YES" ? "CONFIRMED" : "MAYBE",
              mealOptionId: attendee.mealOptionId || null,
              dietaryRestrictions: attendee.dietaryRestrictions || null,
              isPlusOne: guestId === null,
              sortOrder: index,
            },
          });
          attendeeIdByKey.set(attendee.key, created.id);
        }
      }

      for (const answer of payload.answers) {
        const question = event.questions.find(
          (candidate) => candidate.id === answer.questionId,
        );
        if (
          !question ||
          !isQuestionVisible(question, payload, answer.subjectKey) ||
          !isAnswered(answer.value)
        ) {
          continue;
        }
        const attendeeId =
          answer.subjectKey === "household"
            ? null
            : (attendeeIdByKey.get(answer.subjectKey) ?? null);
        const persistedSubjectKey = attendeeId ?? household.id;
        const optionIds = Array.isArray(answer.value)
          ? answer.value
          : question.type === "SINGLE_SELECT" &&
              typeof answer.value === "string"
            ? [answer.value]
            : [];
        await tx.rsvpAnswer.create({
          data: {
            rsvpId,
            questionId: question.id,
            attendeeId,
            subjectKey: persistedSubjectKey,
            textValue:
              question.type === "SHORT_TEXT" || question.type === "LONG_TEXT"
                ? String(answer.value)
                : null,
            booleanValue:
              question.type === "BOOLEAN" && typeof answer.value === "boolean"
                ? answer.value
                : null,
            ...(optionIds.length > 0
              ? {
                  options: {
                    create: optionIds.map((optionId) => ({ optionId })),
                  },
                }
              : {}),
          },
        });
      }

      const attendeeCount =
        payload.response === "NO" ? 0 : payload.attendees.length;
      await tx.rsvpSubmission.create({
        data: {
          rsvpId,
          invitationId: invitation.id,
          revision,
          source: input.accessKind === "PUBLIC" ? "PUBLIC_EVENT" : "INVITATION",
          response: payload.response,
          confirmedAttendeeCount:
            payload.response === "YES" ? attendeeCount : 0,
          maybeAttendeeCount: payload.response === "MAYBE" ? attendeeCount : 0,
          message: payload.message || null,
          ipHash,
          userAgent,
        },
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { respondedAt: new Date() },
      });
      await tx.analyticsEvent.create({
        data: {
          eventId: event.id,
          householdId: household.id,
          invitationId: invitation.id,
          rsvpId,
          type: wasUpdate ? "RSVP_UPDATED" : "RSVP_SUBMITTED",
          ipHash,
        },
      });

      let manageToken =
        input.accessKind === "MANAGEMENT" ? input.accessToken : "";
      if (!manageToken) {
        const generated = generateSecureToken("management");
        manageToken = generated.token;
        await tx.invitationToken.updateMany({
          where: {
            invitationId: invitation.id,
            type: "MANAGEMENT",
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
        await tx.invitationToken.create({
          data: {
            invitationId: invitation.id,
            type: "MANAGEMENT",
            tokenHash: generated.tokenHash,
          },
        });
      }

      return {
        event,
        rsvpId,
        revision,
        householdId: household.id,
        invitationId: invitation.id,
        recipientName: household.contactName,
        recipientEmail: household.contactEmail,
        attendeeNames:
          payload.response === "NO"
            ? []
            : payload.attendees.map((attendee) => attendee.fullName),
        response: payload.response,
        message: payload.message,
        manageToken,
        wasUpdate,
      };
    },
    { isolationLevel: "Serializable" },
  );
}

async function sendConfirmation(
  result: SubmissionResult,
  absoluteManageUrl: string,
) {
  if (!result.recipientEmail) {
    return "Your RSVP is saved. No confirmation email was sent because this invitation has no contact email; keep the private link below.";
  }
  const configuration = smtpConfigurationFromEnv();
  if (!configuration.configured) {
    return "Your RSVP is saved. Email delivery is not configured, so no confirmation email was sent; keep the private link below.";
  }

  const dateLine = new Intl.DateTimeFormat("en-US", {
    timeZone: result.event.timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(result.event.startsAt);
  const response =
    result.response === "YES"
      ? "Yes"
      : result.response === "MAYBE"
        ? "Maybe"
        : "No";
  const common = {
    eventTitle: result.event.title,
    hostLine: `Hosted by ${result.event.hostName}`,
    dateLine,
    recipientName: result.recipientName,
    response,
    attendeeNames: result.attendeeNames,
    manageUrl: absoluteManageUrl,
  } as const;
  const email = result.wasUpdate
    ? createRsvpUpdateEmail({
        ...common,
        ...(result.event.venueName
          ? { venueLine: result.event.venueName }
          : {}),
      })
    : createConfirmationEmail({
        ...common,
        ...(result.event.venueName
          ? { venueLine: result.event.venueName }
          : {}),
        ...(result.message ? { message: result.message } : {}),
      });
  const mailer = new SmtpMailer(
    configuration.config,
    new PrismaMailDeliveryLedger(),
  );
  try {
    await mailer.send({
      deliveryKey: `rsvp:${result.rsvpId}:revision:${result.revision}`,
      kind: result.wasUpdate ? "RSVP_UPDATE" : "CONFIRMATION",
      to: result.recipientEmail,
      email,
      eventId: result.event.id,
      householdId: result.householdId,
      invitationId: result.invitationId,
      rsvpId: result.rsvpId,
    });
    return `Your RSVP is saved, and a confirmation was sent to ${result.recipientEmail}.`;
  } catch (error) {
    console.error("RSVP saved but confirmation email failed", error);
    return "Your RSVP is saved, but the confirmation email could not be sent. Keep the private link below.";
  } finally {
    mailer.close();
  }
}

export async function submitPublicRsvp(
  _previousState: RsvpActionState,
  formData: FormData,
): Promise<RsvpActionState> {
  const requestHeaders = new Headers(await headers());
  if (!isTrustedRequestOrigin(requestHeaders)) {
    return actionError(
      "We couldn’t verify this request. Refresh the page and try again.",
    );
  }
  if (String(formData.get("website") ?? "")) {
    return actionError("We couldn’t accept this response.");
  }
  const input = actionInputSchema.safeParse({
    eventId: formData.get("eventId"),
    accessKind: formData.get("accessKind"),
    accessToken: formData.get("accessToken"),
  });
  if (!input.success)
    return actionError("This RSVP request is invalid. Refresh and try again.");

  const ip = clientIp(requestHeaders);
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 512) ?? null;
  // This first bucket never includes form-controlled data. If no trusted edge
  // supplies an address, all submissions share a fail-safe global bucket.
  const throttleIdentity = ip
    ? `connection:${normalizeIpAddress(ip)}`
    : "connection:unattributed";
  const throttleKeyHash = hashSensitiveValue(
    throttleIdentity,
    "public-rsvp-throttle",
  );
  try {
    const rateLimit = await consumePublicRsvpRateLimit(throttleKeyHash);
    if (!rateLimit.allowed) {
      return actionError(
        "Too many responses were sent from this connection. Please wait a few minutes.",
      );
    }
  } catch (error) {
    console.error("Unable to enforce the public RSVP rate limit", error);
    return actionError(
      "RSVP service is temporarily unavailable. Please try again shortly.",
    );
  }

  const payloadText = formData.get("payload");
  if (typeof payloadText !== "string" || payloadText.length > 100_000) {
    return actionError("This RSVP contains too much information.");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(payloadText);
  } catch {
    return actionError("This RSVP request is invalid. Refresh and try again.");
  }
  const payload = payloadSchema.safeParse(decoded);
  if (!payload.success) {
    return actionError(
      "Check the names, contact details, and answers before sending.",
    );
  }

  const ipHash = ip
    ? hashSensitiveValue(normalizeIpAddress(ip), "public-rsvp-ip")
    : null;
  try {
    let result: SubmissionResult | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        result = await persistSubmission(
          input.data,
          payload.data,
          ipHash,
          userAgent,
        );
        break;
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? String((error as { code: unknown }).code)
            : null;
        if (code !== "P2034" || attempt === 1) throw error;
      }
    }
    if (!result) throw new Error("RSVP transaction did not complete.");
    const manageUrl = `/i/manage/${encodeURIComponent(result.manageToken)}`;
    const absoluteManageUrl = new URL(
      manageUrl,
      getServerEnvironment().BASE_URL,
    ).toString();
    const message = await sendConfirmation(result, absoluteManageUrl);
    return {
      status: "SUCCESS",
      message,
      manageUrl,
      submittedResponse: result.response,
    };
  } catch (error) {
    if (error instanceof PublicRsvpError) return actionError(error.message);
    console.error("Unable to save public RSVP", error);
    return actionError(
      "Your RSVP could not be saved. Nothing was changed; please try again.",
    );
  }
}
