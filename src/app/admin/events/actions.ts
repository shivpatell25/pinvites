"use server";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { fromZonedTime } from "date-fns-tz";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sharp, { type Metadata } from "sharp";

import { EventStatus, Prisma, QuestionType } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getServerEnvironment } from "@/lib/env";
import {
  checkboxValue,
  eventInputSchema,
  formDataObject,
} from "@/lib/validation";

function isIanaTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function localDate(
  value: FormDataEntryValue | null,
  timezone: string,
  required: boolean,
) {
  if (typeof value !== "string" || value === "") {
    if (required) throw new Error("A start date and time is required.");
    return null;
  }
  const date = fromZonedTime(value, timezone);
  if (Number.isNaN(date.getTime()))
    throw new Error("Enter a valid date and time.");
  return date;
}

function parseEventForm(formData: FormData) {
  const raw = formDataObject(formData);
  const timezone = typeof raw.timezone === "string" ? raw.timezone : "";
  if (!isIanaTimezone(timezone))
    throw new Error("Enter a valid IANA timezone.");

  return eventInputSchema.safeParse({
    ...raw,
    startsAt: localDate(formData.get("startsAt"), timezone, true),
    endsAt: localDate(formData.get("endsAt"), timezone, false) ?? "",
    rsvpDeadline:
      localDate(formData.get("rsvpDeadline"), timezone, false) ?? "",
    primaryColor:
      typeof raw.primaryColor === "string" && raw.primaryColor !== ""
        ? raw.primaryColor
        : null,
    isAllDay: checkboxValue(formData, "isAllDay"),
    isPublic: checkboxValue(formData, "isPublic"),
    allowPlusOne: checkboxValue(formData, "allowPlusOne"),
    allowMaybe: checkboxValue(formData, "allowMaybe"),
  });
}

function eventErrorUrl(pathname: string, message: string) {
  return `${pathname}?error=${encodeURIComponent(message.slice(0, 180))}`;
}

function isUniqueError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function createEventAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  let parsed: ReturnType<typeof eventInputSchema.safeParse>;
  try {
    parsed = parseEventForm(formData);
  } catch (error) {
    redirect(
      eventErrorUrl(
        "/admin/events/new",
        error instanceof Error ? error.message : "Invalid event",
      ),
    );
  }
  if (!parsed.success) {
    redirect(
      eventErrorUrl(
        "/admin/events/new",
        parsed.error.issues[0]?.message ?? "Check the event details.",
      ),
    );
  }

  let event: { id: string };
  try {
    event = await db.$transaction(async (transaction) => {
      const created = await transaction.event.create({
        data: {
          ...parsed.data,
          createdById: admin.id,
          updatedById: admin.id,
        },
        select: { id: true },
      });
      await transaction.auditLog.create({
        data: {
          adminId: admin.id,
          eventId: created.id,
          action: "event.created",
          entityType: "Event",
          entityId: created.id,
        },
      });
      return created;
    });
  } catch (error) {
    if (isUniqueError(error))
      redirect(
        eventErrorUrl(
          "/admin/events/new",
          "That public link is already in use.",
        ),
      );
    throw error;
  }
  redirect(`/admin/events/${event.id}?created=1`);
}

