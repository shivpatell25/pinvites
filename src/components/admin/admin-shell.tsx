import { Brand } from "@/components/brand/brand";
import { ThemeSwitch } from "@/components/ui/theme-switch";

import { AdminNav, MobileAdminNav } from "./admin-nav";

export function AdminShell({
  children,
  adminName,
  logoutAction,
}: {
  children: React.ReactNode;
  adminName: string;
  logoutAction: () => Promise<void>;
}) {
  return (
    <div className="min-h-dvh bg-[var(--canvas)] lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-4 lg:p-4">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="sticky top-4 hidden h-[calc(100dvh-2rem)] rounded-[26px] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--shadow-card)] lg:flex lg:flex-col">
        <div className="mb-7 flex min-h-[76px] items-center justify-center rounded-[19px] border border-[var(--line)] bg-[var(--surface-raised)] px-3.5 shadow-[inset_0_1px_0_rgb(255_255_255_/_4%)]">
          <Brand />
        </div>
        <AdminNav logoutAction={logoutAction} />
        <div className="mt-3 flex items-center gap-3 rounded-[18px] border border-[var(--line)] bg-[var(--surface-raised)] p-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-xs font-bold uppercase text-[var(--accent)]">
            {adminName.slice(0, 2)}
          </span>
          <p className="min-w-0 flex-1 truncate text-xs font-semibold">
            {adminName}
          </p>
          <ThemeSwitch />
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex min-h-[72px] items-center justify-between border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--canvas)_86%,transparent)] px-5 backdrop-blur-xl lg:hidden">
          <Brand />
          <ThemeSwitch />
        </header>
        <main
          id="main-content"
          className="mx-auto w-full max-w-[1500px] px-5 pb-28 pt-7 sm:px-8 lg:px-7 lg:pb-10 lg:pt-6 xl:px-10"
        >
          {children}
        </main>
        <MobileAdminNav />
      </div>
    </div>
  );
}
