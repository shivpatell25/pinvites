"use client";

import { useFormStatus } from "react-dom";

import { Button } from "./button";

export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  className,
  variant = "primary",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  variant?: "primary" | "secondary" | "quiet" | "danger";
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={className}
      variant={variant}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