export async function updateEventAction(
  eventId: string,
  formData: FormData,
): Promise<void> {
  const admin = await requireAdmin();
  let parsed: ReturnType<typeof eventInputSchema.safeParse>;
  try {
    parsed = parseEventForm(formData);
  } catch (error) {
    redirect(
      eventErrorUrl(
        `/admin/events/${eventId}/edit`,
        error instanceof Error ? error.message : "Invalid event",
      ),
    );
  }
  if (!parsed.success) {
    redirect(
      eventErrorUrl(
        `/admin/events/${eventId}/edit`,
        parsed.error.issues[0]?.message ?? "Check the event details.",
      ),
    );
  }
  try {
    await db.$transaction(async (transaction) => {
      await transaction.event.update({
        where: { id: eventId },
        data: { ...parsed.data, updatedById: admin.id },
      });
      await transaction.auditLog.create({
        data: {
          adminId: admin.id,
          eventId,
          action: "event.updated",
          entityType: "Event",
          entityId: eventId,
        },
      });
    });
  } catch (error) {
    if (isUniqueError(error))
      redirect(
        eventErrorUrl(
          `/admin/events/${eventId}/edit`,
          "That public link is already in use.",
        ),
      );
    throw error;
  }
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/e`, "layout");
  redirect(`/admin/events/${eventId}?updated=1`);
}

export async function setEventStatusAction(
  eventId: string,
  status: EventStatus,
): Promise<void> {
  const admin = await requireAdmin();
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { status: true, heroArtworkId: true },
  });
  if (!event) throw new Error("Event not found.");
  const allowed: Record<EventStatus, EventStatus[]> = {
    DRAFT: [EventStatus.PUBLISHED, EventStatus.ARCHIVED],
    PUBLISHED: [EventStatus.CLOSED, EventStatus.ARCHIVED],
    CLOSED: [EventStatus.PUBLISHED, EventStatus.ARCHIVED],
    ARCHIVED: [EventStatus.DRAFT],
  };
  if (!allowed[event.status].includes(status))
    throw new Error("That event status change is not allowed.");

  const now = new Date();
  let transitionFailure: string | null = null;
  try {
    await db.$transaction(async (transaction) => {
      const updated = await transaction.event.updateMany({
        where: {
          id: eventId,
          status: event.status,
          OR: [
            { deliveryLockedUntil: null },
            { deliveryLockedUntil: { lte: now } },
          ],
        },
        data: {
          status,
          updatedById: admin.id,
          deliveryLockId: null,
          deliveryLockedUntil: null,
          ...(status === EventStatus.PUBLISHED
            ? { publishedAt: now, closedAt: null, archivedAt: null }
            : {}),
          ...(status === EventStatus.CLOSED ? { closedAt: now } : {}),
          ...(status === EventStatus.ARCHIVED ? { archivedAt: now } : {}),
          ...(status === EventStatus.DRAFT
            ? { publishedAt: null, closedAt: null, archivedAt: null }
            : {}),
        },
      });
      if (updated.count !== 1) {
        throw new Error("DELIVERY_IN_PROGRESS");
      }
      await transaction.auditLog.create({
        data: {
          adminId: admin.id,
          eventId,
          action: `event.${status.toLowerCase()}`,
          entityType: "Event",
          entityId: eventId,
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DELIVERY_IN_PROGRESS") {
      transitionFailure =
        "An invitation operation is in progress. Wait a moment and try the status change again.";
    } else {
      console.error("Unable to change event status", error);
      transitionFailure = "The event status could not be changed.";
    }
  }
  if (transitionFailure) {
    redirect(
      `/admin/events/${eventId}?error=${encodeURIComponent(transitionFailure)}`,
    );
  }
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/e`, "layout");
}

async function availableDuplicateSlug(baseSlug: string) {
  const root = `${baseSlug.replace(/-copy(?:-\d+)?$/, "")}-copy`;
  for (let index = 1; index <= 999; index += 1) {
    const slug = index === 1 ? root : `${root}-${index}`;
    const found = await db.event.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!found) return slug;
  }
  return `${root}-${randomUUID().slice(0, 8)}`;
}

