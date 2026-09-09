import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="editorial text-8xl leading-none text-[var(--muted-2)]">
          404
        </p>
        <h1 className="editorial mt-5 text-4xl">
          This invitation has slipped away.
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[var(--muted)]">
          Check the link with your host, or return to the Pinvites home.
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex min-h-11 items-center rounded-full bg-[var(--ink)] px-6 text-sm font-semibold text-[var(--canvas)]"
        >
          Return home
        </Link>
      </div>
    </main>
  );
}
