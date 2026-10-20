export type SuccessPercentageLevel = "red" | "yellow" | "blue" | "green";

const SUCCESS_RING_RADIUS = 52;
const SUCCESS_RING_CIRCUMFERENCE = 2 * Math.PI * SUCCESS_RING_RADIUS;

export function calculateSuccessPercentage(
  totalResistance: number,
  totalPicking: number,
): number {
  const resistance = Number.isFinite(totalResistance)
    ? Math.max(0, totalResistance)
    : 0;
  const picking = Number.isFinite(totalPicking) ? Math.max(0, totalPicking) : 0;
  const scale = Math.max(resistance, picking);

  if (scale === 0) return 0;

  const scaledResistance = resistance / scale;
  const scaledPicking = picking / scale;
  const total = scaledResistance + scaledPicking;
  const percentage = ((scaledResistance + scaledPicking * 0) / total) * 100;

  return Math.min(100, Math.max(0, percentage));
}

export function getSuccessPercentageLevel(
  percentage: number,
): SuccessPercentageLevel {
  const value = Number.isFinite(percentage)
    ? Math.min(100, Math.max(0, percentage))
    : 0;

  if (value < 40) return "red";
  if (value < 60) return "yellow";
  if (value < 80) return "blue";
  return "green";
}

export function getSuccessRingGeometry(percentage: number): {
  strokeDasharray: string;
  strokeDashoffset: number;
} {
  const value = Number.isFinite(percentage)
    ? Math.min(100, Math.max(0, percentage))
    : 0;

  return {
    strokeDasharray:
      value === 100
        ? "none"
        : `${SUCCESS_RING_CIRCUMFERENCE} ${SUCCESS_RING_CIRCUMFERENCE}`,
    strokeDashoffset: SUCCESS_RING_CIRCUMFERENCE * (1 - value / 100),
  };
}
