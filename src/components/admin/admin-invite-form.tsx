"use client";

import { Check, Copy, Send } from "lucide-react";
import { useActionState, useState } from "react";

import {
  createAdminInviteAction,
  type AdminInviteActionState,
} from "@/app/admin/accounts/actions";
import { FieldShell, Input } from "@/components/ui/form-field";
import { SubmitButton } from "@/components/ui/submit-button";

const initialAdminInviteActionState: AdminInviteActionState = {
  status: "IDLE",
};

export function AdminInviteForm() {
  const [state, action] = useActionState(
    createAdminInviteAction,
    initialAdminInviteActionState,
  );
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    if (state.status !== "SUCCESS") return;
    await navigator.clipboard.writeText(state.setupUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="rounded-[24px] border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-card)] sm:p-7">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
        Owner access
      </p>
      <h2 className="editorial mt-2 text-4xl">Invite an administrator</h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
        They’ll create a private account and manage only the events they own.
        Setup links expire after seven days.
      </p>

      <form action={action} className="mt-7 grid gap-5 sm:grid-cols-2">
        <FieldShell label="Name" htmlFor="invite-display-name">
          <Input
            id="invite-display-name"
            name="displayName"
            autoComplete="name"
            maxLength={120}
            required
          />
        </FieldShell>
        <FieldShell label="Email" htmlFor="invite-email">
          <Input
            id="invite-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={320}
            required
          />
        </FieldShell>
        <SubmitButton
          className="sm:col-span-2 sm:justify-self-start"
          pendingLabel="Creating invitation…"
        >
          <Send size={15} aria-hidden="true" /> Invite administrator
        </SubmitButton>
      </form>

      {state.status === "ERROR" ? (
        <p
          className="mt-5 border-l-2 border-[var(--negative)] py-1 pl-4 text-sm text-[var(--negative)]"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}
      {state.status === "SUCCESS" ? (
        <div
          className="mt-6 rounded-[18px] bg-[var(--selection)] p-4"
          role="status"
        >
          <p className="text-sm font-semibold">{state.message}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              aria-label="Private setup link"
              readOnly
              value={state.setupUrl}
              className="min-h-11 min-w-0 flex-1 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 text-xs text-[var(--muted)]"
            />
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[var(--line-strong)] px-4 text-xs font-semibold"
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? "Copied" : "Copy setup link"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
