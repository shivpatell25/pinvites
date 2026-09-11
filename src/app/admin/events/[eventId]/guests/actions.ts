"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { requireEventAccess } from "@/lib/admin-authorization";
import { parseGuestCsv } from "@/lib/csv";
import { db } from "@/lib/db";
import { normalizeEmail } from "@/lib/security/identity";
import {
  checkboxValue,
  formDataObject,
  householdInputSchema,
} from "@/lib/validation";

function guestErrorUrl(eventId: string, message: string, suffix = "") {
  return `/admin/events/${eventId}/guests${suffix}?error=${encodeURIComponent(message.slice(0, 180))}`;
}

export async function addHouseholdAction(
  eventId: string,
  formData: FormData,
): Promise<void> {
  const admin = await requireAdmin();
  await requireEventAccess(eventId, admin);
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!event) throw new Error("Event not found.");
  const parsed = householdInputSchema.safeParse({
    ...formDataObject(formData),
    allowPlusOne: checkboxValue(formData, "allowPlusOne"),
  });
  if (!parsed.success)
    redirect(
      guestErrorUrl(
        eventId,
        parsed.error.issues[0]?.message ?? "Check the guest details.",
      ),
    );
  const { guestNames, contactEmail, ...household } = parsed.data;
  const names = guestNames.length ? guestNames : [household.contactName];
  const created = await db.$transaction(async (transaction) => {
    const record = await transaction.household.create({
      data: {
        eventId,
        ...household,
        contactEmail,
        normalizedEmail: contactEmail ? normalizeEmail(contactEmail) : null,
        guests: {
          create: names.map((fullName, index) => ({
            fullName,
            email: index === 0 ? contactEmail : null,
            normalizedEmail:
              index === 0 && contactEmail ? normalizeEmail(contactEmail) : null,
            isPrimary: index === 0,
            sortOrder: index,
          })),
        },
      },
    });
    await transaction.auditLog.create({
      data: {
        adminId: admin.id,
        eventId,
        action: "household.created",
        entityType: "Household",
        entityId: record.id,
      },
    });
    return record;
  });
  revalidatePath(`/admin/events/${eventId}`);
  redirect(`/admin/events/${eventId}/guests?added=${created.id}`);
}

export async function updateHouseholdAction(
  eventId: string,
  householdId: string,
  formData: FormData,
): Promise<void> {
  const admin = await requireAdmin();
  await requireEventAccess(eventId, admin);
  const existing = await db.household.findFirst({
    where: { id: householdId, eventId },
    select: { id: true },
  });
  if (!existing) throw new Error("Household not found.");
  const parsed = householdInputSchema.safeParse({
    ...formDataObject(formData),
    allowPlusOne: checkboxValue(formData, "allowPlusOne"),
  });
  if (!parsed.success)
    redirect(
      `/admin/events/${eventId}/guests/${householdId}/edit?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the guest details.")}`,
    );
  const { guestNames, contactEmail, ...household } = parsed.data;
  const names = guestNames.length ? guestNames : [household.contactName];
  await db.$transaction(async (transaction) => {
    await transaction.household.update({
      where: { id: householdId },
      data: {
        ...household,
        contactEmail,
        normalizedEmail: contactEmail ? normalizeEmail(contactEmail) : null,
      },
    });
    await transaction.guest.deleteMany({
      where: { householdId, attendeeRecords: { none: {} } },
    });
    const existingGuests = await transaction.guest.findMany({
      where: { householdId },
      orderBy: { sortOrder: "asc" },
    });
    for (const [index, fullName] of names.entries()) {
      const guest = existingGuests[index];
      if (guest)
        await transaction.guest.update({
          where: { id: guest.id },
          data: {
            fullName,
            email: index === 0 ? contactEmail : null,
            normalizedEmail:
              index === 0 && contactEmail ? normalizeEmail(contactEmail) : null,
            isPrimary: index === 0,
            sortOrder: index,
          },
        });
      else
        await transaction.guest.create({
          data: {
            householdId,
            fullName,
            email: index === 0 ? contactEmail : null,
            normalizedEmail:
              index === 0 && contactEmail ? normalizeEmail(contactEmail) : null,
            isPrimary: index === 0,
            sortOrder: index,
          },
        });
    }
    await transaction.auditLog.create({
      data: {
        adminId: admin.id,
        eventId,
        action: "household.updated",
        entityType: "Household",
        entityId: householdId,
      },
    });
  });
  revalidatePath(`/admin/events/${eventId}/guests`);
  redirect(`/admin/events/${eventId}/guests?updated=${householdId}`);
}

