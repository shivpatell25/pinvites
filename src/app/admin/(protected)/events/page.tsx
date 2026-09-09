import { CalendarPlus, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { EventStatus } from "@/generated/prisma/client";
import { requireAdminPage } from "@/lib/admin-page";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";

import { duplicateEventAction } from "../../events/actions";

export const dynamic = "force-dynamic";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string }>;
}) {
  await requireAdminPage();
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const pageSize = 20;
  const query = (params.q ?? "").trim().slice(0, 120);
  const status = Object.values(EventStatus).includes(
    params.status as EventStatus,
  )
    ? (params.status as EventStatus)
    : undefined;
  const where = {
    ...(status ? { status } : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" as const } },
            { hostName: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [events, total] = await Promise.all([
    db.event.findMany({
      where,
      orderBy: [{ status: "asc" }, { startsAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: {
          select: { households: { where: { archivedAt: null } } },
        },
      },
    }),
    db.event.count({ where }),
  ]);
  const attendeeCounts = new Map(
    await Promise.all(
      events.map(
        async (event) =>
          [
            event.id,
            await db.attendee.count({
              where: {
                status: "CONFIRMED",
                rsvp: {
                  household: { eventId: event.id, archivedAt: null },
                },
              },
            }),
          ] as const,
      ),
    ),
  );
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <PageHeader
        title="Events"
        description="Every gathering has its own invitation, rules, guest list, and real headcount."
        actions={
          <Link
            href="/admin/events/new"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] shadow-[0_1px_2px_rgb(0_0_0_/_14%)] transition-[filter,transform] hover:brightness-105 active:scale-[0.98]"
          >
            <CalendarPlus size={16} /> New event
          </Link>
        }
      />
      <form className="mb-4 flex flex-col gap-2 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--shadow-card)] sm:flex-row">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search events"
          className="min-h-11 min-w-0 flex-1 rounded-[13px] bg-[var(--surface-raised)] px-3 outline-none ring-1 ring-[var(--line)] placeholder:text-[var(--muted-2)] focus:ring-[var(--accent)]"
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="min-h-11 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm"
        >
          <option value="">All states</option>
          {Object.values(EventStatus).map((value) => (
            <option key={value} value={value}>
              {value[0]}
              {value.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <button className="min-h-11 rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)]">
          Filter
        </button>
      </form>
      {events.length ? (
        <div className="divide-y divide-[var(--line)] overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface-raised)] px-5 shadow-[var(--shadow-card)]">
          {events.map((event) => (
            <article
              key={event.id}
              className="grid gap-5 py-6 sm:grid-cols-[88px_minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="flex size-[76px] flex-col items-center justify-center bg-[var(--ink)] text-[var(--canvas)]">
                <span className="editorial text-3xl leading-none">
                  {new Intl.DateTimeFormat("en-US", {
                    day: "numeric",
                    timeZone: event.timezone,
                  }).format(event.startsAt)}
                </span>
                <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] opacity-60">
                  {new Intl.DateTimeFormat("en-US", {
                    month: "short",
                    timeZone: event.timezone,
                  }).format(event.startsAt)}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/events/${event.id}`}
                    className="editorial truncate text-3xl leading-tight hover:underline hover:underline-offset-4"
                  >
                    {event.title}
                  </Link>
                  <StatusBadge
                    tone={
                      event.status === "PUBLISHED"
                        ? "positive"
                        : event.status === "CLOSED"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {event.status}
                  </StatusBadge>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {formatDate(event.startsAt, event.timezone)} ·{" "}
                  {event._count.households} households ·{" "}
                  {attendeeCounts.get(event.id) ?? 0} confirmed attendees
                </p>
              </div>
              <div className="flex gap-2">
                <form action={duplicateEventAction.bind(null, event.id)}>
                  <button
                    type="submit"
                    className="grid size-10 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--line)]"
                    title="Duplicate event"
                  >
                    <Copy size={16} />
                    <span className="sr-only">Duplicate {event.title}</span>
                  </button>
                </form>
                <Link
                  href={`/admin/events/${event.id}`}
                  className="inline-flex min-h-10 items-center gap-1 rounded-full border border-[var(--line-strong)] px-4 text-xs font-semibold"
                >
                  Manage <ChevronRight size={14} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="py-20 text-center">
          <p className="editorial text-4xl">No events found.</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Try a different search, or create a new event.
          </p>
        </div>
      )}
      <div className="mt-6 flex items-center justify-between text-xs text-[var(--muted)]">
        <span>
          {total} event{total === 1 ? "" : "s"}
        </span>
        <div className="flex gap-2">
          <Link
            aria-disabled={page <= 1}
            href={`?page=${Math.max(1, page - 1)}&q=${encodeURIComponent(query)}${status ? `&status=${status}` : ""}`}
            className="grid size-10 place-items-center rounded-full border border-[var(--line)] aria-disabled:pointer-events-none aria-disabled:opacity-40"
          >
            <ChevronLeft size={15} />
          </Link>
          <span className="grid min-h-10 place-items-center px-2">
            {page} / {pages}
          </span>
          <Link
            aria-disabled={page >= pages}
            href={`?page=${Math.min(pages, page + 1)}&q=${encodeURIComponent(query)}${status ? `&status=${status}` : ""}`}
            className="grid size-10 place-items-center rounded-full border border-[var(--line)] aria-disabled:pointer-events-none aria-disabled:opacity-40"
          >
            <ChevronRight size={15} />
          </Link>
        </div>
      </div>
    </>
  );
}
