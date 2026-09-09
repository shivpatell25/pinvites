import {
  Archive,
  Copy,
  Eye,
  Pencil,
  Radio,
  RotateCcw,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EventTabs } from "@/components/admin/event-tabs";
import { DeleteEventButton } from "@/components/admin/delete-event-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EventStatus } from "@/generated/prisma/client";
import { requireAdminPage } from "@/lib/admin-page";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";

import {
  deleteEventAction,
  duplicateEventAction,
  setEventStatusAction,
} from "@/app/admin/events/actions";

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  await requireAdminPage();
  const { eventId } = await params;
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      slug: true,
      isPublic: true,
      status: true,
      startsAt: true,
      timezone: true,
    },
  });
  if (!event) notFound();

  return (
    <>
      <header className="mb-5 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
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
            <span className="text-xs text-[var(--muted)]">
              {formatDate(event.startsAt, event.timezone)}
            </span>
          </div>
          <h1 className="editorial truncate text-[clamp(2.8rem,6vw,5rem)] leading-[0.9]">
            {event.title}
          </h1>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {event.status === EventStatus.PUBLISHED && event.isPublic ? (
            <Link
              href={`/e/${event.slug}`}
              target="_blank"
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--line-strong)] px-4 text-xs font-semibold"
            >
              <Eye size={15} /> View invitation
            </Link>
          ) : null}
          <Link
            href={`/admin/events/${event.id}/edit`}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--line-strong)] px-4 text-xs font-semibold"
          >
            <Pencil size={14} /> Edit
          </Link>
          <form action={duplicateEventAction.bind(null, event.id)}>
            <button
              className="grid size-10 place-items-center rounded-full border border-[var(--line-strong)]"
              title="Duplicate event"
            >
              <Copy size={15} />
              <span className="sr-only">Duplicate event</span>
            </button>
          </form>
          {event.status === EventStatus.DRAFT ? (
            <StatusAction
              eventId={event.id}
              status={EventStatus.PUBLISHED}
              label="Publish"
              icon={<Radio size={15} />}
              primary
            />
          ) : null}
          {event.status === EventStatus.PUBLISHED ? (
            <StatusAction
              eventId={event.id}
              status={EventStatus.CLOSED}
              label="Close RSVPs"
              icon={<XCircle size={15} />}
            />
          ) : null}
          {event.status === EventStatus.CLOSED ? (
            <StatusAction
              eventId={event.id}
              status={EventStatus.PUBLISHED}
              label="Reopen"
              icon={<RotateCcw size={15} />}
            />
          ) : null}
          {event.status !== EventStatus.ARCHIVED ? (
            <StatusAction
              eventId={event.id}
              status={EventStatus.ARCHIVED}
              label="Archive"
              icon={<Archive size={15} />}
              quiet
            />
          ) : (
            <>
              <StatusAction
                eventId={event.id}
                status={EventStatus.DRAFT}
                label="Restore draft"
                icon={<RotateCcw size={15} />}
              />
              <DeleteEventButton
                eventTitle={event.title}
                action={deleteEventAction.bind(null, event.id)}
              />
            </>
          )}
        </div>
      </header>
      <EventTabs eventId={event.id} />
      {children}
    </>
  );
}

function StatusAction({
  eventId,
  status,
  label,
  icon,
  primary,
  quiet,
}: {
  eventId: string;
  status: EventStatus;
  label: string;
  icon: React.ReactNode;
  primary?: boolean;
  quiet?: boolean;
}) {
  return (
    <form action={setEventStatusAction.bind(null, eventId, status)}>
      <button
        type="submit"
        className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-xs font-semibold ${primary ? "bg-[var(--accent)] text-[var(--accent-ink)]" : quiet ? "text-[var(--muted)] hover:bg-[var(--selection)]" : "border border-[var(--line-strong)] bg-[var(--surface-raised)]"}`}
      >
        {icon}
        {label}
      </button>
    </form>
  );
}
