import "server-only";

import { db } from "@/lib/db";
import { hasValidTokenShape, hashToken } from "@/lib/security/tokens";

export type AdminInviteLookup =
  | { status: "INVALID" }
  | {
      status: "PENDING" | "EXPIRED" | "REVOKED" | "ACCEPTED";
      invite: {
        id: string;
        email: string;
        normalizedEmail: string;
        displayName: string;
        role: "OWNER" | "ADMIN";
        expiresAt: Date;
        invitedBy: { displayName: string };
      };
    };

export async function lookupAdminInvite(
  token: string,
  now = new Date(),
): Promise<AdminInviteLookup> {
  if (!hasValidTokenShape(token, "admin-invite")) {
    return { status: "INVALID" };
  }
  const invite = await db.adminInvite.findUnique({
    where: { tokenHash: hashToken(token, "admin-invite") },
    select: {
      id: true,
      email: true,
      normalizedEmail: true,
      displayName: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      invitedBy: { select: { displayName: true } },
    },
  });
  if (!invite) return { status: "INVALID" };
  const publicInvite = {
    id: invite.id,
    email: invite.email,
    normalizedEmail: invite.normalizedEmail,
    displayName: invite.displayName,
    role: invite.role,
    expiresAt: invite.expiresAt,
    invitedBy: invite.invitedBy,
  };
  if (invite.revokedAt) return { status: "REVOKED", invite: publicInvite };
  if (invite.acceptedAt) return { status: "ACCEPTED", invite: publicInvite };
  if (invite.expiresAt <= now)
    return { status: "EXPIRED", invite: publicInvite };
  return { status: "PENDING", invite: publicInvite };
}
