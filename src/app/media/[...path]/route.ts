import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getServerEnvironment } from "@/lib/env";
import { verifyPublicGrant } from "@/lib/public-grants";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const segments = (await params).path;
  if (
    segments.length < 2 ||
    segments.some(
      (segment) =>
        !/^[a-zA-Z0-9._-]+$/.test(segment) ||
        segment === "." ||
        segment === "..",
    )
  )
    return new NextResponse("Not found", { status: 404 });
  const artworkId = segments[0]!;
  const storageSegments = segments.slice(1);
  const storageKey = storageSegments.join("/");
  const artwork = await db.eventArtwork.findFirst({
    where: { id: artworkId, storageKey },
    include: { event: { select: { status: true, isPublic: true } } },
  });
  if (!artwork) return new NextResponse("Not found", { status: 404 });
  const published =
    artwork.event.status === "PUBLISHED" || artwork.event.status === "CLOSED";
  const subject = `${artwork.id}\0${artwork.storageKey}`;
  const grant = new URL(request.url).searchParams.get("grant");
  const authorizedPublic =
    published &&
    (artwork.event.isPublic || verifyPublicGrant(grant, "artwork", subject));
  if (!authorizedPublic && !(await getCurrentAdmin()))
    return new NextResponse("Not found", { status: 404 });
  const root = path.resolve(getServerEnvironment().MEDIA_ROOT);
  const target = path.resolve(root, storageKey);
  if (!target.startsWith(`${root}${path.sep}`))
    return new NextResponse("Not found", { status: 404 });
  try {
    const body = await readFile(target);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": artwork.mimeType,
        "Content-Length": String(body.byteLength),
        ETag: `"${artwork.checksumSha256}"`,
        "Cache-Control":
          authorizedPublic && artwork.event.isPublic
            ? "public, max-age=31536000, immutable"
            : "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
