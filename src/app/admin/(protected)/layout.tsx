import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";

import { logoutAction } from "../auth-actions";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdminPage();

  return (
    <AdminShell adminName={admin.displayName} logoutAction={logoutAction}>
      {children}
    </AdminShell>
  );
}
