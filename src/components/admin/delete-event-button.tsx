"use client";

import { Trash2 } from "lucide-react";

export function DeleteEventButton({
  action,
  eventTitle,
}: {
  action: (formData: FormData) => Promise<void>;
  eventTitle: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Permanently delete “${eventTitle}” and all of its guests, RSVPs, invitations, email history, questions, meals, and artwork? This cannot be undone.`,
        );
        if (!confirmed) event.preventDefault();
      }}
    >
      <button
        type="submit"
        className="inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-xs font-semibold text-[var(--negative)] transition-colors hover:bg-[color-mix(in_srgb,var(--negative)_10%,transparent)]"
      >
        <Trash2 size={15} aria-hidden="true" /> Delete permanently
      </button>
    </form>
  );
}
