import {
  AlertTriangle,
  CheckCircle2,
  Mail,
  RefreshCw,
  Send,
} from "lucide-react";
import { notFound } from "next/navigation";

import type { Prisma } from "@/generated/prisma/client";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireEventPage } from "@/lib/admin-page";
import { db } from "@/lib/db";
import { smtpConfigurationFromEnv } from "@/lib/email";

import {
  approveEmailRetryAction,
  bulkEmailAction,
  sendOneEmailAction,
} from "@/app/admin/events/[eventId]/email/actions";

export const dynamic = "force-dynamic";

function blockedDelivery(type: "INVITATION" | "REMINDER") {
  return {
    type,
    OR: [
      { status: { in: ["QUEUED", "SENDING"] } },
      {
        status: "FAILED",
        attemptCount: { gte: 3 },
        manualRetryApprovedAt: null,
      },
    ],
  } satisfies Prisma.EmailLogWhereInput;
}

export default async function EmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{
    error?: string;
    sent?: string;
    duplicates?: string;
    failed?: string;
    released?: string;
  }>;
}) {
  const [{ eventId }, query] = await Promise.all([params, searchParams]);
  await requireEventPage(eventId);
  const smtp = smtpConfigurationFromEnv();
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { status: true },
  });
  if (!event) notFound();
  const eventCanSend = event.status === "PUBLISHED";
  const nextReminder = await db.invitation.findFirst({
    where: {
      sentAt: { not: null },
      emailLogs: { none: blockedDelivery("REMINDER") },
      household: {
        eventId,
        archivedAt: null,
        contactEmail: { not: null },
        rsvp: null,
      },
    },
    orderBy: [{ reminderCount: "asc" }, { createdAt: "asc" }],
    select: { reminderCount: true },
  });
  const [unsent, reminders, recentLogs, candidates, recoveryRows] =
    await Promise.all([
      db.household.count({
        where: {
          eventId,
          archivedAt: null,
          contactEmail: { not: null },
          rsvp: null,
          OR: [
            { invitation: null },
            {
              invitation: {
                sentAt: null,
                emailLogs: { none: blockedDelivery("INVITATION") },
              },
            },
          ],
        },
      }),
      db.household.count({
        where: {
          eventId,
          archivedAt: null,
          contactEmail: { not: null },
          rsvp: null,
          invitation: {
            sentAt: { not: null },
            reminderCount: nextReminder?.reminderCount ?? -1,
            emailLogs: { none: blockedDelivery("REMINDER") },
          },
        },
      }),
      db.emailLog.findMany({
        where: { eventId },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { household: { select: { displayName: true } } },
      }),
      db.household.findMany({
        where: { eventId, archivedAt: null, contactEmail: { not: null } },
        orderBy: { updatedAt: "desc" },
        take: 20,
        include: { invitation: true, rsvp: true },
      }),
      db.$queryRaw<
        Array<{ id: string; recoveryKind: "stalled" | "exhausted" }>
      >`
      SELECT
        "id",
        CASE
          WHEN "status" IN ('QUEUED', 'SENDING') THEN 'stalled'
          ELSE 'exhausted'
        END AS "recoveryKind"
      FROM "email_logs"
      WHERE "event_id" = ${eventId}::uuid
        AND (
          (
            "status" IN ('QUEUED', 'SENDING')
            AND "updated_at" <= CURRENT_TIMESTAMP - INTERVAL '10 minutes'
          )
          OR (
            "status" = 'FAILED'
            AND "attempt_count" >= 3
            AND "manual_retry_approved_at" IS NULL
          )
        )
      ORDER BY "updated_at" ASC
      LIMIT 50
    `,
    ]);
  const recentIds = new Set(recentLogs.map((log) => log.id));
  const missingRecoveryIds = recoveryRows
    .map((row) => row.id)
    .filter((id) => !recentIds.has(id));
  const recoveryLogs = missingRecoveryIds.length
    ? await db.emailLog.findMany({
        where: { id: { in: missingRecoveryIds }, eventId },
        include: { household: { select: { displayName: true } } },
      })
    : [];
  const logs = [...recentLogs, ...recoveryLogs].sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  );
  const recoveryKinds = new Map(
    recoveryRows.map((row) => [row.id, row.recoveryKind]),
  );

  return (
    <>
      <div className="mb-7">
        <h2 className="editorial text-4xl">Email</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Direct SMTP delivery with idempotency, plain text, responsive HTML,
          and honest acceptance and failure logs.
        </p>
      </div>
      <div
        className={`mb-7 flex items-start gap-3 border-l-2 py-1 pl-4 text-sm ${smtp.configured ? "border-[var(--positive)] text-[var(--positive)]" : "border-[var(--warning)] text-[var(--warning)]"}`}
      >
        {smtp.configured ? (
          <CheckCircle2 className="mt-0.5 shrink-0" size={17} />
        ) : (
          <AlertTriangle className="mt-0.5 shrink-0" size={17} />
        )}
        <span>
          {smtp.configured
            ? "SMTP is configured. A live connection is verified immediately before each batch."
            : smtp.reason}
        </span>
      </div>
      {!eventCanSend ? (
        <p className="mb-6 border-l-2 border-[var(--warning)] py-1 pl-4 text-sm text-[var(--warning)]">
          Invitations can be sent only while this event is published.
        </p>
      ) : null}
      {query.error ? (
        <p
          className="mb-6 border-l-2 border-[var(--negative)] py-1 pl-4 text-sm text-[var(--negative)]"
          role="alert"
        >
          {query.error}
        </p>
      ) : null}
      {query.sent || query.failed || query.duplicates ? (
        <p
          className="mb-6 border-l-2 border-[var(--positive)] py-1 pl-4 text-sm text-[var(--positive)]"
          role="status"
        >
          Batch complete: {query.sent ?? 0} accepted by SMTP,{" "}
          {query.duplicates ?? 0} duplicate-protected, {query.failed ?? 0}{" "}
          failed.
        </p>
      ) : null}
      {query.released ? (
        <p
          className="mb-6 border-l-2 border-[var(--positive)] py-1 pl-4 text-sm text-[var(--positive)]"
          role="status"
        >
          The stalled delivery was released. You can now retry it explicitly.
        </p>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-2">
        <BatchForm
          action={bulkEmailAction.bind(null, eventId)}
          mode="INVITATION"
          label="Initial invitations"
          count={unsent}
          description="Unanswered, unsent households with an email address. Maximum 250 per batch."
          button="Send invitations"
          smtpConfigured={smtp.configured && eventCanSend}
        />
        <BatchForm
          action={bulkEmailAction.bind(null, eventId)}
          mode="REMINDER"
          label="Reminders"
          count={reminders}
          description={`Unanswered households in reminder round ${(nextReminder?.reminderCount ?? 0) + 1}. Batches finish the least-reminded group before starting another round.`}
          button="Send reminders"
          smtpConfigured={smtp.configured && eventCanSend}
          secondary
        />
      </section>

      <section className="mt-10">
        <h3 className="editorial text-3xl">Individual controls</h3>
        <div className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {candidates.map((household) => (
            <div
              key={household.id}
              className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {household.displayName}
                </p>
                <p className="mt-1 truncate text-xs text-[var(--muted)]">
                  {household.contactEmail}
                </p>
              </div>
              <form
                action={sendOneEmailAction.bind(
                  null,
                  eventId,
                  household.id,
                  household.rsvp
                    ? "MANAGEMENT_LINK"
                    : household.invitation?.sentAt
                      ? "REMINDER"
                      : "INVITATION",
                )}
              >
                <button
                  disabled={!smtp.configured || !eventCanSend}
                  className="min-h-9 rounded-full border border-[var(--line)] px-3 text-xs font-semibold disabled:opacity-35"
                >
                  {household.rsvp
                    ? "Send management link"
                    : household.invitation?.sentAt
                      ? "Send reminder"
                      : "Send invitation"}
                </button>
              </form>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <div className="mb-4">
          <h3 className="editorial text-3xl">Delivery log</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            SMTP acceptance is recorded; provider delivery and email opens are
            not invented.
          </p>
          <p className="mt-1 max-w-3xl text-xs text-[var(--muted)]">
            If a process stops mid-send, Pinvites will not guess whether SMTP
            accepted it. After ten minutes, check your provider log and use the
            explicit release control before retrying.
          </p>
        </div>
        <div className="overflow-x-auto border-y border-[var(--line)]">
          <table className="w-full min-w-[850px] text-left">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                <th className="py-3 pr-4">Recipient</th>
                <th className="py-3 pr-4">Type</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4">Attempts</th>
                <th className="py-3 pr-4">When</th>
                <th className="py-3">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {logs.map((log) => {
                const isStalled = recoveryKinds.get(log.id) === "stalled";
                const isExhausted =
                  log.status === "FAILED" &&
                  log.attemptCount >= 3 &&
                  !log.manualRetryApprovedAt;
                const needsApproval = isStalled || isExhausted;
                return (
                  <tr key={log.id} className="text-xs">
                    <td className="py-4 pr-4">
                      <p className="font-semibold">
                        {log.household?.displayName ?? log.toEmail}
                      </p>
                      <p className="mt-1 text-[var(--muted)]">{log.toEmail}</p>
                    </td>
                    <td className="py-4 pr-4">
                      {log.type.replaceAll("_", " ")}
                    </td>
                    <td className="py-4 pr-4">
                      <StatusBadge
                        tone={
                          log.status === "SENT"
                            ? "positive"
                            : log.status === "FAILED"
                              ? "negative"
                              : "warning"
                        }
                      >
                        {log.status}
                      </StatusBadge>
                    </td>
                    <td className="mono-numerals py-4 pr-4">
                      {log.attemptCount}
                    </td>
                    <td className="py-4 pr-4 text-[var(--muted)]">
                      {new Intl.DateTimeFormat("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(log.sentAt ?? log.failedAt ?? log.createdAt)}
                    </td>
                    <td className="max-w-sm py-4 text-[var(--negative)]">
                      <span
                        className="block truncate"
                        title={log.errorMessage ?? undefined}
                      >
                        {log.errorMessage ?? log.providerMessageId ?? "—"}
                      </span>
                      {log.manualRetryApprovedAt ? (
                        <span className="mt-2 block text-[var(--positive)]">
                          One explicit retry is approved.
                        </span>
                      ) : null}
                      {needsApproval ? (
                        <form
                          action={approveEmailRetryAction.bind(
                            null,
                            eventId,
                            log.id,
                          )}
                          className="mt-3 border-l border-[var(--warning)] pl-3 text-[var(--ink)]"
                        >
                          <label className="flex max-w-xs items-start gap-2 leading-5">
                            <input
                              required
                              type="checkbox"
                              name="confirmation"
                              value="RETRY"
                              className="mt-1"
                            />
                            I checked the SMTP provider, corrected any delivery
                            issue, and accept the duplicate risk.
                          </label>
                          <button className="mt-2 min-h-9 rounded-full border border-[var(--line-strong)] px-3 font-semibold">
                            {isStalled
                              ? "Release and approve retry"
                              : "Approve one more retry"}
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!logs.length ? (
          <div className="grid min-h-40 place-items-center text-center">
            <div>
              <Mail className="mx-auto text-[var(--muted-2)]" />
              <p className="mt-3 text-sm text-[var(--muted)]">
                No delivery attempts yet.
              </p>
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}

function BatchForm({
  action,
  mode,
  label,
  count,
  description,
  button,
  smtpConfigured,
  secondary,
}: {
  action: (formData: FormData) => Promise<void>;
  mode: "INVITATION" | "REMINDER";
  label: string;
  count: number;
  description: string;
  button: string;
  smtpConfigured: boolean;
  secondary?: boolean;
}) {
  return (
    <form action={action} className="border-t border-[var(--line-strong)] py-6">
      <input type="hidden" name="mode" value={mode} />
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
      </p>
      <p className="editorial mono-numerals mt-3 text-6xl">{count}</p>
      <p className="mt-2 text-xs text-[var(--muted)]">{description}</p>
      <label className="mt-5 block text-xs font-semibold">
        Type SEND to confirm
        <input
          name="confirmation"
          autoComplete="off"
          className="mt-2 block min-h-10 w-full max-w-52 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 font-normal outline-none focus:border-[var(--ink)]"
        />
      </label>
      <button
        disabled={!smtpConfigured || count === 0}
        className={`mt-4 inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold disabled:opacity-35 ${secondary ? "border border-[var(--line-strong)] bg-[var(--surface-raised)]" : "bg-[var(--accent)] text-[var(--accent-ink)]"}`}
      >
        {mode === "INVITATION" ? <Send size={15} /> : <RefreshCw size={15} />}
        {button}
      </button>
    </form>
  );
}
