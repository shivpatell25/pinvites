import { ChevronRight, Users } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdminPage } from "@/lib/admin-page";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AllGuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireAdminPage();
  const query = await searchParams;
  const search = (query.q ?? "").trim().slice(0, 160);
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const pageSize = 30;
  const where = {
    archivedAt: null,
    ...(search
      ? {
          OR: [
            { displayName: { contains: search, mode: "insensitive" as const } },
            { contactName: { contains: search, mode: "insensitive" as const } },
            {
              contactEmail: { contains: search, mode: "insensitive" as const },
            },
          ],
        }
      : {}),
  };
  const [households, total] = await Promise.all([
    db.household.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        event: { select: { id: true, title: true } },
        rsvp: { include: { attendees: true } },
      },
    }),
    db.household.count({ where }),
  ]);
  return (
    <>
      <PageHeader
        title="All guests"
        description="Search household contacts across events, then open the event-specific record to manage it."
      />
      <form className="mb-6 flex border-y border-[var(--line)] py-4">
        <input
          name="q"
          defaultValue={search}
          placeholder="Search names or email addresses"
          className="min-h-11 min-w-0 flex-1 bg-transparent px-2 outline-none"
        />
        <button className="min-h-11 rounded-full bg-[var(--accent)] px-5 text-xs font-semibold text-[var(--accent-ink)]">
          Search
        </button>
      </form>
      <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {households.map((household) => {
          const confirmed =
            household.rsvp?.attendees.filter(
              (attendee) => attendee.status === "CONFIRMED",
            ).length ?? 0;
          return (
            <Link
              key={household.id}
              href={`/admin/events/${household.event.id}/guests/${household.id}/edit`}
              className="group flex items-center gap-4 py-4"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--line)]">
                <Users size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {household.displayName}
                </p>
                <p className="mt-1 truncate text-xs text-[var(--muted)]">
                  {household.event.title} ·{" "}
                  {household.contactEmail ?? "No email"}
                </p>
              </div>
              {household.rsvp ? (
                <StatusBadge
                  tone={
                    household.rsvp.response === "YES"
                      ? "positive"
                      : household.rsvp.response === "MAYBE"
                        ? "warning"
                        : "negative"
                  }
                >
                  {household.rsvp.response} · {confirmed}
                </StatusBadge>
              ) : null}
              <ChevronRight size={16} className="text-[var(--muted)]" />
            </Link>
          );
        })}
      </div>
      <p className="mt-5 text-xs text-[var(--muted)]">
        Showing {households.length} of {total} households.
      </p>
    </>
  );
}
