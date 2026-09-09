import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdminPage } from "@/lib/admin-page";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function RsvpsPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{
    page?: string;
    q?: string;
    response?: string;
    updated?: string;
  }>;
}) {
  await requireAdminPage();
  const [{ eventId }, query] = await Promise.all([params, searchParams]);
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const pageSize = 25;
  const search = (query.q ?? "").trim().slice(0, 160);
  const response = ["YES", "MAYBE", "NO"].includes(query.response ?? "")
    ? (query.response as "YES" | "MAYBE" | "NO")
    : undefined;
  const where = {
    household: {
      eventId,
      archivedAt: null,
      ...(search
        ? {
            OR: [
              {
                displayName: { contains: search, mode: "insensitive" as const },
              },
              {
                contactName: { contains: search, mode: "insensitive" as const },
              },
              {
                contactEmail: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    },
    ...(response ? { response } : {}),
  };
  const [rsvps, total] = await Promise.all([
    db.rsvp.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        household: true,
        attendees: {
          include: { mealOption: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    }),
    db.rsvp.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <>
      <div className="mb-7">
        <h2 className="editorial text-4xl">RSVPs</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          One response can represent many attendees. Each person keeps their own
          meal and dietary information.
        </p>
      </div>
      {query.updated ? (
        <p
          className="mb-5 border-l-2 border-[var(--positive)] py-1 pl-4 text-sm text-[var(--positive)]"
          role="status"
        >
          RSVP updated and headcount recalculated.
        </p>
      ) : null}
      <form className="mb-5 flex flex-col gap-2 border-y border-[var(--line)] py-4 sm:flex-row">
        <input
          name="q"
          defaultValue={search}
          placeholder="Search households"
          className="min-h-11 min-w-0 flex-1 bg-transparent px-2 outline-none"
        />
        <select
          name="response"
          defaultValue={response ?? ""}
          className="min-h-11 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-xs"
        >
          <option value="">All responses</option>
          <option value="YES">Yes</option>
          <option value="MAYBE">Maybe</option>
          <option value="NO">No</option>
        </select>
        <button className="min-h-11 rounded-full bg-[var(--accent)] px-5 text-xs font-semibold text-[var(--accent-ink)]">
          Filter
        </button>
      </form>
      <div className="overflow-x-auto border-y border-[var(--line)]">
        <table className="w-full min-w-[850px] text-left">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
              <th className="py-3 pr-4">Household</th>
              <th className="py-3 pr-4">Response</th>
              <th className="py-3 pr-4 text-right">People</th>
              <th className="py-3 pr-4">Attendees</th>
              <th className="py-3 pr-4">Updated</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {rsvps.map((rsvp) => (
              <tr key={rsvp.id} className="text-sm">
                <td className="py-4 pr-4">
                  <p className="font-semibold">{rsvp.household.displayName}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Revision {rsvp.revision}
                  </p>
                </td>
                <td className="py-4 pr-4">
                  <StatusBadge
                    tone={
                      rsvp.response === "YES"
                        ? "positive"
                        : rsvp.response === "MAYBE"
                          ? "warning"
                          : "negative"
                    }
                  >
                    {rsvp.response}
                  </StatusBadge>
                </td>
                <td className="mono-numerals py-4 pr-4 text-right text-xl">
                  {rsvp.response === "YES"
                    ? rsvp.attendees.filter(
                        (attendee) => attendee.status === "CONFIRMED",
                      ).length
                    : 0}
                </td>
                <td className="py-4 pr-4">
                  <p className="max-w-md truncate text-xs">
                    {rsvp.attendees
                      .map((attendee) => attendee.fullName)
                      .join(", ") || "—"}
                  </p>
                  <p className="mt-1 max-w-md truncate text-[10px] text-[var(--muted)]">
                    {rsvp.attendees
                      .flatMap((attendee) =>
                        attendee.mealOption?.name
                          ? [
                              `${attendee.fullName}: ${attendee.mealOption.name}`,
                            ]
                          : [],
                      )
                      .join(" · ")}
                  </p>
                </td>
                <td className="py-4 pr-4 text-xs text-[var(--muted)]">
                  {new Intl.DateTimeFormat("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(rsvp.updatedAt)}
                </td>
                <td className="py-4">
                  <Link
                    href={`/admin/events/${eventId}/rsvps/${rsvp.id}/edit`}
                    className="grid size-9 place-items-center rounded-full hover:bg-[var(--line)]"
                    title="Edit RSVP"
                  >
                    <Pencil size={14} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rsvps.length ? (
        <p className="py-16 text-center text-sm text-[var(--muted)]">
          No responses match these filters.
        </p>
      ) : null}
      <div className="mt-6 flex items-center justify-end gap-2 text-xs">
        <Link
          aria-disabled={page <= 1}
          href={`?page=${Math.max(1, page - 1)}&q=${encodeURIComponent(search)}${response ? `&response=${response}` : ""}`}
          className="grid size-10 place-items-center rounded-full border border-[var(--line)] aria-disabled:pointer-events-none aria-disabled:opacity-40"
        >
          <ChevronLeft size={15} />
        </Link>
        <span className="px-2 text-[var(--muted)]">
          {page} / {pages}
        </span>
        <Link
          aria-disabled={page >= pages}
          href={`?page=${Math.min(pages, page + 1)}&q=${encodeURIComponent(search)}${response ? `&response=${response}` : ""}`}
          className="grid size-10 place-items-center rounded-full border border-[var(--line)] aria-disabled:pointer-events-none aria-disabled:opacity-40"
        >
          <ChevronRight size={15} />
        </Link>
      </div>
    </>
  );
}
