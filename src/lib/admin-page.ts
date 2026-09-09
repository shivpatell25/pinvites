import "server-only";

import { redirect } from "next/navigation";

import { getCurrentAdmin } from "@/lib/auth";

/** Authorize each data-bearing page, including cached-layout client navigations. */
export async function requireAdminPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}
