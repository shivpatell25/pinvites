import { Mail } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdminPage } from "@/lib/admin-page";
import { eventScopeFor } from "@/lib/admin-authorization";
import { db } from "@/lib/db";
import { smtpConfigurationFromEnv } from "@/lib/email";

export const dynamic = "force-dynamic";

export default async function AllEmailPage() {
  const admin = await requireAdminPage();
  const eventScope = eventScopeFor(admin);
  const [logs, events] = await Promise.all([
    db.emailLog.findMany({
      where: { event: eventScope },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { event: { select: { id: true, title: true } } },
    }),
    db.event.findMany({
      where: { status: { not: "ARCHIVED" }, ...eventScope },
      orderBy: { startsAt: "desc" },
      take: 20,
      select: { id: true, title: true },
    }),
  ]);
  const smtp = smtpConfigurationFromEnv();
  return (
    <>
      <PageHeader
        title="Email activity"
        description={
          smtp.configured
            ? "SMTP is configured. These are real provider acceptance and failure records."
            : smtp.reason
        }
        actions={
          events[0] ? (
            <Link
              href={`/admin/events/${events[0].id}/email`}
              className="min-h-10 rounded-full border border-[var(--line)] px-4 py-2.5 text-xs font-semibold"
            >
              Event email controls
            </Link>
          ) : null
        }
      />
      <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {logs.map((log) => (
          <div key={log.id} className="flex items-center gap-4 py-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--line)]">
              <Mail size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{log.subject}</p>
              <p className="mt-1 truncate text-xs text-[var(--muted)]">
                {log.event?.title ?? "Deleted event"} · {log.toEmail}
              </p>
            </div>
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
          </div>
        ))}
      </div>
      {!logs.length ? (
        <p className="py-16 text-center text-sm text-[var(--muted)]">
          No email has been attempted.
        </p>
      ) : null}
    </>
  );
}
