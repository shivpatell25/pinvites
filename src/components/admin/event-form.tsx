import { FieldShell, Input, Textarea } from "@/components/ui/form-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { dateTimeLocalValue } from "@/lib/format";

export interface EventFormValues {
  title: string;
  slug: string;
  subtitle: string | null;
  hostName: string;
  description: string | null;
  details: string | null;
  timezone: string;
  startsAt: Date;
  endsAt: Date | null;
  rsvpDeadline: Date | null;
  isAllDay: boolean;
  isPublic: boolean;
  allowPlusOne: boolean;
  allowMaybe: boolean;
  partySizeLimit: number;
  venueName: string | null;
  venueAddress: string | null;
  venueUrl: string | null;
  latitude: { toString(): string } | string | number | null;
  longitude: { toString(): string } | string | number | null;
  dressCode: string | null;
  whatToBring: string | null;
  arrivalInstructions: string | null;
  primaryColor: string | null;
}

const emptyEvent: EventFormValues = {
  title: "",
  slug: "",
  subtitle: "",
  hostName: "",
  description: "",
  details: "",
  timezone: "America/Denver",
  startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000),
  endsAt: null,
  rsvpDeadline: null,
  isAllDay: false,
  isPublic: false,
  allowPlusOne: false,
  allowMaybe: true,
  partySizeLimit: 4,
  venueName: "",
  venueAddress: "",
  venueUrl: "",
  latitude: null,
  longitude: null,
  dressCode: "",
  whatToBring: "",
  arrivalInstructions: "",
  primaryColor: "#c6472f",
};

