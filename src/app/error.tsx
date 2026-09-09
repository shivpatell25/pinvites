"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-[var(--negative)]">
          Something went wrong
        </p>
        <h1 className="editorial text-4xl">We couldn’t finish that.</h1>
        <p className="mx-auto mt-3 max-w-md text-[var(--muted)]">
          Nothing has been lost. Try again, and contact the administrator if the
          problem continues.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-7 min-h-11 rounded-full bg-[var(--ink)] px-6 text-sm font-semibold text-[var(--canvas)]"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
