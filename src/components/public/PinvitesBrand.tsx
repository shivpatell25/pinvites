import Image from "next/image";

import { cn } from "@/lib/cn";

type PinvitesBrandProps = {
  reversed?: boolean;
  compact?: boolean;
  className?: string | undefined;
  priority?: boolean;
};

export function PinvitesBrand({
  reversed = false,
  compact = false,
  className,
  priority = false,
}: PinvitesBrandProps) {
  if (compact) {
    return (
      <Image
        src="/brand/pinvites-square.png"
        alt="Pinvites"
        width={1080}
        height={1080}
        className={className}
        priority={priority}
      />
    );
  }

  return (
    <span
      className={cn("pinvites-wordmark", className)}
      role="img"
      aria-label="Pinvites"
    >
      <Image
        src="/brand/pinvites-source.png"
        alt=""
        width={1080}
        height={1080}
        className="pinvites-wordmark-source"
        data-reversed={reversed ? "true" : undefined}
        priority={priority}
      />
    </span>
  );
}
