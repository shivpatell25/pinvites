import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { InvitationExperience } from "@/components/public/InvitationExperience";
import { getPublicEvent } from "@/lib/public-events";
import { submitPublicRsvp } from "@/lib/public-rsvp-action";

export const dynamic = "force-dynamic";

type PublicEventPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PublicEventPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPublicEvent(slug, { trackView: false });
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
