import { ArrowRight, CircleAlert, LockKeyhole } from "lucide-react";
import Link from "next/link";

import { Brand } from "@/components/brand/brand";
import { FieldShell, Input } from "@/components/ui/form-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { lookupAdminInvite } from "@/lib/admin-invites";

import { acceptAdminInviteAction } from "@/app/admin/invite/actions";

export const dynamic = "force-dynamic";

export default async function AdminInviteSetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const lookup = await lookupAdminInvite(token);

  return (
    <main className="grid min-h-dvh bg-[var(--surface)] lg:grid-cols-[minmax(440px,0.82fr)_1.18fr]">
      <section className="flex min-h-dvh flex-col px-6 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(28px,env(safe-area-inset-top))] sm:px-12 lg:px-16 xl:px-24">
        <Brand />
        <div className="my-auto w-full max-w-md py-16">
          {lookup.status === "PENDING" ? (
            <>
              <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
                Invited by {lookup.invite.invitedBy.displayName}
              </p>
              <h1 className="editorial text-[clamp(3rem,7vw,5.4rem)] leading-[0.88]">
                Create your
                <br /> account.
              </h1>
              <p className="mt-5 text-sm leading-relaxed text-[var(--muted)]">
                Your private workspace will let you create and manage your own
                events, invitations, guests, and RSVPs.
              </p>
              {query.error ? (
                <p
                  className="mt-6 border-l-2 border-[var(--negative)] py-1 pl-4 text-sm text-[var(--negative)]"
                  role="alert"
                >
                  {query.error}
                </p>
              ) : null}
              <form
                action={acceptAdminInviteAction}
                className="mt-8 grid gap-5"
              >
                <input type="hidden" name="token" value={token} />
                <FieldShell label="Email" htmlFor="invite-account-email">
                  <Input
                    id="invite-account-email"
                    value={lookup.invite.email}
                    readOnly
                    aria-readonly="true"
                  />
                </FieldShell>
                <FieldShell label="Name" htmlFor="invite-account-name">
                  <Input
                    id="invite-account-name"
                    name="displayName"
                    defaultValue={lookup.invite.displayName}
                    autoComplete="name"
                    maxLength={120}
                    required
                  />
                </FieldShell>
                <FieldShell
                  label="Password"
                  htmlFor="invite-account-password"
                  hint="Use at least 12 characters."
                >
                  <Input
                    id="invite-account-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    required
                  />
                </FieldShell>
                <FieldShell
                  label="Confirm password"
                  htmlFor="invite-account-confirm-password"
                >
                  <Input
                    id="invite-account-confirm-password"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    required
                  />
                </FieldShell>
                <SubmitButton pendingLabel="Creating account…">
                  Create account <ArrowRight size={16} aria-hidden="true" />
                </SubmitButton>
              </form>
            </>
          ) : (
            <InviteUnavailable status={lookup.status} />
          )}
        </div>
      </section>
      <aside className="relative hidden overflow-hidden bg-[#09090b] p-16 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(10,132,255,.34),transparent_38%),radial-gradient(circle_at_20%_88%,rgba(52,199,89,.18),transparent_36%)]" />
        <div className="relative ml-auto grid size-16 place-items-center rounded-[22px] border border-white/15 bg-white/8">
          <LockKeyhole size={26} strokeWidth={1.5} />
        </div>
        <p className="editorial relative max-w-2xl text-6xl leading-[0.95]">
          A private place for beautifully considered gatherings.
        </p>
      </aside>
    </main>
  );
}

function InviteUnavailable({
  status,
}: {
  status: "INVALID" | "EXPIRED" | "REVOKED" | "ACCEPTED";
}) {
  const message = {
    INVALID: "This account invitation could not be found.",
    EXPIRED: "This account invitation has expired. Ask the owner to resend it.",
    REVOKED: "This account invitation has been revoked.",
    ACCEPTED: "This account invitation has already been used.",
  }[status];
  return (
    <div>
      <CircleAlert size={26} className="text-[var(--warning)]" />
      <h1 className="editorial mt-5 text-5xl leading-none">
        Invitation unavailable.
      </h1>
      <p className="mt-5 text-sm leading-relaxed text-[var(--muted)]">
        {message}
      </p>
      <Link
        href="/admin/login"
        className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--line-strong)] px-5 text-sm font-semibold"
      >
        Go to sign in <ArrowRight size={15} />
      </Link>
    </div>
  );
}
