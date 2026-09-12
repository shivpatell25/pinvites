"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { requireEventAccess } from "@/lib/admin-authorization";
import { db } from "@/lib/db";
import { normalizeEmail } from "@/lib/security/identity";

const attendeeSchema = z.object({
  attendeeId: z.string().uuid().nullable(),
  guestId: z
    .union([z.string().uuid(), z.literal("")])
    .transform((value) => value || null),
  fullName: z.string().trim().min(1).max(160),
  mealOptionId: z
    .union([z.string().uuid(), z.literal("")])
    .transform((value) => value || null),
  dietaryRestrictions: z
    .string()
    .trim()
    .max(2_000)
    .transform((value) => value || null),
});

const adminRsvpSchema = z.object({
  response: z.enum(["YES", "MAYBE", "NO"]),
  revision: z.number().int().positive(),
  contactEmail: z
    .union([z.literal(""), z.email().max(320)])
    .transform((value) => (value ? normalizeEmail(value) : null)),
  message: z
    .string()
    .trim()
    .max(2_000)
    .transform((value) => value || null),
  attendees: z.array(attendeeSchema).max(100),
});

export async function updateRsvpAsAdminAction(
  eventId: string,
  rsvpId: string,
  formData: FormData,
): Promise<void> {
  const admin = await requireAdmin();
  await requireEventAccess(eventId, admin);
  const raw = formData.get("payload");
  let json: unknown;
  try {
    json =
      typeof raw === "string" && raw.length <= 100_000 ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }
  const parsed = adminRsvpSchema.safeParse(json);
  if (!parsed.success)
    redirect(
      `/admin/events/${eventId}/rsvps/${rsvpId}/edit?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the RSVP details.")}`,
    );
  const rsvp = await db.rsvp.findFirst({
    where: { id: rsvpId, household: { eventId, archivedAt: null } },
    include: {
      household: { include: { guests: true } },
      attendees: { select: { id: true, guestId: true, fullName: true } },
    },
  });
  if (!rsvp) throw new Error("RSVP not found.");
  if (rsvp.revision !== parsed.data.revision)
    redirect(
      `/admin/events/${eventId}/rsvps/${rsvpId}/edit?error=${encodeURIComponent("This RSVP changed in another window. Reload before saving.")}`,
    );
  const attendees = parsed.data.response === "NO" ? [] : parsed.data.attendees;
  if (
    parsed.data.response !== "NO" &&
    (attendees.length < 1 || attendees.length > rsvp.household.partySizeLimit)
  )
    redirect(
      `/admin/events/${eventId}/rsvps/${rsvpId}/edit?error=${encodeURIComponent(`This household allows 1–${rsvp.household.partySizeLimit} attendees.`)}`,
    );
  const validGuestIds = new Set(rsvp.household.guests.map((guest) => guest.id));
  const submittedAttendeeIds = attendees.flatMap((attendee) =>
    attendee.attendeeId ? [attendee.attendeeId] : [],
  );
  const existingAttendees = new Map(
    rsvp.attendees.map((attendee) => [attendee.id, attendee]),
  );
  if (
    new Set(submittedAttendeeIds).size !== submittedAttendeeIds.length ||
    submittedAttendeeIds.some((id) => !existingAttendees.has(id))
  )
    throw new Error("An attendee record does not belong to this RSVP.");
  const submittedGuestIds = attendees.flatMap((attendee) =>
    attendee.guestId ? [attendee.guestId] : [],
  );
  if (new Set(submittedGuestIds).size !== submittedGuestIds.length)
    redirect(
      `/admin/events/${eventId}/rsvps/${rsvpId}/edit?error=${encodeURIComponent("A named guest can only appear once.")}`,
    );
  if (
    attendees.some(
      (attendee) => attendee.guestId && !validGuestIds.has(attendee.guestId),
    )
  )
    throw new Error("A guest does not belong to this household.");
  if (
    !rsvp.household.allowPlusOne &&
    attendees.some((attendee) => !attendee.guestId)
  )
    redirect(
      `/admin/events/${eventId}/rsvps/${rsvpId}/edit?error=${encodeURIComponent("This household does not allow unnamed +1s.")}`,
    );
  const mealIds = new Set(
    (
      await db.mealOption.findMany({
        where: { eventId, isActive: true },
        select: { id: true },
      })
    ).map((meal) => meal.id),
  );
  if (
    attendees.some(
      (attendee) =>
        attendee.mealOptionId && !mealIds.has(attendee.mealOptionId),
    )
  )
    throw new Error("A meal option is invalid.");
  const revision = rsvp.revision + 1;
  await db.$transaction(async (transaction) => {
    const updated = await transaction.rsvp.updateMany({
      where: { id: rsvpId, revision: rsvp.revision },
      data: {
        response: parsed.data.response,
        contactEmail: parsed.data.contactEmail,
        message: parsed.data.message,
        revision,
        submittedAt: new Date(),
      },
    });
    if (updated.count !== 1) throw new Error("RSVP revision conflict.");
    await transaction.attendee.deleteMany({
      where: {
        rsvpId,
        ...(submittedAttendeeIds.length > 0
          ? { id: { notIn: submittedAttendeeIds } }
          : {}),
      },
    });
    if (submittedAttendeeIds.length > 0) {
      // Clear assignments first so retained rows can safely swap named guests.
      await transaction.attendee.updateMany({
        where: { rsvpId, id: { in: submittedAttendeeIds } },
        data: { guestId: null },
      });
    }
    for (const [index, attendee] of attendees.entries()) {
      const data = {
        guestId: attendee.guestId,
        fullName: attendee.fullName,
        mealOptionId: attendee.mealOptionId,
        dietaryRestrictions: attendee.dietaryRestrictions,
        status: parsed.data.response === "YES" ? "CONFIRMED" : "MAYBE",
        isPlusOne: attendee.guestId === null,
        sortOrder: index,
      } as const;
      if (attendee.attendeeId) {
        const previous = existingAttendees.get(attendee.attendeeId);
        if (
          previous?.guestId !== attendee.guestId ||
          (previous?.guestId === null &&
            attendee.guestId === null &&
            previous.fullName !== attendee.fullName)
        ) {
          await transaction.rsvpAnswer.deleteMany({
            where: { attendeeId: attendee.attendeeId },
          });
        }
        await transaction.attendee.update({
          where: { id: attendee.attendeeId },
          data,
        });
      } else {
        await transaction.attendee.create({ data: { rsvpId, ...data } });
      }
    }
    await transaction.rsvpSubmission.create({
      data: {
        rsvpId,
        invitationId: rsvp.invitationId,
        actorAdminId: admin.id,
        revision,
        source: "ADMIN",
        response: parsed.data.response,
        confirmedAttendeeCount:
          parsed.data.response === "YES" ? attendees.length : 0,
        maybeAttendeeCount:
          parsed.data.response === "MAYBE" ? attendees.length : 0,
        message: parsed.data.message,
      },
    });
    await transaction.analyticsEvent.create({
      data: {
        eventId,
        householdId: rsvp.householdId,
        invitationId: rsvp.invitationId,
        rsvpId,
        type: "RSVP_UPDATED",
        metadata: {
          actor: "HOST",
          response: parsed.data.response,
          previousResponse: rsvp.response,
        },
      },
    });
    const attendeeDelta = attendees.length - rsvp.attendees.length;
    if (attendeeDelta !== 0) {
      await transaction.analyticsEvent.create({
        data: {
          eventId,
          householdId: rsvp.householdId,
          invitationId: rsvp.invitationId,
          rsvpId,
          type: attendeeDelta > 0 ? "GUEST_ADDED" : "GUEST_REMOVED",
          metadata: { actor: "HOST", count: Math.abs(attendeeDelta) },
        },
      });
    }
    await transaction.auditLog.create({
      data: {
        adminId: admin.id,
        eventId,
        action: "rsvp.updated",
        entityType: "Rsvp",
        entityId: rsvpId,
        metadata: { revision },
      },
    });
  });
  revalidatePath(`/admin/events/${eventId}`);
  redirect(`/admin/events/${eventId}/rsvps?updated=${rsvpId}`);
}
