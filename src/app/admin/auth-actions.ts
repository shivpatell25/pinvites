"use server";

import { redirect } from "next/navigation";

import {
  authenticateAdminCredentials,
  createAdminSession,
  logoutCurrentAdmin,
  setAdminSessionCookie,
} from "@/lib/auth";
import { requestContext } from "@/lib/request";
import { formDataObject, loginSchema } from "@/lib/validation";

export async function loginAction(formData: FormData): Promise<void> {
  const parsed = loginSchema.safeParse(formDataObject(formData));
  if (!parsed.success) {
    redirect("/admin/login?error=credentials");
  }

  const context = await requestContext();
  const result = await authenticateAdminCredentials({
    ...parsed.data,
    ...context,
  });

  if (!result.ok) {
    if (result.reason === "RATE_LIMITED") {
      const minutes = Math.max(1, Math.ceil(result.retryAfterSeconds / 60));
      redirect(`/admin/login?error=rate&minutes=${minutes}`);
    }
    redirect("/admin/login?error=credentials");
  }

  const session = await createAdminSession(result.admin.id, context);
  await setAdminSessionCookie(session);
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await logoutCurrentAdmin();
  redirect("/admin/login");
}
