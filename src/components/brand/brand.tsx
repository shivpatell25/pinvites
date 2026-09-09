import Image from "next/image";
import Link from "next/link";

export function Brand({
  compact = false,
  href = "/admin",
}: {
  compact?: boolean;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center"
      aria-label="Pinvites home"
    >
      {compact ? (
        <span className="grid size-9 place-items-center overflow-hidden rounded-[12px] bg-black shadow-[inset_0_0_0_1px_rgb(255_255_255_/_12%)]">
          <Image
            src="/brand/pinvites-square.png"
            alt=""
            width={1080}
            height={1080}
            priority
            className="size-9 scale-110 object-contain"
          />
        </span>
      ) : (
        <span className="pinvites-wordmark" aria-hidden="true">
          <Image
            src="/brand/pinvites-source.png"
            alt=""
            width={1080}
            height={1080}
            priority
            className="pinvites-wordmark-source"
          />
        </span>
      )}
    </Link>
  );
}
