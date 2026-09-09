import { FieldShell, Input, Textarea } from "@/components/ui/form-field";
import { SubmitButton } from "@/components/ui/submit-button";

export interface HouseholdFormValues {
  displayName: string;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  partySizeLimit: number;
  allowPlusOne: boolean;
  notes: string | null;
  tags: string[];
  guests: { fullName: string }[];
}

export function HouseholdForm({
  action,
  values,
  submitLabel = "Add household",
}: {
  action: (formData: FormData) => Promise<void>;
  values?: HouseholdFormValues;
  submitLabel?: string;
}) {
  return (
    <form action={action} className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <FieldShell label="Household or party" htmlFor="displayName">
          <Input
            id="displayName"
            name="displayName"
            defaultValue={values?.displayName ?? ""}
            required
            maxLength={200}
          />
        </FieldShell>
        <FieldShell label="Primary contact" htmlFor="contactName">
          <Input
            id="contactName"
            name="contactName"
            defaultValue={values?.contactName ?? ""}
            required
            maxLength={160}
          />
        </FieldShell>
        <FieldShell label="Email" htmlFor="contactEmail" optional>
          <Input
            id="contactEmail"
            name="contactEmail"
            type="email"
            inputMode="email"
            defaultValue={values?.contactEmail ?? ""}
            maxLength={320}
          />
        </FieldShell>
        <FieldShell label="Phone" htmlFor="contactPhone" optional>
          <Input
            id="contactPhone"
            name="contactPhone"
            type="tel"
            defaultValue={values?.contactPhone ?? ""}
            maxLength={40}
          />
        </FieldShell>
        <FieldShell label="Maximum party size" htmlFor="partySizeLimit">
          <Input
            id="partySizeLimit"
            name="partySizeLimit"
            type="number"
            min={1}
            max={100}
            defaultValue={values?.partySizeLimit ?? 1}
            required
          />
        </FieldShell>
        <FieldShell
          label="Tags"
          htmlFor="tags"
          optional
          hint="Comma-separated, for filtering and organization."
        >
          <Input
            id="tags"
            name="tags"
            defaultValue={values?.tags.join(", ") ?? ""}
            maxLength={500}
          />
        </FieldShell>
        <div className="sm:col-span-2">
          <FieldShell
            label="Named guests"
            htmlFor="guestNames"
            hint="One person per line. The first person is the primary guest."
          >
            <Textarea
              id="guestNames"
              name="guestNames"
              defaultValue={
                values?.guests.map((guest) => guest.fullName).join("\n") ?? ""
              }
              rows={4}
              maxLength={4_000}
            />
          </FieldShell>
        </div>
        <div className="sm:col-span-2">
          <FieldShell label="Internal notes" htmlFor="notes" optional>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={values?.notes ?? ""}
              rows={3}
              maxLength={5_000}
            />
          </FieldShell>
        </div>
      </div>
      <label className="flex cursor-pointer items-start gap-3 border-y border-[var(--line)] py-4">
        <input
          name="allowPlusOne"
          type="checkbox"
          defaultChecked={values?.allowPlusOne ?? false}
          className="mt-0.5 size-5 accent-[var(--ink)]"
        />
        <span>
          <span className="block text-sm font-semibold">Allow unnamed +1s</span>
          <span className="mt-0.5 block text-xs text-[var(--muted)]">
            The party-size limit still applies.
          </span>
        </span>
      </label>
      <SubmitButton
        pendingLabel="Saving household…"
        className="justify-self-start"
      >
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
