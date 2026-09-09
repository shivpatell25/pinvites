export interface TrendPoint {
  label: string;
  responses: number;
  attendees: number;
}

export function TrendChart({ points }: { points: TrendPoint[] }) {
  const maximum = Math.max(
    1,
    ...points.flatMap((point) => [point.responses, point.attendees]),
  );
  const hasData = points.some(
    (point) => point.responses > 0 || point.attendees > 0,
  );
  return (
    <figure>
      <div className="mb-5 flex items-center justify-between gap-4">
        <figcaption>
          <h2 className="editorial text-3xl">Response rhythm</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Submissions and confirmed headcount over the last 14 days
          </p>
        </figcaption>
        <div className="flex gap-4 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
          <span className="flex items-center gap-1.5">
            <i className="size-2 rounded-full bg-[var(--ink)]" /> Responses
          </span>
          <span className="flex items-center gap-1.5">
            <i className="size-2 rounded-full bg-[var(--accent)]" /> People
          </span>
        </div>
      </div>
      <div
        className="relative flex h-44 items-end gap-1 overflow-hidden border-b border-[var(--line-strong)] [background-image:linear-gradient(var(--line)_1px,transparent_1px)] [background-size:100%_25%]"
        role="img"
        aria-label="Fourteen-day response and attendee bar chart"
      >
        {!hasData ? (
          <p className="absolute inset-0 grid place-items-center text-xs text-[var(--muted-2)]">
            Responses will appear here as guests reply.
          </p>
        ) : null}
        {points.map((point, index) => (
          <div
            key={`${point.label}-${index}`}
            className="group relative z-[1] flex h-full min-w-0 flex-1 items-end justify-center gap-[2px]"
          >
            <span
              className="w-[42%] max-w-4 rounded-t-[5px] bg-[var(--ink)] transition-[height]"
              style={{
                height: `${Math.max(point.responses > 0 ? 4 : 0, (point.responses / maximum) * 100)}%`,
              }}
            />
            <span
              className="w-[42%] max-w-4 rounded-t-[5px] bg-[var(--accent)] transition-[height]"
              style={{
                height: `${Math.max(point.attendees > 0 ? 4 : 0, (point.attendees / maximum) * 100)}%`,
              }}
            />
            <span className="pointer-events-none absolute bottom-[calc(100%+8px)] z-10 hidden whitespace-nowrap rounded-md bg-[var(--ink)] px-2 py-1 text-[10px] text-[var(--canvas)] group-hover:block">
              {point.label}: {point.responses} responses, {point.attendees}{" "}
              people
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[9px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
        <span>{points[0]?.label}</span>
        <span>{points.at(-1)?.label}</span>
      </div>
    </figure>
  );
}
