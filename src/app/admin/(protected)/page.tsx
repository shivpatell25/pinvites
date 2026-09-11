import { CalendarPlus, ChevronRight, KeyRound, UserRound } from "lucide-react";
import Link from "next/link";

import { AdminInviteForm } from "@/components/admin/admin-invite-form";
import { MetricCard } from "@/components/admin/metric-card";
import { PageHeader } from "@/components/admin/page-header";
import { TrendChart } from "@/components/admin/trend-chart";
import { StatusBadge } from "@/components/ui/status-badge";
import { EventStatus } from "@/generated/prisma/client";
import { requireAdminPage } from "@/lib/admin-page";
import { eventScopeFor } from "@/lib/admin-authorization";
import { db } from "@/lib/db";
import { formatDate, formatPercent } from "@/lib/format";

import {
  resendAdminInviteAction,
  revokeAdminInviteAction,
  revokeAdminSessionsAction,
  setAdminActiveAction,
} from "@/app/admin/accounts/actions";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const admin = await requireAdminPage();
  const eventStatus = { in: [EventStatus.PUBLISHED, EventStatus.CLOSED] };
  const eventScope = eventScopeFor(admin);
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
          household: {
            archivedAt: null,
            event: { status: eventStatus, ...eventScope },
          },
        },
      },
    }),
    db.rsvp.count({
      where: {
        response: "YES",
        household: {
          archivedAt: null,
          event: { status: eventStatus, ...eventScope },
        },
      },
    }),
    db.rsvp.count({
      where: {
        response: "MAYBE",
        household: {
          archivedAt: null,
          event: { status: eventStatus, ...eventScope },
        },
      },
    }),
    db.rsvp.count({
      where: {
        response: "NO",
        household: {
          archivedAt: null,
          event: { status: eventStatus, ...eventScope },
        },
      },
    }),
    db.household.count({
      where: {
        archivedAt: null,
        event: { status: eventStatus, ...eventScope },
      },
    }),
    db.rsvp.count({
      where: {
        household: {
          archivedAt: null,
          event: { status: eventStatus, ...eventScope },
        },
      },
    }),
    db.invitation.count({
      where: {
        sentAt: { not: null },
        household: {
          archivedAt: null,
          event: { status: eventStatus, ...eventScope },
        },
      },
    }),
    db.invitation.count({
      where: {
        firstOpenedAt: { not: null },
        household: {
          archivedAt: null,
          event: { status: eventStatus, ...eventScope },
        },
      },
    }),
    db.invitation.count({
      where: {
        respondedAt: { not: null },
        household: {
          archivedAt: null,
          event: { status: eventStatus, ...eventScope },
        },
      },
    }),
    db.event.findMany({
      where: { status: { not: EventStatus.ARCHIVED }, ...eventScope },
      orderBy: [{ startsAt: "asc" }],
      take: 6,
      include: {
        createdBy: { select: { displayName: true } },
        _count: {
          select: { households: { where: { archivedAt: null } } },
        },
      },
    }),
    db.rsvpSubmission.findMany({
      where: {
        submittedAt: { gte: fourteenDaysAgo },
        rsvp: {
          household: {
            archivedAt: null,
            event: { status: eventStatus, ...eventScope },
          },
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
  const accountData =
    admin.role === "OWNER"
      ? await Promise.all([
          db.admin.findMany({
            orderBy: [{ role: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              displayName: true,
              email: true,
              role: true,
              isActive: true,
              lastLoginAt: true,
              createdAt: true,
              _count: { select: { eventsCreated: true } },
            },
          }),
          db.adminInvite.findMany({
            orderBy: { createdAt: "desc" },
            take: 30,
            select: {
              id: true,
              displayName: true,
              email: true,
              expiresAt: true,
              sentAt: true,
              acceptedAt: true,
              revokedAt: true,
              lastError: true,
            },
          }),
        ])
      : null;

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
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold">
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
                      {admin.role === "OWNER"
                        ? ` · ${event.createdBy.displayName}`
                        : ""}
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
      {accountData ? (
        <section className="mt-14" aria-labelledby="accounts-title">
          <div className="mb-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
              Private workspace access
            </p>
            <h2 id="accounts-title" className="editorial mt-2 text-5xl">
              Accounts
            </h2>
          </div>
          <div className="grid gap-4 xl:grid-cols-[0.86fr_1.14fr]">
            <AdminInviteForm />
            <div className="rounded-[24px] border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-card)] sm:p-7">
              <h3 className="editorial text-3xl">Administrators</h3>
              <div className="mt-4 divide-y divide-[var(--line)]">
                {accountData[0].map((account) => (
                  <div
                    key={account.id}
                    className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                      <UserRound size={16} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold">
                          {account.displayName}
                        </p>
                        <StatusBadge
                          tone={account.isActive ? "positive" : "negative"}
                        >
                          {account.role === "OWNER"
                            ? "Owner"
                            : account.isActive
                              ? "Active"
                              : "Inactive"}
                        </StatusBadge>
                      </div>
                      <p className="mt-1 truncate text-xs text-[var(--muted)]">
                        {account.email} · {account._count.eventsCreated} event
                        {account._count.eventsCreated === 1 ? "" : "s"}
                      </p>
                    </div>
                    {account.role === "ADMIN" ? (
                      <div className="flex flex-wrap gap-2">
                        <form
                          action={revokeAdminSessionsAction.bind(
                            null,
                            account.id,
                          )}
                        >
                          <button className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--line)] px-3 text-[11px] font-semibold">
                            <KeyRound size={13} /> Sign out devices
                          </button>
                        </form>
                        <form
                          action={setAdminActiveAction.bind(
                            null,
                            account.id,
                            !account.isActive,
                          )}
                        >
                          <button className="min-h-9 rounded-full px-3 text-[11px] font-semibold text-[var(--muted)] hover:bg-[var(--selection)]">
                            {account.isActive ? "Deactivate" : "Reactivate"}
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-[24px] border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-card)] sm:p-7">
            <h3 className="editorial text-3xl">Invitation history</h3>
            <div className="mt-4 divide-y divide-[var(--line)]">
              {accountData[1].map((invite) => {
                const status = invite.acceptedAt
                  ? "Accepted"
                  : invite.revokedAt
                    ? "Revoked"
                    : invite.expiresAt <= new Date()
                      ? "Expired"
                      : invite.sentAt
                        ? "Sent"
                        : "Created";
                const pending = !invite.acceptedAt && !invite.revokedAt;
                return (
                  <div
                    key={invite.id}
                    className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold">
                          {invite.displayName}
                        </p>
                        <StatusBadge
                          tone={
                            status === "Accepted"
                              ? "positive"
                              : status === "Revoked" || status === "Expired"
                                ? "negative"
                                : "warning"
                          }
                        >
                          {status}
                        </StatusBadge>
                      </div>
                      <p className="mt-1 truncate text-xs text-[var(--muted)]">
                        {invite.email}
                      </p>
                      {invite.lastError ? (
                        <p className="mt-1 text-xs text-[var(--negative)]">
                          {invite.lastError}
                        </p>
                      ) : null}
                    </div>
                    {pending ? (
                      <div className="flex gap-2">
                        <form
                          action={resendAdminInviteAction.bind(null, invite.id)}
                        >
                          <button className="min-h-9 rounded-full border border-[var(--line)] px-3 text-[11px] font-semibold">
                            Send new link
                          </button>
                        </form>
                        <form
                          action={revokeAdminInviteAction.bind(null, invite.id)}
                        >
                          <button className="min-h-9 rounded-full px-3 text-[11px] font-semibold text-[var(--negative)]">
                            Revoke
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {!accountData[1].length ? (
                <p className="py-8 text-center text-sm text-[var(--muted)]">
                  No account invitations yet.
                </p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
