import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export function MetricCard({
  label,
  value,
  note,
  primary = false,
  delta,
}: {
  label: string;
  value: string | number;
  note?: string;
  primary?: boolean;
  delta?: number;
}) {
  const DeltaIcon =
    delta !== undefined && delta < 0 ? ArrowDownRight : ArrowUpRight;
  return (
    <article
      className={
        primary
          ? "relative min-h-[228px] overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface-raised)] p-6 text-[var(--ink)] shadow-[var(--shadow-card)] sm:p-8"
          : "min-h-[132px] rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"
      }
    >
      <p
        className={
          primary
            ? "text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]"
            : "text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]"
        }
      >
        {label}
      </p>
      <div className="mt-4 flex items-end justify-between gap-3">
        <p
          className={`editorial mono-numerals leading-none ${primary ? "text-7xl text-[var(--accent)] sm:text-8xl" : "text-5xl"}`}
        >
          {value}
        </p>
        {delta !== undefined ? (
          <span className="mb-1 inline-flex items-center gap-1 text-xs text-[var(--muted)]">
            <DeltaIcon size={14} aria-hidden="true" />
            {Math.abs(delta)} today
          </span>
        ) : null}
      </div>
      {note ? (
        <p
          className={
            primary
              ? "mt-5 max-w-xs text-xs leading-relaxed text-[var(--muted)]"
              : "mt-3 text-xs text-[var(--muted)]"
          }
        >
          {note}
        </p>
      ) : null}
      {primary ? (
        <>
          <span
            className="absolute -bottom-24 -right-14 size-60 rounded-full bg-[var(--accent-soft)]"
            aria-hidden="true"
          />
          <span
            className="absolute inset-y-8 left-0 w-[3px] rounded-r-full bg-[var(--accent)]"
            aria-hidden="true"
          />
        </>
      ) : null}
    </article>
  );
}