export async function archiveHouseholdsAction(
  eventId: string,
  formData: FormData,
): Promise<void> {
  const admin = await requireAdmin();
  await requireEventAccess(eventId, admin);
  const submittedIds = formData
    .getAll("householdId")
    .filter((value): value is string => typeof value === "string");
  const ids = [
    ...new Set(
      submittedIds.flatMap((value) =>
        z.string().uuid().safeParse(value).success ? [value] : [],
      ),
    ),
  ].slice(0, 500);
  if (ids.length !== new Set(submittedIds).size) {
    redirect(guestErrorUrl(eventId, "The guest selection was invalid."));
  }
  if (!ids.length)
    redirect(guestErrorUrl(eventId, "Select at least one household."));
  const now = new Date();
  let failure: string | null = null;
  try {
    await db.$transaction(async (transaction) => {
      const result = await transaction.household.updateMany({
        where: {
          eventId,
          id: { in: ids },
          archivedAt: null,
          OR: [
            { deliveryLockedUntil: null },
            { deliveryLockedUntil: { lte: now } },
          ],
        },
        data: {
          archivedAt: now,
          deliveryLockId: null,
          deliveryLockedUntil: null,
        },
      });
      if (result.count !== ids.length) {
        throw new Error(
          "A selected household changed or is sending an invitation. Wait a moment and try again.",
        );
      }
      await transaction.invitationToken.updateMany({
        where: {
          invitation: { household: { eventId, id: { in: ids } } },
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      await transaction.invitation.updateMany({
        where: { household: { eventId, id: { in: ids } } },
        data: { status: "REVOKED", revokedAt: now },
      });
      await transaction.auditLog.create({
        data: {
          adminId: admin.id,
          eventId,
          action: "households.archived",
          entityType: "Household",
          metadata: { requested: ids.length, archived: result.count },
        },
      });
    });
  } catch (error) {
    failure =
      error instanceof Error ? error.message : "The guests were not archived.";
  }
  if (failure) redirect(guestErrorUrl(eventId, failure));
  revalidatePath(`/admin/events/${eventId}/guests`);
}

export async function restoreHouseholdAction(
  eventId: string,
  householdId: string,
): Promise<void> {
  const admin = await requireAdmin();
  await requireEventAccess(eventId, admin);
  await db.$transaction(async (transaction) => {
    await transaction.household.updateMany({
      where: { id: householdId, eventId, archivedAt: { not: null } },
      data: {
        archivedAt: null,
        deliveryLockId: null,
        deliveryLockedUntil: null,
      },
    });
    await transaction.auditLog.create({
      data: {
        adminId: admin.id,
        eventId,
        action: "household.restored",
        entityType: "Household",
        entityId: householdId,
      },
    });
  });
  revalidatePath(`/admin/events/${eventId}/guests`);
}

export async function importGuestsAction(
  eventId: string,
  formData: FormData,
): Promise<void> {
  const admin = await requireAdmin();
  await requireEventAccess(eventId, admin);
  const upload = formData.get("csv");
  if (!(upload instanceof File) || upload.size === 0)
    redirect(guestErrorUrl(eventId, "Choose a CSV file.", "/import"));
  if (upload.size > 2_000_000)
    redirect(
      guestErrorUrl(eventId, "CSV files must be under 2 MB.", "/import"),
    );
  const source = await upload.text();
  let parsed: ReturnType<typeof parseGuestCsv>;
  try {
    parsed = parseGuestCsv(source, {
      maxBytes: 2_000_000,
      maxRows: 10_000,
      previewRows: 250,
    });
  } catch (error) {
    redirect(
      guestErrorUrl(
        eventId,
        error instanceof Error ? error.message : "Could not parse the CSV.",
        "/import",
      ),
    );
  }
  if (!parsed.canImport)
    redirect(
      guestErrorUrl(
        eventId,
        `Import blocked: ${parsed.invalidRows} row${parsed.invalidRows === 1 ? " has" : "s have"} errors. Fix the file and preview it again.`,
        "/import",
      ),
    );
  const emails = parsed.rows.flatMap((row) =>
    row.email ? [normalizeEmail(row.email)] : [],
  );
  const duplicates = emails.length
    ? await db.household.findMany({
        where: { eventId, normalizedEmail: { in: emails } },
        select: { contactEmail: true },
        take: 10,
      })
    : [];
  if (duplicates.length)
    redirect(
      guestErrorUrl(
        eventId,
        `Import blocked because ${duplicates.length} email address${duplicates.length === 1 ? " already exists" : "es already exist"} in this event.`,
        "/import",
      ),
    );

  await db.$transaction(async (transaction) => {
    for (const row of parsed.rows) {
      const email = row.email ? normalizeEmail(row.email) : null;
      await transaction.household.create({
        data: {
          eventId,
          displayName: row.partyName ?? row.name,
          contactName: row.name,
          contactEmail: row.email,
          normalizedEmail: email,
          contactPhone: row.phone,
          partySizeLimit: row.maxPartySize,
          allowPlusOne: row.allowPlusOne,
          tags: [...row.tags],
          notes: row.notes,
          guests: {
            create: {
              fullName: row.name,
              email: row.email,
              normalizedEmail: email,
              isPrimary: true,
            },
          },
        },
      });
    }
    await transaction.auditLog.create({
      data: {
        adminId: admin.id,
        eventId,
        action: "households.csv_imported",
        entityType: "Household",
        metadata: { count: parsed.rows.length },
      },
    });
  });
  revalidatePath(`/admin/events/${eventId}/guests`);
  redirect(`/admin/events/${eventId}/guests?imported=${parsed.rows.length}`);
}
