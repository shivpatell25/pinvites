import { notFound } from "next/navigation";

import { EventForm } from "@/components/admin/event-form";
import { requireAdminPage } from "@/lib/admin-page";
import { db } from "@/lib/db";

import { updateEventAction } from "@/app/admin/events/actions";

export default async function EditEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ error?: string; duplicated?: string }>;
}) {
  await requireAdminPage();
  const [{ eventId }, query] = await Promise.all([params, searchParams]);
  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) notFound();
  return (
    <>
      <div className="mb-8">
        <h2 className="editorial text-4xl">Event settings</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Edit the invitation story, schedule, venue, and guest rules.
        </p>
      </div>
      {query.error ? (
        <p
          className="mb-7 border-l-2 border-[var(--negative)] py-1 pl-4 text-sm text-[var(--negative)]"
          role="alert"
        >
          {query.error}
        </p>
      ) : null}
      {query.duplicated ? (
        <p
          className="mb-7 border-l-2 border-[var(--positive)] py-1 pl-4 text-sm text-[var(--positive)]"
          role="status"
        >
          Event duplicated as a private draft. Artwork and guests were
          intentionally not copied.
        </p>
      ) : null}
      <EventForm
        action={updateEventAction.bind(null, eventId)}
        values={event}
        submitLabel="Save changes"
      />
    </>
  );
}
