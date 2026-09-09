import { notFound } from "next/navigation";

import { HouseholdForm } from "@/components/admin/household-form";
import { updateHouseholdAction } from "@/app/admin/events/[eventId]/guests/actions";
import { requireAdminPage } from "@/lib/admin-page";
import { db } from "@/lib/db";

export default async function EditHouseholdPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string; householdId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdminPage();
  const [{ eventId, householdId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const household = await db.household.findFirst({
    where: { id: householdId, eventId },
    include: { guests: { orderBy: { sortOrder: "asc" } } },
  });
  if (!household) notFound();
  return (
    <div className="max-w-3xl">
      <h2 className="editorial text-4xl">Edit household</h2>
      <p className="mt-2 mb-8 text-sm text-[var(--muted)]">
        Invitation access and party limits apply to everyone in this household.
      </p>
      {query.error ? (
        <p
          className="mb-6 border-l-2 border-[var(--negative)] py-1 pl-4 text-sm text-[var(--negative)]"
          role="alert"
        >
          {query.error}
        </p>
      ) : null}
      <HouseholdForm
        action={updateHouseholdAction.bind(null, eventId, householdId)}
        values={household}
        submitLabel="Save household"
      />
    </div>
  );
}
