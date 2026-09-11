import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Download,
  FileUp,
  Pencil,
  Plus,
  QrCode,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { HouseholdForm } from "@/components/admin/household-form";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Prisma } from "@/generated/prisma/client";
import { requireEventPage } from "@/lib/admin-page";
import { db } from "@/lib/db";

import {
  addHouseholdAction,
  archiveHouseholdsAction,
  restoreHouseholdAction,
} from "@/app/admin/events/[eventId]/guests/actions";

export const dynamic = "force-dynamic";

export default async function GuestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{
    page?: string;
    q?: string;
    response?: string;
    invitation?: string;
    sort?: string;
    archived?: string;
    error?: string;
    added?: string;
    updated?: string;
    imported?: string;
  }>;
}) {
  const [{ eventId }, query] = await Promise.all([params, searchParams]);
  await requireEventPage(eventId);
  if (
    !(await db.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    }))
  )
    notFound();
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const pageSize = 25;
  const search = (query.q ?? "").trim().slice(0, 160);
  const response = ["YES", "MAYBE", "NO", "NONE"].includes(query.response ?? "")
    ? query.response
    : "";
  const invitation = [
    "UNSENT",
    "SENT",
    "OPENED",
    "RESPONDED",
    "FAILED",
  ].includes(query.invitation ?? "")
    ? query.invitation
    : "";
  const archived = query.archived === "1";
  const filters: Prisma.HouseholdWhereInput[] = [];
  if (search) {
    filters.push({
      OR: [
        { displayName: { contains: search, mode: "insensitive" } },
        { contactName: { contains: search, mode: "insensitive" } },
        { contactEmail: { contains: search, mode: "insensitive" } },
        {
          guests: {
            some: {
              fullName: { contains: search, mode: "insensitive" },
            },
          },
        },
        { tags: { has: search } },
      ],
    });
  }
  if (response === "NONE") filters.push({ rsvp: null });
  else if (response)
    filters.push({ rsvp: { response: response as "YES" | "MAYBE" | "NO" } });

  if (invitation === "UNSENT")
    filters.push({
      OR: [{ invitation: null }, { invitation: { sentAt: null } }],
    });
  else if (invitation === "SENT")
    filters.push({ invitation: { sentAt: { not: null } } });
  else if (invitation === "OPENED")
    filters.push({ invitation: { firstOpenedAt: { not: null } } });
  else if (invitation === "RESPONDED")
    filters.push({ invitation: { respondedAt: { not: null } } });
  else if (invitation === "FAILED")
    filters.push({ invitation: { status: "FAILED" } });

  const where: Prisma.HouseholdWhereInput = {
    eventId,
    archivedAt: archived ? { not: null } : null,
    ...(filters.length ? { AND: filters } : {}),
  };
  const orderBy =
    query.sort === "updated"
      ? { updatedAt: "desc" as const }
      : query.sort === "party"
        ? { partySizeLimit: "desc" as const }
        : { displayName: "asc" as const };
  const [households, total] = await Promise.all([
    db.household.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        guests: { orderBy: { sortOrder: "asc" } },
        invitation: true,
        rsvp: { include: { attendees: true } },
      },
    }),
    db.household.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const filterQuery = `q=${encodeURIComponent(search)}&response=${response}&invitation=${invitation}&sort=${query.sort ?? "name"}&archived=${archived ? "1" : "0"}`;

  return (
    <>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="editorial text-4xl">Guests</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Households hold invitation permissions; attendees hold the people
            actually coming.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/events/${eventId}/guests/import`}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--line-strong)] px-4 text-xs font-semibold"
          >
            <FileUp size={14} /> Import CSV
          </Link>
          <a
            href={`/admin/events/${eventId}/guests/export`}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--line-strong)] px-4 text-xs font-semibold"
          >
            <Download size={14} /> Export CSV
          </a>
        </div>
      </div>
      {query.error ? (
        <p
          className="mb-5 border-l-2 border-[var(--negative)] py-1 pl-4 text-sm text-[var(--negative)]"
          role="alert"
        >
          {query.error}
        </p>
      ) : null}
      {query.added || query.updated || query.imported ? (
        <p
          className="mb-5 border-l-2 border-[var(--positive)] py-1 pl-4 text-sm text-[var(--positive)]"
          role="status"
        >
          {query.imported
            ? `${query.imported} guests imported.`
            : query.added
              ? "Household added."
              : "Household updated."}
        </p>
      ) : null}
      <details className="mb-7 border-y border-[var(--line)] bg-[var(--surface)]">
        <summary className="flex cursor-pointer list-none items-center gap-2 py-4 text-sm font-semibold">
          <Plus size={16} /> Add a household
        </summary>
        <div className="max-w-3xl pb-7 pt-2">
          <HouseholdForm action={addHouseholdAction.bind(null, eventId)} />
        </div>
      </details>
      <form className="mb-5 grid gap-2 border-b border-[var(--line)] pb-4 sm:grid-cols-[1fr_auto_auto_auto_auto]">
        <input
          name="q"
          defaultValue={search}
          placeholder="Search names, emails, tags"
          className="min-h-11 min-w-0 bg-transparent px-2 outline-none placeholder:text-[var(--muted-2)]"
        />
        <select
          name="response"
          defaultValue={response}
          className="min-h-11 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-xs"
        >
          <option value="">Any response</option>
          <option value="YES">Yes</option>
          <option value="MAYBE">Maybe</option>
          <option value="NO">No</option>
          <option value="NONE">No response</option>
        </select>
        <select
          name="invitation"
          defaultValue={invitation}
          className="min-h-11 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-xs"
        >
          <option value="">Any invitation</option>
          <option value="UNSENT">Unsent</option>
          <option value="SENT">Sent</option>
          <option value="OPENED">Opened</option>
          <option value="RESPONDED">Responded</option>
          <option value="FAILED">Failed</option>
        </select>
        <select
          name="sort"
          defaultValue={query.sort ?? "name"}
          className="min-h-11 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-xs"
        >
          <option value="name">Name</option>
          <option value="updated">Recently updated</option>
          <option value="party">Largest party</option>
        </select>
        <button className="min-h-11 rounded-full bg-[var(--accent)] px-5 text-xs font-semibold text-[var(--accent-ink)]">
          Apply
        </button>
        {archived ? <input type="hidden" name="archived" value="1" /> : null}
      </form>
      <div className="mb-3 flex items-center justify-between text-xs text-[var(--muted)]">
        <span>
          {total} household{total === 1 ? "" : "s"}
        </span>
        <Link
          href={`?${filterQuery.replace(`archived=${archived ? "1" : "0"}`, `archived=${archived ? "0" : "1"}`)}`}
          className="font-semibold underline underline-offset-4"
        >
          {archived ? "View active" : "View archived"}
        </Link>
      </div>
      {archived ? (
        <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {households.map((household) => (
            <div key={household.id} className="flex items-center gap-4 py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {household.displayName}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {household.contactEmail ?? "No email"}
                </p>
              </div>
              <form
                action={restoreHouseholdAction.bind(
                  null,
                  eventId,
                  household.id,
                )}
              >
                <button className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--line)] px-3 text-xs font-semibold">
                  <RotateCcw size={13} /> Restore
                </button>
              </form>
            </div>
          ))}
        </div>
      ) : (
        <form action={archiveHouseholdsAction.bind(null, eventId)}>
          <div className="overflow-x-auto border-y border-[var(--line)]">
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                  <th className="w-10 py-3">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="py-3 pr-4">Household</th>
                  <th className="py-3 pr-4">Party</th>
                  <th className="py-3 pr-4">Invitation</th>
                  <th className="py-3 pr-4">Response</th>
                  <th className="py-3 pr-4 text-right">Attendees</th>
                  <th className="py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {households.map((household) => {
                  const confirmed =
                    household.rsvp?.attendees.filter(
                      (attendee) => attendee.status === "CONFIRMED",
                    ).length ?? 0;
                  const inviteState = household.invitation?.respondedAt
                    ? "Responded"
                    : household.invitation?.firstOpenedAt
                      ? "Opened"
                      : household.invitation?.sentAt
                        ? "Sent"
                        : household.invitation?.status === "FAILED"
                          ? "Failed"
                          : "Unsent";
                  return (
                    <tr key={household.id} className="text-sm">
                      <td className="py-4">
                        <input
                          type="checkbox"
                          name="householdId"
                          value={household.id}
                          className="size-4 accent-[var(--ink)]"
                          aria-label={`Select ${household.displayName}`}
                        />
                      </td>
                      <td className="py-4 pr-4">
                        <p className="font-semibold">{household.displayName}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {household.contactEmail ?? "No email"}
                          {household.tags.length
                            ? ` · ${household.tags.join(", ")}`
                            : ""}
                        </p>
                      </td>
                      <td className="py-4 pr-4">
                        <span className="mono-numerals">
                          {household.guests.length}/{household.partySizeLimit}
                        </span>
                        {household.allowPlusOne ? (
                          <span className="ml-1 text-xs text-[var(--muted)]">
                            +1
                          </span>
                        ) : null}
                      </td>
                      <td className="py-4 pr-4">
                        <StatusBadge
                          tone={
                            inviteState === "Responded" ||
                            inviteState === "Opened"
                              ? "positive"
                              : inviteState === "Failed"
                                ? "negative"
                                : "neutral"
                          }
                        >
                          {inviteState}
                        </StatusBadge>
                      </td>
                      <td className="py-4 pr-4">
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
                            {household.rsvp.response}
                          </StatusBadge>
                        ) : (
                          <span className="text-xs text-[var(--muted-2)]">
                            —
                          </span>
                        )}
                      </td>
                      <td className="mono-numerals py-4 pr-4 text-right text-lg">
                        {confirmed}
                      </td>
                      <td className="py-4">
                        <div className="flex">
                          <button
                            type="submit"
                            formAction={`/admin/events/${eventId}/guests/${household.id}/qr`}
                            formMethod="post"
                            formTarget="_blank"
                            className="grid size-9 place-items-center rounded-full hover:bg-[var(--line)]"
                            title="Download personalized QR code"
                          >
                            <QrCode size={14} />
                            <span className="sr-only">
                              QR code for {household.displayName}
                            </span>
                          </button>
                          <Link
                            href={`/admin/events/${eventId}/guests/${household.id}/edit`}
                            className="grid size-9 place-items-center rounded-full hover:bg-[var(--line)]"
                            title="Edit household"
                          >
                            <Pencil size={14} />
                            <span className="sr-only">
                              Edit {household.displayName}
                            </span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {households.length ? (
            <button
              type="submit"
              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--line-strong)] px-4 text-xs font-semibold text-[var(--muted)]"
            >
              <Archive size={14} /> Archive selected
            </button>
          ) : null}
        </form>
      )}
      {!households.length ? (
        <div className="py-16 text-center">
          <p className="editorial text-4xl">No households here.</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Adjust the filters or add your first guests.
          </p>
        </div>
      ) : null}
      <div className="mt-6 flex items-center justify-end gap-2 text-xs">
        <Link
          aria-disabled={page <= 1}
          href={`?page=${Math.max(1, page - 1)}&${filterQuery}`}
          className="grid size-10 place-items-center rounded-full border border-[var(--line)] aria-disabled:pointer-events-none aria-disabled:opacity-40"
        >
          <ChevronLeft size={15} />
        </Link>
        <span className="px-2 text-[var(--muted)]">
          {page} / {pages}
        </span>
        <Link
          aria-disabled={page >= pages}
          href={`?page=${Math.min(pages, page + 1)}&${filterQuery}`}
          className="grid size-10 place-items-center rounded-full border border-[var(--line)] aria-disabled:pointer-events-none aria-disabled:opacity-40"
        >
          <ChevronRight size={15} />
        </Link>
      </div>
    </>
  );
}
