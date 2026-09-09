import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/cn";

type FieldShellProps = {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
};

export function FieldShell({
  label,
  htmlFor,
  hint,
  error,
  optional,
  children,
}: FieldShellProps) {
  const descriptionId = hint || error ? `${htmlFor}-description` : undefined;
  return (
    <div className="grid gap-2">
      <label
        htmlFor={htmlFor}
        className="flex items-baseline justify-between gap-4 text-sm font-semibold"
      >
        <span>{label}</span>
        {optional ? (
          <span className="text-xs font-normal text-[var(--muted-2)]">
            Optional
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p
          id={descriptionId}
          className="text-xs text-[var(--negative)]"
          role="alert"
        >
          {error}
        </p>
      ) : hint ? (
        <p
          id={descriptionId}
          className="text-xs leading-relaxed text-[var(--muted)]"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-12 w-full rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3.5 outline-none transition-[border-color,box-shadow] placeholder:text-[var(--muted-2)] focus:border-[var(--ink)] focus:ring-3 focus:ring-[color-mix(in_srgb,var(--ink)_8%,transparent)]",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full resize-y rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3.5 py-3 outline-none transition-[border-color,box-shadow] placeholder:text-[var(--muted-2)] focus:border-[var(--ink)] focus:ring-3 focus:ring-[color-mix(in_srgb,var(--ink)_8%,transparent)]",
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "min-h-12 w-full rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3.5 outline-none focus:border-[var(--ink)] focus:ring-3 focus:ring-[color-mix(in_srgb,var(--ink)_8%,transparent)]",
        className,
      )}
      {...props}
    />
  );
}