export async function duplicateEventAction(eventId: string): Promise<void> {
  const admin = await requireAdmin();
  const source = await db.event.findUnique({
    where: { id: eventId },
    include: {
      mealOptions: { orderBy: { sortOrder: "asc" } },
      questions: {
        include: {
          options: { orderBy: { sortOrder: "asc" } },
          conditions: { orderBy: { sortOrder: "asc" } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!source) throw new Error("Event not found.");
  const slug = await availableDuplicateSlug(source.slug);
  const duplicate = await db.$transaction(async (transaction) => {
    const created = await transaction.event.create({
      data: {
        slug,
        title: `${source.title} — Copy`,
        subtitle: source.subtitle,
        hostName: source.hostName,
        description: source.description,
        details: source.details,
        timezone: source.timezone,
        startsAt: source.startsAt,
        endsAt: source.endsAt,
        isAllDay: source.isAllDay,
        rsvpDeadline: source.rsvpDeadline,
        status: EventStatus.DRAFT,
        isPublic: false,
        partySizeLimit: source.partySizeLimit,
        allowPlusOne: source.allowPlusOne,
        allowMaybe: source.allowMaybe,
        venueName: source.venueName,
        venueAddress: source.venueAddress,
        venueUrl: source.venueUrl,
        latitude: source.latitude,
        longitude: source.longitude,
        dressCode: source.dressCode,
        primaryColor: source.primaryColor,
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    for (const meal of source.mealOptions) {
      await transaction.mealOption.create({
        data: {
          eventId: created.id,
          name: meal.name,
          description: meal.description,
          sortOrder: meal.sortOrder,
          isActive: meal.isActive,
        },
      });
    }
    const questionIds = new Map<string, string>();
    const optionIds = new Map<string, string>();
    for (const question of source.questions) {
      const createdQuestion = await transaction.question.create({
        data: {
          eventId: created.id,
          prompt: question.prompt,
          helpText: question.helpText,
          type: question.type,
          scope: question.scope,
          isRequired: question.isRequired,
          isActive: question.isActive,
          sortOrder: question.sortOrder,
          visibleForResponses: question.visibleForResponses,
        },
      });
      questionIds.set(question.id, createdQuestion.id);
      if (
        question.type === QuestionType.SINGLE_SELECT ||
        question.type === QuestionType.MULTI_SELECT
      ) {
        for (const option of question.options) {
          const createdOption = await transaction.questionOption.create({
            data: {
              questionId: createdQuestion.id,
              label: option.label,
              sortOrder: option.sortOrder,
              isActive: option.isActive,
            },
          });
          optionIds.set(option.id, createdOption.id);
        }
      }
    }
    for (const question of source.questions) {
      const questionId = questionIds.get(question.id);
      if (!questionId)
        throw new Error("Duplicated question mapping is missing.");
      for (const condition of question.conditions) {
        const sourceQuestionId = questionIds.get(condition.sourceQuestionId);
        if (!sourceQuestionId)
          throw new Error("Duplicated condition source is missing.");
        const optionId = condition.optionId
          ? optionIds.get(condition.optionId)
          : undefined;
        if (condition.optionId && !optionId)
          throw new Error("Duplicated condition option is missing.");
        await transaction.questionCondition.create({
          data: {
            questionId,
            sourceQuestionId,
            operator: condition.operator,
            optionId: optionId ?? null,
            textValue: condition.textValue,
            booleanValue: condition.booleanValue,
            sortOrder: condition.sortOrder,
          },
        });
      }
    }
    await transaction.auditLog.create({
      data: {
        adminId: admin.id,
        eventId: created.id,
        action: "event.duplicated",
        entityType: "Event",
        entityId: created.id,
        metadata: { sourceEventId: source.id },
      },
    });
    return created;
  });
  redirect(`/admin/events/${duplicate.id}/edit?duplicated=1`);
}

export async function uploadArtworkAction(
  eventId: string,
  formData: FormData,
): Promise<void> {
  const admin = await requireAdmin();
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!event) throw new Error("Event not found.");
  const file = formData.get("artwork");
  if (!(file instanceof File) || file.size === 0) {
    redirect(
      eventErrorUrl(
        `/admin/events/${eventId}/artwork`,
        "Choose an image to upload.",
      ),
    );
  }
  const environment = getServerEnvironment();
  if (file.size > environment.MAX_UPLOAD_MB * 1_048_576) {
    redirect(
      eventErrorUrl(
        `/admin/events/${eventId}/artwork`,
        `Artwork must be under ${environment.MAX_UPLOAD_MB} MB.`,
      ),
    );
  }
  if (
    !new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]).has(
      file.type,
    )
  ) {
    redirect(
      eventErrorUrl(
        `/admin/events/${eventId}/artwork`,
        "Use a JPEG, PNG, WebP, or AVIF image.",
      ),
    );
  }

  const input = Buffer.from(await file.arrayBuffer());
  let metadata: Metadata;
  try {
    metadata = await sharp(input, {
      failOn: "error",
      limitInputPixels: 80_000_000,
    }).metadata();
  } catch {
    redirect(
      eventErrorUrl(
        `/admin/events/${eventId}/artwork`,
        "The image could not be decoded safely.",
      ),
    );
  }
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width < 600 ||
    metadata.height < 600
  ) {
    redirect(
      eventErrorUrl(
        `/admin/events/${eventId}/artwork`,
        "Artwork must be at least 600 × 600 pixels.",
      ),
    );
  }

  const output = await sharp(input, {
    failOn: "error",
    limitInputPixels: 80_000_000,
  })
    .rotate()
    .resize({
      width: 3000,
      height: 3000,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 90, effort: 5 })
    .toBuffer({ resolveWithObject: true });
  const storageKey = `${eventId}/${randomUUID()}.webp`;
  const root = path.resolve(environment.MEDIA_ROOT);
  const destination = path.resolve(root, storageKey);
  if (!destination.startsWith(`${root}${path.sep}`))
    throw new Error("Unsafe media path.");
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, output.data, { flag: "wx", mode: 0o640 });

  let artwork: { id: string };
  try {
    artwork = await db.$transaction(async (transaction) => {
      const created = await transaction.eventArtwork.create({
        data: {
          eventId,
          kind: "HERO",
          storageKey,
          originalName: file.name.slice(0, 255),
          mimeType: "image/webp",
          byteSize: output.data.byteLength,
          checksumSha256: createHash("sha256")
            .update(output.data)
            .digest("hex"),
          width: output.info.width,
          height: output.info.height,
          altText:
            String(formData.get("altText") ?? "")
              .trim()
              .slice(0, 300) || null,
          uploadedById: admin.id,
        },
      });
      await transaction.event.update({
        where: { id: eventId },
        data: { heroArtworkId: created.id, updatedById: admin.id },
      });
      await transaction.auditLog.create({
        data: {
          adminId: admin.id,
          eventId,
          action: "artwork.uploaded",
          entityType: "EventArtwork",
          entityId: created.id,
        },
      });
      return created;
    });
  } catch (error) {
    await unlink(destination).catch(() => undefined);
    throw error;
  }
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/e`, "layout");
  redirect(`/admin/events/${eventId}/artwork?uploaded=${artwork.id}`);
}

export async function deleteArtworkAction(
  eventId: string,
  artworkId: string,
): Promise<void> {
  const admin = await requireAdmin();
  const artwork = await db.eventArtwork.findFirst({
    where: { id: artworkId, eventId },
  });
  if (!artwork) return;
  await db.$transaction(async (transaction) => {
    await transaction.event.updateMany({
      where: { id: eventId, heroArtworkId: artworkId },
      data: { heroArtworkId: null, updatedById: admin.id },
    });
    await transaction.eventArtwork.delete({ where: { id: artworkId } });
    await transaction.auditLog.create({
      data: {
        adminId: admin.id,
        eventId,
        action: "artwork.deleted",
        entityType: "EventArtwork",
        entityId: artworkId,
      },
    });
  });
  const root = path.resolve(getServerEnvironment().MEDIA_ROOT);
  const target = path.resolve(root, artwork.storageKey);
  if (target.startsWith(`${root}${path.sep}`))
    await unlink(target).catch(() => undefined);
  revalidatePath(`/admin/events/${eventId}`);
}
