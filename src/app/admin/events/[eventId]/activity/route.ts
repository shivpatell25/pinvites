import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { requireEventAccess } from "@/lib/admin-authorization";
import { getGuestActivity } from "@/lib/guest-activity";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { eventId } = await context.params;
    await requireEventAccess(eventId, admin);
    return NextResponse.json(
      { items: await getGuestActivity(eventId) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
