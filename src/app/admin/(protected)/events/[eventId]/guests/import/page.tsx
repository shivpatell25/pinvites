import { Download } from "lucide-react";

import { CsvImporter } from "@/components/admin/csv-importer";
import { requireEventPage } from "@/lib/admin-page";
import { importGuestsAction } from "@/app/admin/events/[eventId]/guests/actions";

export default async function ImportGuestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ eventId }, query] = await Promise.all([params, searchParams]);
  await requireEventPage(eventId);
  return (
    <div className="max-w-5xl">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="editorial text-4xl">Import guests</h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            Preview and validate every row before a single record is written.
            Imports are all-or-nothing.
          </p>
        </div>
        <a
          download="pinvites-guests-template.csv"
          href="data:text/csv;charset=utf-8,name%2Cemail%2Cphone%2Cparty_name%2Cmax_party_size%2Callow_plus_one%2Ctags%2Cnotes%0AJordan%20Lee%2Cjordan%40example.com%2C%2CLee%20Household%2C2%2Cfalse%2Cfamily%2C"
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--line)] px-4 text-xs font-semibold"
        >
          <Download size={14} /> Template
        </a>
      </div>
      {query.error ? (
        <p
          className="mb-6 border-l-2 border-[var(--negative)] py-1 pl-4 text-sm text-[var(--negative)]"
          role="alert"
        >
          {query.error}
        </p>
      ) : null}
      <CsvImporter action={importGuestsAction.bind(null, eventId)} />
    </div>
  );
}
