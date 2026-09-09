"use server";

import { redirect } from "next/navigation";

import { clearAdminSessionCookie, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  hashPassword,
  validateAdminPassword,
  verifyPassword,
} from "@/lib/security/password";

export async function changePasswordAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmation = String(formData.get("confirmPassword") ?? "");
  if (newPassword !== confirmation) {
    redirect("/admin/settings?error=New+passwords+do+not+match.");
  }
  const strength = validateAdminPassword(newPassword);
  if (!strength.valid) {
    redirect(
      `/admin/settings?error=${encodeURIComponent(strength.errors[0] ?? "Choose a stronger password.")}`,
    );
  }
  const record = await db.admin.findUnique({ where: { id: admin.id } });
  if (
    !record ||
    !(await verifyPassword(currentPassword, record.passwordHash))
  ) {
    redirect("/admin/settings?error=The+current+password+is+incorrect.");
  }
  const changedAt = new Date();
  const passwordHash = await hashPassword(newPassword);
  await db.$transaction(async (transaction) => {
    await transaction.admin.update({
      where: { id: admin.id },
      data: {
        passwordHash,
        passwordChangedAt: changedAt,
      },
    });
    await transaction.adminSession.updateMany({
      where: { adminId: admin.id, revokedAt: null },
      data: { revokedAt: changedAt },
    });
    await transaction.auditLog.create({
      data: {
        adminId: admin.id,
        action: "admin.password_changed",
        entityType: "Admin",
        entityId: admin.id,
      },
    });
  });
  await clearAdminSessionCookie();
  redirect("/admin/login?password=changed");
}
