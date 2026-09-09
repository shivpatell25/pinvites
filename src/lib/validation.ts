import { z } from "zod";

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value));

const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .transform((value) => (value === "" ? null : value))
  .refine((value) => {
    if (value === null) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }, "Enter a valid HTTP or HTTPS URL");

const optionalDate = z.preprocess(
  (value) =>
    value === "" || value === null || value === undefined ? null : value,
  z.union([z.null(), z.coerce.date()]),
);

export const eventInputSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Use lowercase letters, numbers, and hyphens",
      ),
    subtitle: optionalTrimmed(240),
    hostName: z.string().trim().min(1, "Host name is required").max(160),
    description: optionalTrimmed(10_000),
    details: optionalTrimmed(20_000),
    timezone: z.string().trim().min(1).max(100),
    startsAt: z.coerce.date(),
    endsAt: optionalDate,
    rsvpDeadline: optionalDate,
    isAllDay: z.coerce.boolean().default(false),
    isPublic: z.coerce.boolean().default(false),
    allowPlusOne: z.coerce.boolean().default(false),
    allowMaybe: z.coerce.boolean().default(true),
    partySizeLimit: z.coerce.number().int().min(1).max(100),
    venueName: optionalTrimmed(200),
    venueAddress: optionalTrimmed(2_000),
    venueUrl: optionalUrl,
    dressCode: optionalTrimmed(160),
    primaryColor: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex color")
      .nullable(),
  })
  .refine((value) => value.endsAt === null || value.endsAt > value.startsAt, {
    message: "End time must be after the start",
    path: ["endsAt"],
  });

export type EventInput = z.infer<typeof eventInputSchema>;

export const householdInputSchema = z.object({
  displayName: z.string().trim().min(1, "Household name is required").max(200),
  contactName: z.string().trim().min(1, "Contact name is required").max(160),
  contactEmail: z
    .union([z.email().max(320), z.literal("")])
    .transform((value) => (value === "" ? null : value.toLowerCase())),
  contactPhone: optionalTrimmed(40),
  partySizeLimit: z.coerce.number().int().min(1).max(100),
  allowPlusOne: z.coerce.boolean().default(false),
  notes: optionalTrimmed(5_000),
  tags: z
    .string()
    .max(500)
    .transform((value) =>
      [
        ...new Set(
          value
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ].slice(0, 30),
    ),
  guestNames: z
    .string()
    .max(4_000)
    .transform((value) =>
      [
        ...new Set(
          value
            .split(/\r?\n/)
            .map((name) => name.trim())
            .filter(Boolean),
        ),
      ].slice(0, 100),
    ),
});

export type HouseholdInput = z.infer<typeof householdInputSchema>;

export const mealOptionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: optionalTrimmed(300),
});

export const questionInputSchema = z.object({
  prompt: z.string().trim().min(1).max(300),
  helpText: optionalTrimmed(500),
  type: z.enum([
    "SHORT_TEXT",
    "LONG_TEXT",
    "SINGLE_SELECT",
    "MULTI_SELECT",
    "BOOLEAN",
  ]),
  scope: z.enum(["HOUSEHOLD", "ATTENDEE"]),
  isRequired: z.coerce.boolean().default(false),
  options: z
    .string()
    .max(4_000)
    .transform((value) =>
      [
        ...new Set(
          value
            .split(/\r?\n/)
            .map((option) => option.trim())
            .filter(Boolean),
        ),
      ].slice(0, 100),
    ),
});

export const loginSchema = z.object({
  email: z
    .email()
    .max(320)
    .transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(1024),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(10).max(100).catch(25),
  query: z.string().trim().max(200).catch(""),
});

export function formDataObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export function checkboxValue(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}
