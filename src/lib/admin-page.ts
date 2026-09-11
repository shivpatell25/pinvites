import "server-only";

import { notFound, redirect } from "next/navigation";

import { eventAccessWhere } from "@/lib/admin-authorization";
import { getCurrentAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

/** Authorize each data-bearing page, including cached-layout client navigations. */
export async function requireAdminPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

/** Authorize a direct visit to any page nested beneath an event. */
export async function requireEventPage(eventId: string) {
  const admin = await requireAdminPage();
  const event = await db.event.findFirst({
    where: eventAccessWhere(admin, eventId),
    select: { id: true },
  });
  if (!event) notFound();
  return admin;
}
