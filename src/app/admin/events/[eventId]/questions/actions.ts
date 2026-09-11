"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { QuestionConditionOperator } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { requireEventAccess } from "@/lib/admin-authorization";
import { db } from "@/lib/db";
import {
  checkboxValue,
  formDataObject,
  mealOptionSchema,
  questionInputSchema,
} from "@/lib/validation";

function errorUrl(eventId: string, message: string) {
  return `/admin/events/${eventId}/questions?error=${encodeURIComponent(message.slice(0, 180))}`;
}

export async function addMealOptionAction(
  eventId: string,
  formData: FormData,
): Promise<void> {
  const admin = await requireAdmin();
  await requireEventAccess(eventId, admin);
  const parsed = mealOptionSchema.safeParse(formDataObject(formData));
  if (!parsed.success)
    redirect(
      errorUrl(
        eventId,
        parsed.error.issues[0]?.message ?? "Check the meal option.",
      ),
    );
  const count = await db.mealOption.count({ where: { eventId } });
  const meal = await db.mealOption.create({
    data: { eventId, ...parsed.data, sortOrder: count },
  });
  await db.auditLog.create({
    data: {
      adminId: admin.id,
      eventId,
      action: "meal.created",
      entityType: "MealOption",
      entityId: meal.id,
    },
  });
  revalidatePath(`/admin/events/${eventId}/questions`);
}

export async function toggleMealOptionAction(
  eventId: string,
  mealId: string,
  active: boolean,
): Promise<void> {
  const admin = await requireAdmin();
  await requireEventAccess(eventId, admin);
  await db.mealOption.updateMany({
    where: { id: mealId, eventId },
    data: { isActive: active },
  });
  await db.auditLog.create({
    data: {
      adminId: admin.id,
      eventId,
      action: active ? "meal.activated" : "meal.deactivated",
      entityType: "MealOption",
      entityId: mealId,
    },
  });
  revalidatePath(`/admin/events/${eventId}/questions`);
  revalidatePath(`/e`, "layout");
}

export async function addQuestionAction(
  eventId: string,
  formData: FormData,
): Promise<void> {
  const admin = await requireAdmin();
  await requireEventAccess(eventId, admin);
  const parsed = questionInputSchema.safeParse({
    ...formDataObject(formData),
    isRequired: checkboxValue(formData, "isRequired"),
  });
  if (!parsed.success)
    redirect(
      errorUrl(
        eventId,
        parsed.error.issues[0]?.message ?? "Check the question.",
      ),
    );
  if (
    ["SINGLE_SELECT", "MULTI_SELECT"].includes(parsed.data.type) &&
    parsed.data.options.length < 2
  )
    redirect(errorUrl(eventId, "Choice questions need at least two options."));
  const count = await db.question.count({ where: { eventId } });
  const { options, ...questionData } = parsed.data;
  const question = await db.question.create({
    data: {
      eventId,
      ...questionData,
      sortOrder: count,
      ...(options.length
        ? {
            options: {
              create: options.map((label, index) => ({
                label,
                sortOrder: index,
              })),
            },
          }
        : {}),
    },
  });
  await db.auditLog.create({
    data: {
      adminId: admin.id,
      eventId,
      action: "question.created",
      entityType: "Question",
      entityId: question.id,
    },
  });
  revalidatePath(`/admin/events/${eventId}/questions`);
  revalidatePath(`/e`, "layout");
}

export async function toggleQuestionAction(
  eventId: string,
  questionId: string,
  active: boolean,
): Promise<void> {
  const admin = await requireAdmin();
  await requireEventAccess(eventId, admin);
  await db.question.updateMany({
    where: { id: questionId, eventId },
    data: { isActive: active },
  });
  await db.auditLog.create({
    data: {
      adminId: admin.id,
      eventId,
      action: active ? "question.activated" : "question.deactivated",
      entityType: "Question",
      entityId: questionId,
    },
  });
  revalidatePath(`/admin/events/${eventId}/questions`);
  revalidatePath(`/e`, "layout");
}

const conditionSchema = z.object({
  sourceQuestionId: z.string().uuid(),
  operator: z.enum(QuestionConditionOperator),
  optionId: z
    .union([z.string().uuid(), z.literal("")])
    .transform((value) => value || null),
  textValue: z
    .string()
    .trim()
    .max(2_000)
    .transform((value) => value || null),
  booleanValue: z
    .union([z.literal("true"), z.literal("false"), z.literal("")])
    .transform((value) => (value === "" ? null : value === "true")),
});

export async function addQuestionConditionAction(
  eventId: string,
  questionId: string,
  formData: FormData,
): Promise<void> {
  const admin = await requireAdmin();
  await requireEventAccess(eventId, admin);
  const parsed = conditionSchema.safeParse(formDataObject(formData));
  if (!parsed.success)
    redirect(
      errorUrl(
        eventId,
        parsed.error.issues[0]?.message ?? "Check the condition.",
      ),
    );
  if (parsed.data.sourceQuestionId === questionId)
    redirect(errorUrl(eventId, "A question cannot depend on itself."));
  const [target, source] = await Promise.all([
    db.question.findFirst({
      where: { id: questionId, eventId },
      select: { id: true },
    }),
    db.question.findFirst({
      where: { id: parsed.data.sourceQuestionId, eventId },
      include: { options: true },
    }),
  ]);
  if (!target || !source) throw new Error("Question not found.");
  if (
    parsed.data.optionId &&
    !source.options.some((option) => option.id === parsed.data.optionId)
  )
    redirect(
      errorUrl(
        eventId,
        "The selected option does not belong to the source question.",
      ),
    );
  const count = await db.questionCondition.count({ where: { questionId } });
  const condition = await db.questionCondition.create({
    data: { questionId, ...parsed.data, sortOrder: count },
  });
  await db.auditLog.create({
    data: {
      adminId: admin.id,
      eventId,
      action: "question.condition_created",
      entityType: "QuestionCondition",
      entityId: condition.id,
    },
  });
  revalidatePath(`/admin/events/${eventId}/questions`);
}

export async function deleteQuestionConditionAction(
  eventId: string,
  conditionId: string,
): Promise<void> {
  const admin = await requireAdmin();
  await requireEventAccess(eventId, admin);
  const result = await db.questionCondition.deleteMany({
    where: { id: conditionId, question: { eventId } },
  });
  if (result.count)
    await db.auditLog.create({
      data: {
        adminId: admin.id,
        eventId,
        action: "question.condition_deleted",
        entityType: "QuestionCondition",
        entityId: conditionId,
      },
    });
  revalidatePath(`/admin/events/${eventId}/questions`);
}
