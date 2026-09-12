import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";

import { InvitationExperience } from "@/components/public/InvitationExperience";
import { getPublicEvent } from "@/lib/public-events";
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

type PublicEventPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PublicEventPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPublicEvent(slug, {
    trackView: false,
    includeWeather: false,
  });
  if (!result) return { title: "Invitation" };
  return {
    title: result.event.title,
    description:
      result.event.description ??
      `An invitation from ${result.event.hostName}.`,
    openGraph: {
      title: result.event.title,
      description:
        result.event.description ??
        `An invitation from ${result.event.hostName}.`,
      type: "website",
      ...(result.event.artworkUrl
        ? { images: [{ url: result.event.artworkUrl }] }
        : {}),
    },
  };
}

export default async function PublicEventPage({
  params,
}: PublicEventPageProps) {
  const { slug } = await params;
  const result = await getPublicEvent(slug);
  if (!result) notFound();

  return (
    <InvitationExperience
      event={result.event}
      access={result.access}
      submitAction={submitPublicRsvp}
    />
  );
}
