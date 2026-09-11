"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOwner } from "@/lib/admin-authorization";
import { db } from "@/lib/db";
import { createAdminInviteEmail } from "@/lib/email";
import { getServerEnvironment } from "@/lib/env";
import { createVerifiedMailer } from "@/lib/invitation-delivery";
import { normalizeEmail } from "@/lib/security/identity";
import { generateSecureToken } from "@/lib/security/tokens";

const inviteSchema = z.object({
  displayName: z.string().trim().min(1, "Enter a name.").max(120),
  email: z.email("Enter a valid email address.").max(320),
});

const identifierSchema = z.string().uuid();
const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;

export type AdminInviteActionState =
  | { status: "IDLE" }
  | { status: "ERROR"; message: string }
  | {
      status: "SUCCESS";
      message: string;
      setupUrl: string;
      emailSent: boolean;
    };

function inviteExpiresLine(expiresAt: Date) {
  return `Expires ${new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(expiresAt)}`;
}

async function deliverAdminInvite({
  inviteId,
  deliveryVersion,
  email,
  displayName,
  inviterName,
  setupUrl,
  expiresAt,
}: {
  inviteId: string;
  deliveryVersion: number;
  email: string;
  displayName: string;
  inviterName: string;
  setupUrl: string;
  expiresAt: Date;
}) {
  const mailer = await createVerifiedMailer();
  try {
    return await mailer.send({
      deliveryKey: `admin-invite:${inviteId}:v${deliveryVersion}`,
      kind: "ADMIN_INVITE",
      to: email,
      email: createAdminInviteEmail({
        recipientName: displayName,
        inviterName,
        setupUrl,
        expiresLine: inviteExpiresLine(expiresAt),
      }),
      metadata: { adminInviteId: inviteId },
    });
  } finally {
    mailer.close();
  }
}

