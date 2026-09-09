export default function Loading() {
  return (
    <div
      className="grid min-h-dvh place-items-center"
      role="status"
      aria-label="Loading"
    >
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--line-strong)] border-t-[var(--ink)]" />
    </div>
  );
}
