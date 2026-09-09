export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
      <div className="max-w-3xl">
        {eyebrow ? (
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="editorial text-[clamp(2.7rem,4.6vw,4.15rem)] leading-[0.94]">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-[var(--muted)] sm:text-sm">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
