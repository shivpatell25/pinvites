import { ArrowRight } from "lucide-react";
import { redirect } from "next/navigation";

import { Brand } from "@/components/brand/brand";
import { FieldShell, Input } from "@/components/ui/form-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { getCurrentAdmin } from "@/lib/auth";

import { loginAction } from "../../auth-actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; minutes?: string }>;
}) {
  if (await getCurrentAdmin()) redirect("/admin");
  const query = await searchParams;

  return (
    <main className="grid min-h-dvh bg-[var(--surface)] lg:grid-cols-[minmax(440px,0.82fr)_1.18fr]">
      <section className="flex min-h-dvh flex-col px-6 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(28px,env(safe-area-inset-top))] sm:px-12 lg:px-16 xl:px-24">
        <Brand />
        <div className="my-auto w-full max-w-md py-16">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
            Private administration
          </p>
          <h1 className="editorial text-[clamp(3rem,7vw,5.4rem)] leading-[0.88]">
            Welcome
            <br />
            back.
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-[var(--muted)]">
            Sign in to manage invitations, guests, and the people actually
            coming.
          </p>

          {query.error ? (
            <div
              className="mt-7 border-l-2 border-[var(--negative)] py-1 pl-4 text-sm text-[var(--negative)]"
              role="alert"
            >
              {query.error === "rate"
                ? `Too many attempts. Try again in about ${query.minutes ?? "a few"} minutes.`
                : "The email or password was not recognized."}
            </div>
          ) : null}

          <form action={loginAction} className="mt-8 grid gap-5">
            <FieldShell label="Email" htmlFor="email">
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                inputMode="email"
                required
                autoFocus
              />
            </FieldShell>
            <FieldShell label="Password" htmlFor="password">
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </FieldShell>
            <SubmitButton className="mt-2 w-full" pendingLabel="Signing in…">
              Sign in <ArrowRight size={16} aria-hidden="true" />
            </SubmitButton>
          </form>
        </div>
        <p className="text-xs text-[var(--muted-2)]">
          No public registration. Accounts are created by the server owner.
        </p>
      </section>
      <aside
        className="relative hidden overflow-hidden bg-[#19140f] lg:block"
        aria-hidden="true"
      >
        <div className="absolute inset-0 opacity-90 [background:radial-gradient(circle_at_72%_28%,#8f4f3f_0,transparent_34%),radial-gradient(circle_at_24%_78%,#354c43_0,transparent_38%),#18130f]" />
        <div className="absolute inset-[7%] rounded-[42px] border border-white/10 bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,.08)]" />
        <div className="absolute inset-x-[15%] top-[16%] text-[#f6eee2]">
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/50">
            Tonight, together
          </p>
          <p className="editorial mt-5 text-[clamp(4rem,8vw,9rem)] leading-[0.78]">
            A reason
            <br />
            to gather.
          </p>
        </div>
        <div className="absolute bottom-[12%] left-[15%] max-w-sm border-t border-white/20 pt-5 text-sm leading-relaxed text-white/60">
          Invitations with the feeling of print, the intelligence of software,
          and none of the noise.
        </div>
      </aside>
    </main>
  );
}
