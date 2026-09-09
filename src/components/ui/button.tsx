import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
  size?: "sm" | "md" | "lg";
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full font-semibold transition-[background,color,transform,border-color] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
        size === "sm" && "min-h-9 px-4 text-xs",
        size === "md" && "min-h-11 px-5 text-sm",
        size === "lg" && "min-h-13 px-7 text-[15px]",
        variant === "primary" &&
          "bg-[var(--accent)] text-[var(--accent-ink)] shadow-[0_1px_2px_rgb(0_0_0_/_14%)] hover:brightness-105",
        variant === "secondary" &&
          "border border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--ink)] hover:bg-[var(--surface)]",
        variant === "quiet" &&
          "text-[var(--muted)] hover:bg-[var(--line)] hover:text-[var(--ink)]",
        variant === "danger" &&
          "bg-[var(--negative)] text-white hover:opacity-88",
        className,
      )}
      {...props}
    />
  );
}
