import "server-only";

import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";

const DELIVERY_LEASE_MILLISECONDS = 7 * 60_000;

export class HouseholdDeliveryBusyError extends Error {
  constructor() {
    super(
      "The event is not published, this household is archived, or another invitation operation is already in progress.",
    );
    this.name = "HouseholdDeliveryBusyError";
  }
}

export type HouseholdDeliveryLease = {
  eventId: string;
  householdId: string;
  lockId: string;
};

export async function claimHouseholdDelivery(
  eventId: string,
  householdId: string,
): Promise<HouseholdDeliveryLease> {
  const now = new Date();
  const lockId = randomUUID();
  const deliveryLockedUntil = new Date(
    now.getTime() + DELIVERY_LEASE_MILLISECONDS,
  );
  await db.$transaction(async (transaction) => {
    const eventClaim = await transaction.event.updateMany({
      where: {
        id: eventId,
        status: "PUBLISHED",
        OR: [
          { deliveryLockedUntil: null },
          { deliveryLockedUntil: { lte: now } },
        ],
      },
      data: { deliveryLockId: lockId, deliveryLockedUntil },
    });
    if (eventClaim.count !== 1) throw new HouseholdDeliveryBusyError();

    const householdClaim = await transaction.household.updateMany({
      where: {
        id: householdId,
        eventId,
        archivedAt: null,
        OR: [
          { deliveryLockedUntil: null },
          { deliveryLockedUntil: { lte: now } },
        ],
      },
      data: { deliveryLockId: lockId, deliveryLockedUntil },
    });
    if (householdClaim.count !== 1) throw new HouseholdDeliveryBusyError();
  });
  return { eventId, householdId, lockId };
}

export async function releaseHouseholdDelivery(
  lease: HouseholdDeliveryLease,
): Promise<void> {
  await db.$transaction(async (transaction) => {
    await transaction.household.updateMany({
      where: { id: lease.householdId, deliveryLockId: lease.lockId },
      data: { deliveryLockId: null, deliveryLockedUntil: null },
    });
    await transaction.event.updateMany({
      where: { id: lease.eventId, deliveryLockId: lease.lockId },
      data: { deliveryLockId: null, deliveryLockedUntil: null },
    });
  });
}
