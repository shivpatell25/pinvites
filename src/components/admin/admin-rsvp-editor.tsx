"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Input, Select, Textarea } from "@/components/ui/form-field";
import { SubmitButton } from "@/components/ui/submit-button";

type Row = {
  key: string;
  attendeeId: string | null;
  guestId: string;
  fullName: string;
  mealOptionId: string;
  dietaryRestrictions: string;
};

export function AdminRsvpEditor({
  action,
  initial,
  guests,
  meals,
  partySizeLimit,
  allowPlusOne,
}: {
  action: (formData: FormData) => Promise<void>;
  initial: {
    response: "YES" | "MAYBE" | "NO";
    revision: number;
    contactEmail: string;
    message: string;
    attendees: Row[];
  };
  guests: { id: string; fullName: string }[];
  meals: { id: string; name: string }[];
  partySizeLimit: number;
  allowPlusOne: boolean;
}) {
  const [response, setResponse] = useState(initial.response);
  const [contactEmail, setContactEmail] = useState(initial.contactEmail);
  const [message, setMessage] = useState(initial.message);
  const [rows, setRows] = useState(initial.attendees);
  const payload = useMemo(
    () =>
      JSON.stringify({
        response,
        revision: initial.revision,
        contactEmail,
        message,
        attendees:
          response === "NO"
            ? []
            : rows.map((row) => ({
                attendeeId: row.attendeeId,
                guestId: row.guestId,
                fullName: row.fullName,
                mealOptionId: row.mealOptionId,
                dietaryRestrictions: row.dietaryRestrictions,
              })),
      }),
    [contactEmail, initial.revision, message, response, rows],
  );
  function add() {
    if (rows.length >= partySizeLimit) return;
    const unused = guests.find(
      (guest) => !rows.some((row) => row.guestId === guest.id),
    );
    setRows((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        attendeeId: null,
        guestId: unused?.id ?? "",
        fullName: unused?.fullName ?? "",
        mealOptionId: "",
        dietaryRestrictions: "",
      },
    ]);
  }
  function patch(key: string, data: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...data } : row)),
    );
  }
  return (
    <form action={action} className="grid max-w-4xl gap-8">
      <input type="hidden" name="payload" value={payload} />
      <section className="grid gap-5 border-t border-[var(--line-strong)] pt-6 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold">
          Response
          <Select
            value={response}
            onChange={(event) =>
              setResponse(event.target.value as typeof response)
            }
          >
            <option value="YES">Yes</option>
            <option value="MAYBE">Maybe</option>
            <option value="NO">No</option>
          </Select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Confirmation email
          <Input
            type="email"
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
          />
        </label>
      </section>
      {response !== "NO" ? (
        <section>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h3 className="editorial text-3xl">Attendees</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {rows.length} of {partySizeLimit} allowed
              </p>
            </div>
            <button
              type="button"
              onClick={add}
              disabled={rows.length >= partySizeLimit}
              className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--line)] px-3 text-xs font-semibold disabled:opacity-40"
            >
              <Plus size={13} /> Add person
            </button>
          </div>
          <div className="grid gap-4">
            {rows.map((row, index) => (
              <div
                key={row.key}
                className="grid gap-3 border-t border-[var(--line)] pt-4 sm:grid-cols-[1fr_1fr_auto]"
              >
                <label className="grid gap-1.5 text-xs font-semibold">
                  Name
                  <Input
                    value={row.fullName}
                    onChange={(event) =>
                      patch(row.key, { fullName: event.target.value })
                    }
                    required
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-semibold">
                  Named guest
                  <Select
                    value={row.guestId}
                    onChange={(event) => {
                      const guest = guests.find(
                        (item) => item.id === event.target.value,
                      );
                      patch(row.key, {
                        guestId: event.target.value,
                        ...(guest ? { fullName: guest.fullName } : {}),
                      });
                    }}
                  >
                    <option value="">
                      {allowPlusOne ? "Unnamed +1" : "Select a named guest"}
                    </option>
                    {guests.map((guest) => (
                      <option key={guest.id} value={guest.id}>
                        {guest.fullName}
                      </option>
                    ))}
                  </Select>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setRows((current) =>
                      current.filter((item) => item.key !== row.key),
                    )
                  }
                  className="mt-5 grid size-10 place-items-center rounded-full text-[var(--negative)] hover:bg-[var(--line)]"
                  aria-label={`Remove attendee ${index + 1}`}
                >
                  <Trash2 size={15} />
                </button>
                <label className="grid gap-1.5 text-xs font-semibold">
                  Meal
                  <Select
                    value={row.mealOptionId}
                    onChange={(event) =>
                      patch(row.key, { mealOptionId: event.target.value })
                    }
                  >
                    <option value="">No selection</option>
                    {meals.map((meal) => (
                      <option key={meal.id} value={meal.id}>
                        {meal.name}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="grid gap-1.5 text-xs font-semibold sm:col-span-2">
                  Dietary restrictions
                  <Textarea
                    value={row.dietaryRestrictions}
                    onChange={(event) =>
                      patch(row.key, {
                        dietaryRestrictions: event.target.value,
                      })
                    }
                    rows={2}
                    maxLength={2_000}
                  />
                </label>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <label className="grid gap-2 text-sm font-semibold">
        Message from guest
        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={2_000}
        />
      </label>
      <SubmitButton className="justify-self-start" pendingLabel="Saving RSVP…">
        Save RSVP
      </SubmitButton>
    </form>
  );
}
