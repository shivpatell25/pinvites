import { ImagePlus, Trash2 } from "lucide-react";
import Image from "next/image";
import { notFound } from "next/navigation";

import { FieldShell, Input } from "@/components/ui/form-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireAdminPage } from "@/lib/admin-page";
import { db } from "@/lib/db";

import {
  deleteArtworkAction,
  uploadArtworkAction,
} from "@/app/admin/events/actions";

export default async function ArtworkPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ error?: string; uploaded?: string }>;
}) {
  await requireAdminPage();
  const [{ eventId }, query] = await Promise.all([params, searchParams]);
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: { artwork: { orderBy: { createdAt: "desc" } } },
  });
  if (!event) notFound();
  return (
    <div className="grid gap-10 xl:grid-cols-[1.15fr_0.85fr]">
      <section>
        <h2 className="editorial text-4xl">Event artwork</h2>
        <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
          Artwork leads the invitation. Uploads are decoded, metadata-stripped,
          resized, and stored as optimized WebP files.
        </p>
        {query.error ? (
          <p
            className="mt-6 border-l-2 border-[var(--negative)] py-1 pl-4 text-sm text-[var(--negative)]"
            role="alert"
          >
            {query.error}
          </p>
        ) : null}
        {query.uploaded ? (
          <p
            className="mt-6 border-l-2 border-[var(--positive)] py-1 pl-4 text-sm text-[var(--positive)]"
            role="status"
          >
            Artwork uploaded and set as the hero image.
          </p>
        ) : null}
        <form
          action={uploadArtworkAction.bind(null, eventId)}
          className="mt-8 grid gap-5 border-t border-[var(--line-strong)] pt-6"
        >
          <FieldShell
            label="Image file"
            htmlFor="artwork"
            hint="JPEG, PNG, WebP, or AVIF. At least 600 × 600 pixels."
          >
            <Input
              id="artwork"
              name="artwork"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              required
              className="py-2.5 file:mr-4 file:rounded-full file:border-0 file:bg-[var(--accent)] file:px-4 file:py-2 file:text-xs file:font-semibold file:text-[var(--accent-ink)]"
            />
          </FieldShell>
          <FieldShell
            label="Alternative text"
            htmlFor="altText"
            hint="Describe the artwork for guests who cannot see it."
          >
            <Input id="altText" name="altText" required maxLength={300} />
          </FieldShell>
          <SubmitButton
            className="justify-self-start"
            pendingLabel="Processing artwork…"
          >
            <ImagePlus size={16} /> Upload artwork
          </SubmitButton>
        </form>
      </section>
      <section>
        <h3 className="mb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
          Artwork library
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          {event.artwork.map((artwork) => (
            <article
              key={artwork.id}
              className="group relative overflow-hidden bg-[var(--ink)]"
            >
              <Image
                src={`/media/${artwork.id}/${artwork.storageKey}`}
                alt={artwork.altText ?? "Event artwork"}
                width={artwork.width}
                height={artwork.height}
                className="aspect-[4/3] w-full object-cover"
                unoptimized
              />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/70 to-transparent p-4 pt-12 text-white">
                <div>
                  <p className="max-w-xs truncate text-xs font-semibold">
                    {artwork.originalName}
                  </p>
                  <p className="mt-1 text-[10px] text-white/60">
                    {artwork.width} × {artwork.height}
                    {event.heroArtworkId === artwork.id
                      ? " · Current hero"
                      : ""}
                  </p>
                </div>
                <form
                  action={deleteArtworkAction.bind(null, eventId, artwork.id)}
                >
                  <button
                    className="grid size-9 place-items-center rounded-full bg-black/35 backdrop-blur"
                    title="Delete artwork"
                  >
                    <Trash2 size={15} />
                    <span className="sr-only">
                      Delete {artwork.originalName}
                    </span>
                  </button>
                </form>
              </div>
            </article>
          ))}
          {!event.artwork.length ? (
            <div className="grid min-h-64 place-items-center border border-dashed border-[var(--line-strong)] text-center">
              <div>
                <ImagePlus className="mx-auto text-[var(--muted-2)]" />
                <p className="editorial mt-4 text-3xl">Let the image lead.</p>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Your uploaded artwork will appear here.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
