"use client";

import {
  CalendarDays,
  Gauge,
  LogOut,
  Mail,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

const items = [
  { href: "/admin", label: "Overview", icon: Gauge, exact: true },
  { href: "/admin/events", label: "Events", icon: CalendarDays },
  { href: "/admin/guests", label: "Guests", icon: Users },
  { href: "/admin/email", label: "Email", icon: Mail },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminNav({
  logoutAction,
}: {
  logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();

  return (
    <>
      <p className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--muted-2)]">
        Workspace
      </p>
      <nav className="grid gap-1" aria-label="Administration">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-[13px] px-3 text-sm font-medium text-[var(--muted)] transition-[background,color,box-shadow]",
                active
                  ? "bg-[var(--selection)] text-[var(--ink)] shadow-[inset_0_0_0_1px_var(--line)]"
                  : "hover:bg-[var(--selection)] hover:text-[var(--ink)]",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon
                size={18}
                strokeWidth={active ? 2.1 : 1.7}
                aria-hidden="true"
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <form action={logoutAction} className="mt-auto pt-8">
        <button
          type="submit"
          className="flex min-h-11 w-full items-center gap-3 rounded-[12px] px-3 text-sm font-medium text-[var(--muted)] transition-colors hover:bg-[var(--line)] hover:text-[var(--ink)]"
        >
          <LogOut size={18} strokeWidth={1.7} aria-hidden="true" />
          Log out
        </button>
      </form>
    </>
  );
}

export function MobileAdminNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-3 bottom-[calc(8px+env(safe-area-inset-bottom))] z-40 flex min-h-16 items-center justify-around rounded-[22px] border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface-raised)_90%,transparent)] px-1.5 shadow-[var(--shadow-soft)] backdrop-blur-xl lg:hidden"
      aria-label="Administration"
    >
      {items.slice(0, 4).map((item) => {
        const Icon = item.icon;
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex min-h-12 min-w-16 flex-col items-center justify-center gap-1 rounded-[14px] text-[10px] font-semibold text-[var(--muted)]",
              active && "bg-[var(--accent-soft)] text-[var(--accent)]",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon
              size={18}
              strokeWidth={active ? 2.2 : 1.7}
              aria-hidden="true"
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
