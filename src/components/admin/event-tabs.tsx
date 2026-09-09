"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

const tabs = [
  { segment: "", label: "Overview" },
  { segment: "/guests", label: "Guests" },
  { segment: "/rsvps", label: "RSVPs" },
  { segment: "/questions", label: "Questions & meals" },
  { segment: "/artwork", label: "Artwork" },
  { segment: "/email", label: "Email" },
  { segment: "/edit", label: "Settings" },
];

export function EventTabs({ eventId }: { eventId: string }) {
  const pathname = usePathname();
  const root = `/admin/events/${eventId}`;
  return (
    <nav
      className="-mx-5 mb-8 flex gap-1 overflow-x-auto border-b border-[var(--line)] px-5 sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0"
      aria-label="Event sections"
    >
      {tabs.map((tab) => {
        const href = `${root}${tab.segment}`;
        const active =
          tab.segment === "" ? pathname === root : pathname.startsWith(href);
        return (
          <Link
            key={tab.label}
            href={href}
            className={cn(
              "relative shrink-0 px-3 py-3 text-xs font-semibold text-[var(--muted)] transition-colors hover:text-[var(--ink)]",
              active &&
                "text-[var(--ink)] after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-[var(--accent)]",
            )}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
