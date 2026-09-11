import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { requireAdmin, type AdminPrincipal } from "@/lib/auth";
import { db } from "@/lib/db";

export class AdminAuthorizationError extends Error {
  constructor(message = "You do not have access to this resource.") {
    super(message);
    this.name = "AdminAuthorizationError";
  }
}

export function isOwner(admin: AdminPrincipal): boolean {
  return admin.role === "OWNER";
}

export function eventScopeFor(admin: AdminPrincipal): Prisma.EventWhereInput {
  return isOwner(admin) ? {} : { createdById: admin.id };
}

export function eventAccessWhere(
  admin: AdminPrincipal,
  eventId: string,
): Prisma.EventWhereInput {
  return { id: eventId, ...eventScopeFor(admin) };
}

export async function requireOwner(): Promise<AdminPrincipal> {
  const admin = await requireAdmin();
  if (!isOwner(admin)) throw new AdminAuthorizationError();
  return admin;
}

export async function requireEventAccess(
  eventId: string,
  admin?: AdminPrincipal,
): Promise<AdminPrincipal> {
  const principal = admin ?? (await requireAdmin());
  const event = await db.event.findFirst({
    where: eventAccessWhere(principal, eventId),
    select: { id: true },
  });
  if (!event) throw new AdminAuthorizationError("Event not found.");
  return principal;
}
