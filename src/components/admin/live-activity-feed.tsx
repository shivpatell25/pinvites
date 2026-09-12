"use client";

import {
  Eye,
  MessageCircle,
  SlidersHorizontal,
  UserRoundPlus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { GuestActivityItem } from "@/lib/guest-activity";

import styles from "./live-activity-feed.module.css";

function relativeTime(isoDate: string, now: number) {
  const deltaSeconds = Math.round((new Date(isoDate).getTime() - now) / 1_000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(deltaSeconds) < 60)
    return formatter.format(deltaSeconds, "second");
  const minutes = Math.round(deltaSeconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

function ActivityIcon({ kind }: { kind: GuestActivityItem["kind"] }) {
  const props = { size: 16, strokeWidth: 1.8 } as const;
  if (kind === "VIEW") return <Eye {...props} />;
  if (kind === "PARTY") return <UserRoundPlus {...props} />;
  if (kind === "ANSWERS") return <SlidersHorizontal {...props} />;
  return <MessageCircle {...props} />;
}

export function LiveActivityFeed({
  eventId,
  initialItems,
}: {
  eventId: string;
  initialItems: GuestActivityItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    async function refresh() {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch(`/admin/events/${eventId}/activity`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          items?: GuestActivityItem[];
        };
        if (active && Array.isArray(payload.items)) setItems(payload.items);
      } catch {
        // A polling failure should not interrupt the dashboard.
      }
    }
    const poll = window.setInterval(refresh, 12_000);
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    function onVisibilityChange() {
      if (document.visibilityState === "visible") void refresh();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(poll);
      window.clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [eventId]);

  const visibleItems = useMemo(() => items.slice(0, 12), [items]);

  return (
    <section className="border-t border-[var(--line-strong)] pt-7">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="editorial text-3xl">Guest activity</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            The human side of your event, as it happens
          </p>
        </div>
        <span className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[0.16em] text-[var(--muted)] uppercase">
          <span
            className={`${styles.liveDot} size-1.5 rounded-full bg-[var(--positive)]`}
            aria-hidden="true"
          />
          Live
        </span>
      </div>
      {visibleItems.length ? (
        <ol className="divide-y divide-[var(--line)]" aria-live="polite">
          {visibleItems.map((item) => (
            <li
              key={item.id}
              className={`${styles.item} flex gap-3 py-3.5 first:pt-1`}
            >
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[var(--surface-muted)] text-[var(--muted)]">
                <ActivityIcon kind={item.kind} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-5">{item.message}</p>
                <time
                  dateTime={item.occurredAt}
                  className="mt-0.5 block text-[11px] text-[var(--muted-2)]"
                >
                  {relativeTime(item.occurredAt, now)}
                </time>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="py-10 text-center">
          <p className="text-sm font-semibold">Quiet for now</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Views and RSVP changes will appear here.
          </p>
        </div>
      )}
    </section>
  );
}
