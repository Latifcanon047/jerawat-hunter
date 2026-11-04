export type AcneTrackingStatusValue = "ACTIVE" | "HEALED";

export function getAcneTrackingHealingUpdate(
  status: AcneTrackingStatusValue,
  healedDate: Date
): { status: "HEALED"; healedDate: Date } | null {
  if (status === "HEALED") return null;
  return { status: "HEALED", healedDate };
}