export async function createAdminInviteAction(
  _previous: AdminInviteActionState,
  formData: FormData,
): Promise<AdminInviteActionState> {
  const owner = await requireOwner();
  const parsed = inviteSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return {
      status: "ERROR",
      message: parsed.error.issues[0]?.message ?? "Check the invitation.",
    };
  }

  const normalizedEmail = normalizeEmail(parsed.data.email);
  const [existingAdmin, existingInvite] = await Promise.all([
    db.admin.findUnique({ where: { normalizedEmail }, select: { id: true } }),
    db.adminInvite.findFirst({
      where: {
        normalizedEmail,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    }),
  ]);
  if (existingAdmin) {
    return { status: "ERROR", message: "That person already has an account." };
  }
  if (existingInvite) {
    return {
      status: "ERROR",
      message: "A valid invitation already exists for that email address.",
    };
  }

  const generated = generateSecureToken("admin-invite");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const invite = await db.$transaction(async (transaction) => {
    const created = await transaction.adminInvite.create({
      data: {
        email: parsed.data.email.trim(),
        normalizedEmail,
        displayName: parsed.data.displayName,
        tokenHash: generated.tokenHash,
        expiresAt,
        invitedById: owner.id,
      },
    });
    await transaction.auditLog.create({
      data: {
        adminId: owner.id,
        action: "admin.invite_created",
        entityType: "AdminInvite",
        entityId: created.id,
        metadata: { invitedEmail: normalizedEmail },
      },
    });
    return created;
  });
  const setupUrl = new URL(
    `/admin/invite/${encodeURIComponent(generated.token)}`,
    getServerEnvironment().BASE_URL,
  ).toString();

  let emailSent = false;
  let deliveryMessage =
    "Invitation created. Copy the private setup link and send it securely.";
  try {
    const result = await deliverAdminInvite({
      inviteId: invite.id,
      deliveryVersion: invite.deliveryVersion,
      email: invite.email,
      displayName: invite.displayName,
      inviterName: owner.displayName,
      setupUrl,
      expiresAt,
    });
    emailSent = result.status === "sent";
    if (emailSent) {
      await db.adminInvite.update({
        where: { id: invite.id },
        data: { sentAt: new Date(), lastError: null },
      });
      deliveryMessage = `Invitation sent to ${invite.email}.`;
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Email delivery failed.";
    await db.adminInvite.update({
      where: { id: invite.id },
      data: { lastError: message.slice(0, 4_000) },
    });
    deliveryMessage = `${message} The invitation was created; copy the setup link instead.`;
  }

  revalidatePath("/admin");
  return { status: "SUCCESS", message: deliveryMessage, setupUrl, emailSent };
}

export async function resendAdminInviteAction(inviteId: string): Promise<void> {
  const owner = await requireOwner();
  if (!identifierSchema.safeParse(inviteId).success) return;
  const existing = await db.adminInvite.findFirst({
    where: { id: inviteId, acceptedAt: null, revokedAt: null },
  });
  if (!existing) return;

  const generated = generateSecureToken("admin-invite");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const updated = await db.adminInvite.update({
    where: { id: existing.id },
    data: {
      tokenHash: generated.tokenHash,
      expiresAt,
      deliveryVersion: { increment: 1 },
      lastError: null,
    },
  });
  const setupUrl = new URL(
    `/admin/invite/${encodeURIComponent(generated.token)}`,
    getServerEnvironment().BASE_URL,
  ).toString();

  try {
    const result = await deliverAdminInvite({
      inviteId: updated.id,
      deliveryVersion: updated.deliveryVersion,
      email: updated.email,
      displayName: updated.displayName,
      inviterName: owner.displayName,
      setupUrl,
      expiresAt,
    });
    if (result.status === "sent") {
      await db.adminInvite.update({
        where: { id: updated.id },
        data: { sentAt: new Date(), lastError: null },
      });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Email delivery failed.";
    await db.adminInvite.update({
      where: { id: updated.id },
      data: { lastError: message.slice(0, 4_000) },
    });
  }
  await db.auditLog.create({
    data: {
      adminId: owner.id,
      action: "admin.invite_resent",
      entityType: "AdminInvite",
      entityId: updated.id,
    },
  });
  revalidatePath("/admin");
}

export async function revokeAdminInviteAction(inviteId: string): Promise<void> {
  const owner = await requireOwner();
  if (!identifierSchema.safeParse(inviteId).success) return;
  const result = await db.adminInvite.updateMany({
    where: { id: inviteId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count) {
    await db.auditLog.create({
      data: {
        adminId: owner.id,
        action: "admin.invite_revoked",
        entityType: "AdminInvite",
        entityId: inviteId,
      },
    });
  }
  revalidatePath("/admin");
}

export async function setAdminActiveAction(
  adminId: string,
  active: boolean,
): Promise<void> {
  const owner = await requireOwner();
  if (!identifierSchema.safeParse(adminId).success || adminId === owner.id)
    return;
  const now = new Date();
  const result = await db.admin.updateMany({
    where: { id: adminId, role: "ADMIN" },
    data: { isActive: active },
  });
  if (result.count) {
    if (!active) {
      await db.adminSession.updateMany({
        where: { adminId, revokedAt: null },
        data: { revokedAt: now },
      });
    }
    await db.auditLog.create({
      data: {
        adminId: owner.id,
        action: active ? "admin.activated" : "admin.deactivated",
        entityType: "Admin",
        entityId: adminId,
      },
    });
  }
  revalidatePath("/admin");
}

export async function revokeAdminSessionsAction(
  adminId: string,
): Promise<void> {
  const owner = await requireOwner();
  if (!identifierSchema.safeParse(adminId).success || adminId === owner.id)
    return;
  const revokedAt = new Date();
  await db.$transaction([
    db.adminSession.updateMany({
      where: { adminId, revokedAt: null },
      data: { revokedAt },
    }),
    db.auditLog.create({
      data: {
        adminId: owner.id,
        action: "admin.sessions_revoked",
        entityType: "Admin",
        entityId: adminId,
      },
    }),
  ]);
  revalidatePath("/admin");
}
