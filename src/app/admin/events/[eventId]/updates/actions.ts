"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { requireEventAccess } from "@/lib/admin-authorization";
import { db } from "@/lib/db";

const updateSchema = z.object({
  message: z.string().trim().min(1, "Write an update first.").max(2_000),
  isImportant: z.boolean(),
});

export async function createEventUpdateAction(
  eventId: string,
  formData: FormData,
): Promise<void> {
  const admin = await requireAdmin();
  await requireEventAccess(eventId, admin);
  const parsed = updateSchema.safeParse({
    message: formData.get("message"),
    isImportant: formData.get("isImportant") === "on",
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message);

  await db.$transaction(async (transaction) => {
    const update = await transaction.eventUpdate.create({
      data: {
        eventId,
        createdById: admin.id,
        ...parsed.data,
      },
    });
    await transaction.auditLog.create({
      data: {
        adminId: admin.id,
        eventId,
        action: "event_update.created",
        entityType: "EventUpdate",
        entityId: update.id,
      },
    });
  });
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/e", "layout");
}

export async function deleteEventUpdateAction(
  eventId: string,
  updateId: string,
): Promise<void> {
  const admin = await requireAdmin();
  await requireEventAccess(eventId, admin);
  const parsedId = z.string().uuid().safeParse(updateId);
  if (!parsedId.success) throw new Error("Update not found.");

  await db.$transaction(async (transaction) => {
    const deleted = await transaction.eventUpdate.deleteMany({
      where: { id: parsedId.data, eventId },
    });
    if (deleted.count !== 1) throw new Error("Update not found.");
    await transaction.auditLog.create({
      data: {
        adminId: admin.id,
        eventId,
        action: "event_update.deleted",
        entityType: "EventUpdate",
        entityId: parsedId.data,
      },
    });
  });
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/e", "layout");
}
