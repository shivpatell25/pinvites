import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { requireEventAccess } from "@/lib/admin-authorization";
import { db } from "@/lib/db";
import { getServerEnvironment } from "@/lib/env";
import {
  claimHouseholdDelivery,
  HouseholdDeliveryBusyError,
  releaseHouseholdDelivery,
} from "@/lib/household-delivery-lock";
import { createQrDownload } from "@/lib/qr";
import { assertCsrfSafeRequest } from "@/lib/security/csrf";
import { generateSecureToken } from "@/lib/security/tokens";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string; householdId: string }> },
) {
  assertCsrfSafeRequest(request);
  const admin = await requireAdmin();
  const { eventId, householdId } = await params;
  await requireEventAccess(eventId, admin);
  let lease;
  try {
    lease = await claimHouseholdDelivery(eventId, householdId);
  } catch (error) {
    if (error instanceof HouseholdDeliveryBusyError) {
      return new NextResponse(error.message, { status: 409 });
    }
    throw error;
  }
  try {
    const household = await db.household.findFirst({
      where: { id: householdId, eventId, archivedAt: null },
      include: {
        event: { select: { slug: true, status: true } },
        invitation: true,
      },
    });
    if (!household) return new NextResponse("Not found", { status: 404 });
    if (household.event.status !== "PUBLISHED") {
      return new NextResponse(
        "Publish this event before generating a QR code.",
        {
          status: 409,
        },
      );
    }
    const generated = generateSecureToken("invitation");
    const url = new URL(
      `/i/${encodeURIComponent(generated.token)}?source=qr`,
      getServerEnvironment().BASE_URL,
    ).toString();
    const download = await createQrDownload(
      url,
      `${household.event.slug}-${household.displayName}-qr.png`,
    );
    await db.$transaction(async (transaction) => {
      let invitation = household.invitation;
      if (!invitation) {
        invitation = await transaction.invitation.create({
          data: { householdId: household.id },
        });
      } else if (invitation.revokedAt) {
        invitation = await transaction.invitation.update({
          where: { id: invitation.id },
          data: { status: "CREATED", revokedAt: null, failedAt: null },
        });
      }
      await transaction.invitationToken.create({
        data: {
          invitationId: invitation.id,
          type: "INVITATION",
          tokenHash: generated.tokenHash,
        },
      });
      await transaction.auditLog.create({
        data: {
          adminId: admin.id,
          eventId,
          action: "invitation.qr_generated",
          entityType: "Household",
          entityId: household.id,
        },
      });
    });
    return new NextResponse(new Uint8Array(download.body), {
      headers: download.headers,
    });
  } finally {
    await releaseHouseholdDelivery(lease).catch((error: unknown) => {
      console.error("Unable to release household QR lease", error);
    });
  }
}
