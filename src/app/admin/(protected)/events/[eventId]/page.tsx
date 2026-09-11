import { ArrowRight, Mail, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MetricCard } from "@/components/admin/metric-card";
import { TrendChart } from "@/components/admin/trend-chart";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireEventPage } from "@/lib/admin-page";
import { db } from "@/lib/db";
import { formatPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function EventOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{
    created?: string;
    updated?: string;
    error?: string;
  }>;
}) {
  const [{ eventId }, message] = await Promise.all([params, searchParams]);
  await requireEventPage(eventId);
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!event) notFound();
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setHours(0, 0, 0, 0);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
  const [
    confirmed,
    yes,
    maybe,
    no,
    households,
    rsvps,
    sent,
    opened,
    responded,
    recent,
    submissions,
  ] = await Promise.all([
    db.attendee.count({
      where: {
        status: "CONFIRMED",
        rsvp: { household: { eventId, archivedAt: null } },
      },
    }),
    db.rsvp.count({
      where: { response: "YES", household: { eventId, archivedAt: null } },
    }),
    db.rsvp.count({
      where: { response: "MAYBE", household: { eventId, archivedAt: null } },
    }),
    db.rsvp.count({
      where: { response: "NO", household: { eventId, archivedAt: null } },
    }),
    db.household.count({ where: { eventId, archivedAt: null } }),
    db.rsvp.count({ where: { household: { eventId, archivedAt: null } } }),
    db.invitation.count({
      where: {
        sentAt: { not: null },
        household: { eventId, archivedAt: null },
      },
    }),
    db.invitation.count({
      where: {
        firstOpenedAt: { not: null },
        household: { eventId, archivedAt: null },
      },
    }),
    db.invitation.count({
      where: {
        respondedAt: { not: null },
        household: { eventId, archivedAt: null },
      },
    }),
    db.rsvp.findMany({
      where: { household: { eventId, archivedAt: null } },
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: {
        household: { select: { displayName: true } },
        attendees: { select: { status: true } },
      },
    }),
    db.rsvpSubmission.findMany({
      where: {
        submittedAt: { gte: fourteenDaysAgo },
        rsvp: { household: { eventId, archivedAt: null } },
      },
      select: { submittedAt: true, confirmedAttendeeCount: true },
      orderBy: { submittedAt: "asc" },
    }),
  ]);
  const points = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(fourteenDaysAgo);
    date.setDate(date.getDate() + index);
    const day = date.toISOString().slice(0, 10);
    const values = submissions.filter(
      (entry) => entry.submittedAt.toISOString().slice(0, 10) === day,
    );
    return {
      label: new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(date),
      responses: values.length,
      attendees: values.reduce(
        (sum, entry) => sum + entry.confirmedAttendeeCount,
        0,
      ),
    };
  });
  const noResponse = Math.max(0, households - rsvps);

  return (
    <>
      {message.created || message.updated ? (
        <div
          className="mb-6 border-l-2 border-[var(--positive)] py-1 pl-4 text-sm text-[var(--positive)]"
          role="status"
        >
          {message.created
            ? "Event created. Add artwork and guests before publishing."
            : "Event details updated."}
        </div>
      ) : null}
      {message.error ? (
        <div
          className="mb-6 border-l-2 border-[var(--negative)] py-1 pl-4 text-sm text-[var(--negative)]"
          role="alert"
        >
          {message.error}
        </div>
      ) : null}
      <section className="grid gap-5 lg:grid-cols-[1.2fr_1fr_1fr]">
        <MetricCard
          primary
          label="Confirmed attendees"
          value={confirmed}
          note={`${yes} attending household${yes === 1 ? "" : "s"} · ${yes ? (confirmed / yes).toFixed(1) : "0.0"} average party size`}
        />
        <div className="grid grid-cols-2 gap-x-6">
          <MetricCard label="Maybe" value={maybe} />
          <MetricCard label="Declined" value={no} />
          <MetricCard label="No response" value={noResponse} />
          <MetricCard
            label="Response rate"
            value={formatPercent(households ? rsvps / households : 0)}
          />
        </div>
        <div className="grid grid-cols-2 gap-x-6">
          <MetricCard label="Sent" value={sent} />
          <MetricCard label="Opened" value={opened} />
          <MetricCard label="Responded" value={responded} />
          <MetricCard
            label="Open rate"
            value={formatPercent(sent ? opened / sent : 0)}
            note="Invitation-link opens"
          />
        </div>
      </section>
      <section className="mt-12 grid gap-10 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="border-t border-[var(--line-strong)] pt-7">
          <TrendChart points={points} />
        </div>
        <div className="border-t border-[var(--line-strong)] pt-7">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="editorial text-3xl">Latest replies</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Most recently updated households
              </p>
            </div>
            <Link
              href={`/admin/events/${eventId}/rsvps`}
              className="text-xs font-semibold text-[var(--muted)]"
            >
              All RSVPs
            </Link>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {recent.map((rsvp) => (
              <Link
                key={rsvp.id}
                href={`/admin/events/${eventId}/rsvps?q=${encodeURIComponent(rsvp.household.displayName)}`}
                className="flex items-center gap-3 py-3.5"
              >
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
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {rsvp.household.displayName}
                </span>
                <span className="mono-numerals text-xs text-[var(--muted)]">
                  {
                    rsvp.attendees.filter(
                      (attendee) => attendee.status === "CONFIRMED",
                    ).length
                  }
                </span>
              </Link>
            ))}
            {!recent.length ? (
              <p className="py-10 text-center text-sm text-[var(--muted)]">
                Responses will appear here as guests reply.
              </p>
            ) : null}
          </div>
        </div>
      </section>
      <section className="mt-12 grid gap-4 sm:grid-cols-2">
        <Link
          href={`/admin/events/${eventId}/guests`}
          className="group flex items-center gap-4 border-t border-[var(--line-strong)] py-6"
        >
          <span className="grid size-11 place-items-center bg-[var(--ink)] text-[var(--canvas)]">
            <Users size={18} />
          </span>
          <div className="flex-1">
            <p className="font-semibold">Manage guests</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Households, party limits, links, and CSVs
            </p>
          </div>
          <ArrowRight
            size={17}
            className="transition-transform group-hover:translate-x-1"
          />
        </Link>
        <Link
          href={`/admin/events/${eventId}/email`}
          className="group flex items-center gap-4 border-t border-[var(--line-strong)] py-6"
        >
          <span className="grid size-11 place-items-center bg-[var(--ink)] text-[var(--canvas)]">
            <Mail size={18} />
          </span>
          <div className="flex-1">
            <p className="font-semibold">Send invitations</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              SMTP-backed sends with durable logs
            </p>
          </div>
          <ArrowRight
            size={17}
            className="transition-transform group-hover:translate-x-1"
          />
        </Link>
      </section>
    </>
  );
}
