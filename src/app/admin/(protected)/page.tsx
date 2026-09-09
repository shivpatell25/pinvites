import { CalendarPlus, ChevronRight } from "lucide-react";
import Link from "next/link";

import { MetricCard } from "@/components/admin/metric-card";
import { PageHeader } from "@/components/admin/page-header";
import { TrendChart } from "@/components/admin/trend-chart";
import { StatusBadge } from "@/components/ui/status-badge";
import { EventStatus } from "@/generated/prisma/client";
import { requireAdminPage } from "@/lib/admin-page";
import { db } from "@/lib/db";
import { formatDate, formatPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  await requireAdminPage();
  const eventStatus = { in: [EventStatus.PUBLISHED, EventStatus.CLOSED] };
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setHours(0, 0, 0, 0);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);

  const [
    confirmedAttendees,
    yesHouseholds,
    maybeHouseholds,
    noHouseholds,
    totalHouseholds,
    rsvpCount,
    invitationsSent,
    invitationsOpened,
    invitationResponses,
    events,
    submissions,
  ] = await Promise.all([
    db.attendee.count({
      where: {
        status: "CONFIRMED",
        rsvp: {
          household: { archivedAt: null, event: { status: eventStatus } },
        },
      },
    }),
    db.rsvp.count({
      where: {
        response: "YES",
        household: { archivedAt: null, event: { status: eventStatus } },
      },
    }),
    db.rsvp.count({
      where: {
        response: "MAYBE",
        household: { archivedAt: null, event: { status: eventStatus } },
      },
    }),
    db.rsvp.count({
      where: {
        response: "NO",
        household: { archivedAt: null, event: { status: eventStatus } },
      },
    }),
    db.household.count({
      where: { archivedAt: null, event: { status: eventStatus } },
    }),
    db.rsvp.count({
      where: {
        household: { archivedAt: null, event: { status: eventStatus } },
      },
    }),
    db.invitation.count({
      where: {
        sentAt: { not: null },
        household: { archivedAt: null, event: { status: eventStatus } },
      },
    }),
    db.invitation.count({
      where: {
        firstOpenedAt: { not: null },
        household: { archivedAt: null, event: { status: eventStatus } },
      },
    }),
    db.invitation.count({
      where: {
        respondedAt: { not: null },
        household: { archivedAt: null, event: { status: eventStatus } },
      },
    }),
    db.event.findMany({
      where: { status: { not: EventStatus.ARCHIVED } },
      orderBy: [{ startsAt: "asc" }],
      take: 6,
      include: {
        _count: {
          select: { households: { where: { archivedAt: null } } },
        },
      },
    }),
    db.rsvpSubmission.findMany({
      where: {
        submittedAt: { gte: fourteenDaysAgo },
        rsvp: {
          household: { archivedAt: null, event: { status: eventStatus } },
        },
      },
      select: { submittedAt: true, confirmedAttendeeCount: true },
      orderBy: { submittedAt: "asc" },
    }),
  ]);

  const points = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(fourteenDaysAgo);
    date.setDate(date.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    const values = submissions.filter(
      (submission) => submission.submittedAt.toISOString().slice(0, 10) === key,
    );
    return {
      label: new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(date),
      responses: values.length,
      attendees: values.reduce(
        (sum, submission) => sum + submission.confirmedAttendeeCount,
        0,
      ),
    };
  });

  const noResponse = Math.max(0, totalHouseholds - rsvpCount);
  const responseRate = totalHouseholds > 0 ? rsvpCount / totalHouseholds : 0;
  const averageParty =
    yesHouseholds > 0 ? confirmedAttendees / yesHouseholds : 0;

  return (
    <>
      <PageHeader
        eyebrow="Across active events"
        title="Who’s coming?"
        description="Headcount comes from individual attendees—not the number of forms submitted. That distinction is the heart of this dashboard."
        actions={
          <Link
            href="/admin/events/new"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] shadow-[0_1px_2px_rgb(0_0_0_/_14%)] transition-[filter,transform] hover:brightness-105 active:scale-[0.98]"
          >
            <CalendarPlus size={16} aria-hidden="true" /> New event
          </Link>
        }
      />

      <section
        className="grid gap-3 lg:grid-cols-[1.08fr_1fr_1fr]"
        aria-label="Attendance metrics"
      >
        <MetricCard
          primary
          label="Confirmed attendees"
          value={confirmedAttendees}
          note={`${yesHouseholds} attending household${yesHouseholds === 1 ? "" : "s"} · ${averageParty.toFixed(1)} average party size`}
        />
        <div className="grid grid-cols-2 gap-3">
          <MetricCard label="Maybe" value={maybeHouseholds} note="Households" />
          <MetricCard label="Declined" value={noHouseholds} note="Households" />
          <MetricCard
            label="No response"
            value={noResponse}
            note="Households"
          />
          <MetricCard
            label="Response rate"
            value={formatPercent(responseRate)}
            note={`${rsvpCount} of ${totalHouseholds}`}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MetricCard
            label="Sent"
            value={invitationsSent}
            note="Actual SMTP sends"
          />
          <MetricCard
            label="Opened"
            value={invitationsOpened}
            note="Invitation-link opens"
          />
          <MetricCard
            label="Responded"
            value={invitationResponses}
            note="Personalized invites"
          />
          <MetricCard
            label="Open rate"
            value={formatPercent(
              invitationsSent ? invitationsOpened / invitationsSent : 0,
            )}
            note="Link opens, not pixels"
          />
        </div>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-[24px] border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-card)] sm:p-7">
          <TrendChart points={points} />
        </div>
        <div className="rounded-[24px] border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-card)] sm:p-7">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <h2 className="editorial text-3xl">Events</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Drafts and active gatherings
              </p>
            </div>
            <Link
              href="/admin/events"
              className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]"
            >
              View all
            </Link>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {events.length ? (
              events.map((event) => (
                <Link
                  key={event.id}
                  href={`/admin/events/${event.id}`}
                  className="group -mx-2 flex items-center gap-4 rounded-[15px] px-2 py-4 transition-colors hover:bg-[var(--selection)]"
                >
                  <div className="w-16 shrink-0 text-center">
                    <p className="editorial text-3xl leading-none">
                      {new Intl.DateTimeFormat("en-US", {
                        day: "numeric",
                        timeZone: event.timezone,
                      }).format(event.startsAt)}
                    </p>
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                      {new Intl.DateTimeFormat("en-US", {
                        month: "short",
                        timeZone: event.timezone,
                      }).format(event.startsAt)}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">
                        {event.title}
                      </p>
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
                    <p className="mt-1 truncate text-xs text-[var(--muted)]">
                      {formatDate(event.startsAt, event.timezone)} ·{" "}
                      {event._count.households} households
                    </p>
                  </div>
                  <ChevronRight
                    size={17}
                    className="text-[var(--muted-2)] transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              ))
            ) : (
              <div className="py-12 text-center">
                <p className="editorial text-3xl">
                  Your first gathering starts here.
                </p>
                <Link
                  href="/admin/events/new"
                  className="mt-4 inline-flex text-sm font-semibold underline underline-offset-4"
                >
                  Create an event
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
