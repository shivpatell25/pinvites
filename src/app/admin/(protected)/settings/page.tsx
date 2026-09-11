import { CheckCircle2, CircleAlert, LockKeyhole, Server } from "lucide-react";

import { FieldShell, Input } from "@/components/ui/form-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireAdminPage } from "@/lib/admin-page";
import { smtpConfigurationFromEnv } from "@/lib/email";
import { getServerEnvironment } from "@/lib/env";

import { changePasswordAction } from "@/app/admin/settings/actions";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [admin, query] = await Promise.all([requireAdminPage(), searchParams]);
  const environment = getServerEnvironment();
  const smtp = smtpConfigurationFromEnv();
  return (
    <>
      <div className="mb-8">
        <h1 className="editorial text-5xl">Settings</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Security, deployment origin, and delivery readiness.
        </p>
      </div>
      <div
        className={`grid gap-12 ${admin.role === "OWNER" ? "xl:grid-cols-2" : "max-w-2xl"}`}
      >
        <section>
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <LockKeyhole size={16} /> Administrator
          </h2>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Signed in as {admin.email}. Changing the password securely revokes
            every active session.
          </p>
          {query.error ? (
            <p
              className="mt-5 border-l-2 border-[var(--negative)] py-1 pl-4 text-sm text-[var(--negative)]"
              role="alert"
            >
              {query.error}
            </p>
          ) : null}
          <form
            action={changePasswordAction}
            className="mt-6 grid max-w-lg gap-5"
          >
            <FieldShell label="Current password" htmlFor="currentPassword">
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </FieldShell>
            <FieldShell
              label="New password"
              htmlFor="newPassword"
              hint="Use at least 12 characters. A password manager-generated phrase is ideal."
            >
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </FieldShell>
            <FieldShell label="Confirm new password" htmlFor="confirmPassword">
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </FieldShell>
            <SubmitButton
              className="justify-self-start"
              pendingLabel="Changing password…"
            >
              Change password
            </SubmitButton>
          </form>
        </section>
        {admin.role === "OWNER" ? (
          <section>
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <Server size={16} /> Production readiness
            </h2>
            <dl className="mt-5 divide-y divide-[var(--line)] border-y border-[var(--line)]">
              <SettingRow
                label="Public origin"
                value={environment.BASE_URL}
                ready={environment.BASE_URL.startsWith("https://")}
              />
              <SettingRow
                label="Secure cookies"
                value={
                  environment.BASE_URL.startsWith("https://")
                    ? "Enabled"
                    : "Development mode"
                }
                ready={environment.BASE_URL.startsWith("https://")}
              />
              <SettingRow
                label="Trusted proxy headers"
                value={environment.TRUST_PROXY_HEADERS ? "Enabled" : "Disabled"}
                ready
              />
              <SettingRow
                label="SMTP"
                value={smtp.configured ? "Configured" : smtp.reason}
                ready={smtp.configured}
              />
              <SettingRow
                label="Media storage"
                value={environment.MEDIA_ROOT}
                ready
              />
            </dl>
          </section>
        ) : null}
      </div>
    </>
  );
}

function SettingRow({
  label,
  value,
  ready,
}: {
  label: string;
  value: string;
  ready: boolean;
}) {
  return (
    <div className="grid grid-cols-[130px_minmax(0,1fr)_auto] items-center gap-3 py-4 text-xs">
      <dt className="font-semibold">{label}</dt>
      <dd className="min-w-0 truncate text-[var(--muted)]" title={value}>
        {value}
      </dd>
      {ready ? (
        <CheckCircle2
          size={15}
          className="text-[var(--positive)]"
          aria-label="Ready"
        />
      ) : (
        <CircleAlert
          size={15}
          className="text-[var(--warning)]"
          aria-label="Needs attention"
        />
      )}
    </div>
  );
}
