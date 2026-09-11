import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";

import { InvitationExperience } from "@/components/public/InvitationExperience";
import { getPersonalInvitation } from "@/lib/public-events";
import { submitPublicRsvp } from "@/lib/public-rsvp-action";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(max-width: 639px)", color: "#09090b" },
    {
      media: "(min-width: 640px) and (prefers-color-scheme: light)",
      color: "#f5f5f7",
    },
    {
      media: "(min-width: 640px) and (prefers-color-scheme: dark)",
      color: "#09090b",
    },
  ],
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "A private invitation",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function PersonalInvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ source?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const result = await getPersonalInvitation(
    token,
    "INVITATION",
    query.source === "qr" ? "qr" : undefined,
  );
  if (!result) notFound();

  return (
    <InvitationExperience
      event={result.event}
      access={result.access}
      submitAction={submitPublicRsvp}
    />
  );
}