export function EventForm({
  action,
  values = emptyEvent,
  submitLabel = "Create event",
}: {
  action: (formData: FormData) => Promise<void>;
  values?: EventFormValues;
  submitLabel?: string;
}) {
  return (
    <form action={action} className="grid gap-10 pb-10">
      <FormSection
        index="01"
        title="The invitation"
        description="The essential words guests see first. Keep them personal and concise."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FieldShell label="Event title" htmlFor="title">
              <Input
                id="title"
                name="title"
                defaultValue={values.title}
                autoComplete="off"
                required
                maxLength={200}
              />
            </FieldShell>
          </div>
          <FieldShell label="Hosted by" htmlFor="hostName">
            <Input
              id="hostName"
              name="hostName"
              defaultValue={values.hostName}
              required
              maxLength={160}
            />
          </FieldShell>
          <FieldShell
            label="Public link"
            htmlFor="slug"
            hint="Lowercase letters, numbers, and hyphens."
          >
            <div className="flex min-h-12 items-center rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface-raised)] pl-3.5 focus-within:border-[var(--ink)]">
              <span className="shrink-0 text-sm text-[var(--muted-2)]">
                /e/
              </span>
              <input
                id="slug"
                name="slug"
                defaultValue={values.slug}
                required
                maxLength={120}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                className="min-w-0 flex-1 bg-transparent px-1 py-3 outline-none"
              />
            </div>
          </FieldShell>
          <div className="sm:col-span-2">
            <FieldShell label="Subtitle" htmlFor="subtitle" optional>
              <Input
                id="subtitle"
                name="subtitle"
                defaultValue={values.subtitle ?? ""}
                maxLength={240}
              />
            </FieldShell>
          </div>
          <div className="sm:col-span-2">
            <FieldShell
              label="A note from the host"
              htmlFor="description"
              optional
              hint="Shown in the invitation’s editorial introduction."
            >
              <Textarea
                id="description"
                name="description"
                defaultValue={values.description ?? ""}
                maxLength={10_000}
              />
            </FieldShell>
          </div>
          <div className="sm:col-span-2">
            <FieldShell
              label="Additional details"
              htmlFor="details"
              optional
              hint="Parking, arrival notes, accessibility, or anything guests should know."
            >
              <Textarea
                id="details"
                name="details"
                defaultValue={values.details ?? ""}
                maxLength={20_000}
              />
            </FieldShell>
          </div>
        </div>
      </FormSection>

      <FormSection
        index="02"
        title="When & where"
        description="Times are stored precisely and presented in the event’s timezone."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <FieldShell label="Starts" htmlFor="startsAt">
            <Input
              id="startsAt"
              name="startsAt"
              type="datetime-local"
              defaultValue={dateTimeLocalValue(
                values.startsAt,
                values.timezone,
              )}
              required
            />
          </FieldShell>
          <FieldShell label="Ends" htmlFor="endsAt" optional>
            <Input
              id="endsAt"
              name="endsAt"
              type="datetime-local"
              defaultValue={dateTimeLocalValue(values.endsAt, values.timezone)}
            />
          </FieldShell>
          <FieldShell
            label="Timezone"
            htmlFor="timezone"
            hint="Use an IANA timezone, such as America/New_York."
          >
            <Input
              id="timezone"
              name="timezone"
              defaultValue={values.timezone}
              list="timezones"
              required
            />
            <datalist id="timezones">
              <option value="America/Los_Angeles" />
              <option value="America/Denver" />
              <option value="America/Chicago" />
              <option value="America/New_York" />
              <option value="Europe/London" />
              <option value="Europe/Paris" />
              <option value="Asia/Tokyo" />
              <option value="Australia/Sydney" />
            </datalist>
          </FieldShell>
          <FieldShell label="RSVP deadline" htmlFor="rsvpDeadline" optional>
            <Input
              id="rsvpDeadline"
              name="rsvpDeadline"
              type="datetime-local"
              defaultValue={dateTimeLocalValue(
                values.rsvpDeadline,
                values.timezone,
              )}
            />
          </FieldShell>
          <div className="sm:col-span-2">
            <CheckRow
              name="isAllDay"
              label="All-day event"
              description="Hide precise times on the invitation."
              defaultChecked={values.isAllDay}
            />
          </div>
          <FieldShell label="Venue" htmlFor="venueName" optional>
            <Input
              id="venueName"
              name="venueName"
              defaultValue={values.venueName ?? ""}
              maxLength={200}
            />
          </FieldShell>
          <FieldShell label="Venue website" htmlFor="venueUrl" optional>
            <Input
              id="venueUrl"
              name="venueUrl"
              type="url"
              defaultValue={values.venueUrl ?? ""}
              maxLength={2048}
            />
          </FieldShell>
          <div className="sm:col-span-2">
            <FieldShell label="Address" htmlFor="venueAddress" optional>
              <Textarea
                id="venueAddress"
                name="venueAddress"
                defaultValue={values.venueAddress ?? ""}
                rows={3}
              />
            </FieldShell>
          </div>
          <div className="sm:col-span-2">
            <FieldShell
              label="Arrival & parking"
              htmlFor="arrivalInstructions"
              optional
              hint="Directions, entrances, parking, check-in, or access notes that matter on event day."
            >
              <Textarea
                id="arrivalInstructions"
                name="arrivalInstructions"
                defaultValue={values.arrivalInstructions ?? ""}
                maxLength={4_000}
                rows={3}
              />
            </FieldShell>
          </div>
          <FieldShell label="Dress code" htmlFor="dressCode" optional>
            <Input
              id="dressCode"
              name="dressCode"
              defaultValue={values.dressCode ?? ""}
              maxLength={160}
            />
          </FieldShell>
          <FieldShell label="What to bring" htmlFor="whatToBring" optional>
            <Input
              id="whatToBring"
              name="whatToBring"
              defaultValue={values.whatToBring ?? ""}
              maxLength={2_000}
            />
          </FieldShell>
          <FieldShell
            label="Latitude"
            htmlFor="latitude"
            optional
            hint="Coordinates enable real weather near the event."
          >
            <Input
              id="latitude"
              name="latitude"
              type="number"
              step="any"
              min={-90}
              max={90}
              defaultValue={values.latitude?.toString() ?? ""}
              placeholder="39.7392"
            />
          </FieldShell>
          <FieldShell label="Longitude" htmlFor="longitude" optional>
            <Input
              id="longitude"
              name="longitude"
              type="number"
              step="any"
              min={-180}
              max={180}
              defaultValue={values.longitude?.toString() ?? ""}
              placeholder="-104.9903"
            />
          </FieldShell>
          <FieldShell label="Invitation accent" htmlFor="primaryColor">
            <div className="flex items-center gap-3">
              <Input
                id="primaryColor"
                name="primaryColor"
                type="color"
                defaultValue={values.primaryColor ?? "#c6472f"}
                className="w-16 px-2"
              />
              <span className="text-xs text-[var(--muted)]">
                Used sparingly for editorial accents. Action controls stay
                accessible automatically.
              </span>
            </div>
          </FieldShell>
        </div>
      </FormSection>

      <FormSection
        index="03"
        title="Guest rules"
        description="These are hard server-side limits, not suggestions to the RSVP form."
      >
        <div className="grid gap-5">
          <FieldShell
            label="Default maximum party size"
            htmlFor="partySizeLimit"
            hint="This is the maximum for public RSVPs. Individual invited households can have a more specific limit."
          >
            <Input
              id="partySizeLimit"
              name="partySizeLimit"
              type="number"
              min={1}
              max={100}
              defaultValue={values.partySizeLimit}
              className="max-w-32"
            />
          </FieldShell>
          <CheckRow
            name="allowMaybe"
            label="Allow “Maybe”"
            description="Guests can give a tentative response."
            defaultChecked={values.allowMaybe}
          />
          <CheckRow
            name="allowPlusOne"
            label="Allow +1s by default"
            description="Personalized households may add unnamed guests up to their limit. Public RSVPs use the event maximum above."
            defaultChecked={values.allowPlusOne}
          />
          <CheckRow
            name="isPublic"
            label="Public event page"
            description="Anyone with the public link can view the invitation. Personalized links are still required for prefilled household RSVPs."
            defaultChecked={values.isPublic}
          />
        </div>
      </FormSection>

      <div className="sticky bottom-[calc(8px+env(safe-area-inset-bottom))] z-20 flex justify-end border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface-raised)_92%,transparent)] p-3 shadow-[var(--shadow-soft)] backdrop-blur-xl sm:rounded-[18px]">
        <SubmitButton className="min-w-36" pendingLabel="Saving event…">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}

function FormSection({
  index,
  title,
  description,
  children,
}: {
  index: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-6 border-t border-[var(--line)] pt-7 md:grid-cols-[220px_minmax(0,680px)] md:gap-10">
      <div>
        <p className="mb-2 text-[10px] font-bold tracking-[0.18em] text-[var(--muted-2)]">
          {index}
        </p>
        <h2 className="editorial text-3xl">{title}</h2>
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
          {description}
        </p>
      </div>
      <div>{children}</div>
    </section>
  );
}

function CheckRow({
  name,
  label,
  description,
  defaultChecked,
}: {
  name: string;
  label: string;
  description: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 border-b border-[var(--line)] py-3 last:border-0">
      <input
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-0.5 size-5 accent-[var(--ink)]"
      />
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-[var(--muted)]">
          {description}
        </span>
      </span>
    </label>
  );
}
