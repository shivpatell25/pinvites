"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createAdminSession, setAdminSessionCookie } from "@/lib/auth";
import { lookupAdminInvite } from "@/lib/admin-invites";
import { db } from "@/lib/db";
import { requestContext } from "@/lib/request";
import { hashPassword, validateAdminPassword } from "@/lib/security/password";

const setupSchema = z.object({
  token: z.string().min(1).max(256),
  displayName: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(1024),
  confirmPassword: z.string().min(1).max(1024),
});

function setupErrorUrl(token: string, message: string) {
  return `/admin/invite/${encodeURIComponent(token)}?error=${encodeURIComponent(message.slice(0, 180))}`;
}

export async function acceptAdminInviteAction(
  formData: FormData,
): Promise<void> {
  const parsed = setupSchema.safeParse({
    token: formData.get("token"),
    displayName: formData.get("displayName"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  const token = String(formData.get("token") ?? "");
  if (!parsed.success) {
    redirect(
      setupErrorUrl(
        token,
        parsed.error.issues[0]?.message ?? "Check your account details.",
      ),
    );
  }
  if (parsed.data.password !== parsed.data.confirmPassword) {
    redirect(setupErrorUrl(token, "Passwords do not match."));
  }
  const passwordStrength = validateAdminPassword(parsed.data.password);
  if (!passwordStrength.valid) {
    redirect(
      setupErrorUrl(
        token,
        passwordStrength.errors[0] ?? "Choose a stronger password.",
      ),
    );
  }

  const lookup = await lookupAdminInvite(token);
  if (lookup.status !== "PENDING") {
    redirect(setupErrorUrl(token, "This invitation is no longer valid."));
  }
  const existing = await db.admin.findUnique({
    where: { normalizedEmail: lookup.invite.normalizedEmail },
    select: { id: true },
  });
  if (existing) {
    redirect(setupErrorUrl(token, "An account already exists for this email."));
  }

  const now = new Date();
  const passwordHash = await hashPassword(parsed.data.password);
  let admin: { id: string };
  try {
    admin = await db.$transaction(async (transaction) => {
      const created = await transaction.admin.create({
        data: {
          email: lookup.invite.email,
          normalizedEmail: lookup.invite.normalizedEmail,
          displayName: parsed.data.displayName,
          passwordHash,
          role: "ADMIN",
          passwordChangedAt: now,
        },
        select: { id: true },
      });
      const accepted = await transaction.adminInvite.updateMany({
        where: {
          id: lookup.invite.id,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { acceptedAt: now, acceptedAdminId: created.id },
      });
      if (accepted.count !== 1) throw new Error("INVITE_CHANGED");
      await transaction.auditLog.create({
        data: {
          adminId: created.id,
          action: "admin.invite_accepted",
          entityType: "Admin",
          entityId: created.id,
          metadata: { inviteId: lookup.invite.id },
        },
      });
      return created;
    });
  } catch {
    redirect(
      setupErrorUrl(
        token,
        "The account could not be created. The invitation may have changed.",
      ),
    );
  }

  const session = await createAdminSession(admin.id, await requestContext());
  await setAdminSessionCookie(session);
  redirect("/admin?welcome=1");
}
