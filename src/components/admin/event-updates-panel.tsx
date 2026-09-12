import { Megaphone, Trash2 } from "lucide-react";

import { SubmitButton } from "@/components/ui/submit-button";
import {
  createEventUpdateAction,
  deleteEventUpdateAction,
} from "@/app/admin/events/[eventId]/updates/actions";

type EventUpdateItem = {
  id: string;
  message: string;
  isImportant: boolean;
  postedAt: Date;
};

export function EventUpdatesPanel({
  eventId,
  updates,
}: {
  eventId: string;
  updates: EventUpdateItem[];
}) {
  return (
    <section className="border-t border-[var(--line-strong)] pt-7">
      <div className="mb-5">
        <h2 className="editorial text-3xl">Host updates</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Timely notes guests will see on their invitation
        </p>
      </div>
      <form
        action={createEventUpdateAction.bind(null, eventId)}
        className="mb-7 grid gap-3 rounded-[20px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]"
      >
        <label htmlFor="event-update-message" className="sr-only">
          New host update
        </label>
        <textarea
          id="event-update-message"
          name="message"
          required
          maxLength={2_000}
          rows={3}
          placeholder="Share a change, arrival note, or helpful detail…"
          className="min-h-24 w-full resize-y bg-transparent text-sm leading-6 outline-none placeholder:text-[var(--muted-2)]"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--muted)]">
            <input
              type="checkbox"
              name="isImportant"
              className="size-4 accent-[var(--ink)]"
            />
            Mark as important
          </label>
          <SubmitButton pendingLabel="Posting…">Post update</SubmitButton>
        </div>
      </form>
      {updates.length ? (
        <ol className="relative ml-3 border-l border-[var(--line-strong)]">
          {updates.map((update, index) => (
            <li key={update.id} className="relative pb-6 pl-6 last:pb-0">
              <span
                className={`absolute -left-[5px] top-1 size-[9px] rounded-full ${index === 0 ? "bg-[var(--accent)] ring-4 ring-[var(--canvas)]" : "bg-[var(--line-strong)]"}`}
                aria-hidden="true"
              />
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <time
                      dateTime={update.postedAt.toISOString()}
                      className="text-[10px] font-bold tracking-[0.14em] text-[var(--muted-2)] uppercase"
                    >
                      {new Intl.DateTimeFormat("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      }).format(update.postedAt)}
                    </time>
                    {update.isImportant ? (
                      <span className="text-[9px] font-bold tracking-[0.14em] text-[var(--accent)] uppercase">
                        Important
                      </span>
                    ) : null}
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-6">
                    {update.message}
                  </p>
                </div>
                <form
                  action={deleteEventUpdateAction.bind(
                    null,
                    eventId,
                    update.id,
                  )}
                >
                  <button
                    type="submit"
                    className="grid size-8 place-items-center rounded-full text-[var(--muted-2)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--negative)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                    aria-label="Delete update"
                    title="Delete update"
                  >
                    <Trash2 size={15} strokeWidth={1.8} />
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="flex gap-3 py-5 text-[var(--muted)]">
          <Megaphone size={18} strokeWidth={1.7} />
          <p className="text-sm">No updates posted yet.</p>
        </div>
      )}
    </section>
  );
}
