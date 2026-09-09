export function authorizedPartySizeLimit({
  accessKind,
  partySizeLimit,
  allowPlusOne,
  namedGuestCount,
}: {
  accessKind: "PUBLIC" | "PERSONALIZED";
  partySizeLimit: number;
  allowPlusOne: boolean;
  namedGuestCount: number;
}) {
  const maximum = Math.max(1, Math.trunc(partySizeLimit));
  if (accessKind === "PUBLIC" || allowPlusOne) return maximum;
  return Math.min(maximum, Math.max(1, namedGuestCount));
}
