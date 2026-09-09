import { PageHeader } from "@/components/admin/page-header";
import { EventForm } from "@/components/admin/event-form";
import { requireAdminPage } from "@/lib/admin-page";

import { createEventAction } from "../../../events/actions";

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdminPage();
  const { error } = await searchParams;
  return (
    <>
      <PageHeader
        eyebrow="New gathering"
        title="Create an event"
        description="Begin with the story, time, place, and guest rules. Artwork and questions come next."
      />
      {error ? (
        <p
          className="mb-7 border-l-2 border-[var(--negative)] py-1 pl-4 text-sm text-[var(--negative)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <EventForm action={createEventAction} />
    </>
  );
}
