"use client";

import { FileUp } from "lucide-react";
import { useState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { parseGuestCsv, type GuestCsvImportResult } from "@/lib/csv";

export function CsvImporter({
  action,
}: {
  action: (formData: FormData) => Promise<void>;
}) {
  const [preview, setPreview] = useState<GuestCsvImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function inspect(file: File | undefined) {
    setPreview(null);
    setError(null);
    if (!file) return;
    if (file.size > 2_000_000) {
      setError("CSV files must be under 2 MB.");
      return;
    }
    try {
      setPreview(
        parseGuestCsv(await file.text(), {
          maxBytes: 2_000_000,
          maxRows: 10_000,
          previewRows: 25,
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not read this CSV.",
      );
    }
  }

  return (
    <form action={action} className="grid gap-6">
      <label className="grid min-h-36 cursor-pointer place-items-center border border-dashed border-[var(--line-strong)] p-6 text-center hover:bg-[var(--line)]">
        <span>
          <FileUp className="mx-auto text-[var(--muted)]" />
          <span className="mt-3 block text-sm font-semibold">
            Choose a guest CSV
          </span>
          <span className="mt-1 block text-xs text-[var(--muted)]">
            Up to 10,000 rows · 2 MB
          </span>
        </span>
        <input
          name="csv"
          type="file"
          accept=".csv,text/csv"
          required
          className="sr-only"
          onChange={(event) => void inspect(event.target.files?.[0])}
        />
      </label>
      {error ? (
        <p
          className="border-l-2 border-[var(--negative)] py-1 pl-4 text-sm text-[var(--negative)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {preview ? (
        <div>
          <div className="mb-4 flex flex-wrap gap-5 text-xs">
            <span>
              <b className="mono-numerals text-lg">{preview.totalRows}</b> rows
            </span>
            <span className="text-[var(--positive)]">
              <b className="mono-numerals text-lg">{preview.validRows}</b> valid
            </span>
            <span
              className={
                preview.invalidRows
                  ? "text-[var(--negative)]"
                  : "text-[var(--muted)]"
              }
            >
              <b className="mono-numerals text-lg">{preview.invalidRows}</b>{" "}
              invalid
            </span>
          </div>
          <div className="overflow-x-auto border-y border-[var(--line)]">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                <tr>
                  <th className="py-3 pr-4">Row</th>
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4">Email</th>
                  <th className="py-3 pr-4">Party</th>
                  <th className="py-3 pr-4">Limit</th>
                  <th className="py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {preview.preview.map((row) => (
                  <tr key={row.rowNumber}>
                    <td className="py-3 pr-4 text-[var(--muted)]">
                      {row.rowNumber}
                    </td>
                    <td className="py-3 pr-4 font-semibold">
                      {row.values.name ?? "—"}
                    </td>
                    <td className="py-3 pr-4">{row.values.email ?? "—"}</td>
                    <td className="py-3 pr-4">{row.values.partyName ?? "—"}</td>
                    <td className="py-3 pr-4">
                      {row.values.maxPartySize ?? "—"}
                    </td>
                    <td
                      className={`py-3 ${row.valid ? "text-[var(--positive)]" : "text-[var(--negative)]"}`}
                    >
                      {row.valid
                        ? "Ready"
                        : row.issues.map((issue) => issue.message).join("; ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.issues.some((issue) => issue.severity === "warning") ? (
            <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-[var(--warning)]">
              {preview.issues
                .filter((issue) => issue.severity === "warning")
                .slice(0, 8)
                .map((issue, index) => (
                  <li key={`${issue.code}-${index}`}>{issue.message}</li>
                ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <SubmitButton
        pendingLabel="Importing guests…"
        className="justify-self-start"
        variant={preview?.canImport ? "primary" : "secondary"}
      >
        Import {preview?.validRows ?? ""} guests
      </SubmitButton>
    </form>
  );
}
