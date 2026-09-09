import { notFound } from "next/navigation";

import { AdminRsvpEditor } from "@/components/admin/admin-rsvp-editor";
import { updateRsvpAsAdminAction } from "@/app/admin/events/[eventId]/rsvps/actions";
import { requireAdminPage } from "@/lib/admin-page";
import { db } from "@/lib/db";

export default async function EditRsvpPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string; rsvpId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdminPage();
  const [{ eventId, rsvpId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const rsvp = await db.rsvp.findFirst({
    where: { id: rsvpId, household: { eventId, archivedAt: null } },
    include: {
      household: { include: { guests: { orderBy: { sortOrder: "asc" } } } },
      attendees: { orderBy: { sortOrder: "asc" } },
      answers: {
        orderBy: { question: { sortOrder: "asc" } },
        include: {
          question: { select: { prompt: true, scope: true } },
          attendee: { select: { fullName: true } },
          options: { include: { option: { select: { label: true } } } },
        },
      },
    },
  });
  if (!rsvp) notFound();
  const meals = await db.mealOption.findMany({
    where: { eventId, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
  return (
    <>
      <div className="mb-8">
        <h2 className="editorial text-4xl">Edit RSVP</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {rsvp.household.displayName} · changes are recorded as an immutable
          admin revision.
        </p>
      </div>
      {query.error ? (
        <p
          className="mb-6 border-l-2 border-[var(--negative)] py-1 pl-4 text-sm text-[var(--negative)]"
          role="alert"
        >
          {query.error}
        </p>
      ) : null}
      {rsvp.answers.length ? (
        <section className="mb-10 border-y border-[var(--line)] py-6">
          <h3 className="editorial text-3xl">Guest answers</h3>
          <dl className="mt-5 grid gap-5 sm:grid-cols-2">
            {rsvp.answers.map((answer) => {
              const value = answer.options.length
                ? answer.options
                    .map((selected) => selected.option.label)
                    .join(", ")
                : answer.booleanValue === null
                  ? (answer.textValue ?? "—")
                  : answer.booleanValue
                    ? "Yes"
                    : "No";
              return (
                <div key={answer.id}>
                  <dt className="text-xs font-semibold text-[var(--muted)]">
                    {answer.question.prompt}
                    {answer.question.scope === "ATTENDEE" && answer.attendee
                      ? ` — ${answer.attendee.fullName}`
                      : ""}
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap text-sm">{value}</dd>
                </div>
              );
            })}
          </dl>
        </section>
      ) : null}
      <AdminRsvpEditor
        action={updateRsvpAsAdminAction.bind(null, eventId, rsvpId)}
        initial={{
          response: rsvp.response,
          revision: rsvp.revision,
          contactEmail: rsvp.contactEmail ?? "",
          message: rsvp.message ?? "",
          attendees: rsvp.attendees.map((attendee) => ({
            key: attendee.id,
            attendeeId: attendee.id,
            guestId: attendee.guestId ?? "",
            fullName: attendee.fullName,
            mealOptionId: attendee.mealOptionId ?? "",
            dietaryRestrictions: attendee.dietaryRestrictions ?? "",
          })),
        }}
        guests={rsvp.household.guests.map((guest) => ({
          id: guest.id,
          fullName: guest.fullName,
        }))}
        meals={meals}
        partySizeLimit={rsvp.household.partySizeLimit}
        allowPlusOne={rsvp.household.allowPlusOne}
      />
    </>
  );
}
