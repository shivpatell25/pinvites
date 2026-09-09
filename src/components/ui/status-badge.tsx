import { cn } from "@/lib/cn";

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "positive" | "warning" | "negative";
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center rounded-full px-2.5 text-[10px] font-bold uppercase tracking-[0.12em]",
        tone === "neutral" && "bg-[var(--line)] text-[var(--muted)]",
        tone === "positive" &&
          "bg-[color-mix(in_srgb,var(--positive)_13%,transparent)] text-[var(--positive)]",
        tone === "warning" &&
          "bg-[color-mix(in_srgb,var(--warning)_13%,transparent)] text-[var(--warning)]",
        tone === "negative" &&
          "bg-[color-mix(in_srgb,var(--negative)_13%,transparent)] text-[var(--negative)]",
      )}
    >
      {children}
    </span>
  );
}
