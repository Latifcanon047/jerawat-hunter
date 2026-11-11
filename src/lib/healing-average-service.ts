import { INDONESIAN_MONTHS_LONG } from "@/lib/stats-service";

export interface HealingRecord {
  location: string;
  startedAt: Date;
  healedDate: Date | null;
}

export interface HealingPeriodAverage {
  key: string;
  label: string;
  healedCount: number;
  averageDays: number;
}

export interface HealingAverageResult {
  location: string;
  healedCount: number;
  averageDays: number | null;
  monthly: HealingPeriodAverage[];
  yearly: HealingPeriodAverage[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(values: number[]): number {
  return roundOneDecimal(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function addToGroup(groups: Map<string, number[]>, key: string, days: number) {
  const list = groups.get(key);
  if (list) {
    list.push(days);
  } else {
    groups.set(key, [days]);
  }
}

function summarize(
  groups: Map<string, number[]>,
  labelOf: (key: string) => string,
): HealingPeriodAverage[] {
  return Array.from(groups.entries())
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([key, days]) => ({
      key,
      label: labelOf(key),
      healedCount: days.length,
      averageDays: average(days),
    }));
}

export function getHealingAverages(
  records: HealingRecord[],
  location: string,
): HealingAverageResult {
  const monthly = new Map<string, number[]>();
  const yearly = new Map<string, number[]>();
  const allDays: number[] = [];

  for (const record of records) {
    if (!record.healedDate) continue;
    if (location !== "all" && record.location !== location) continue;

    const days = Math.round(
      (record.healedDate.getTime() - record.startedAt.getTime()) / MS_PER_DAY,
    );
    if (days < 0) continue;

    const year = record.healedDate.getUTCFullYear();
    const month = record.healedDate.getUTCMonth() + 1;

    allDays.push(days);
    addToGroup(yearly, String(year), days);
    addToGroup(monthly, `${year}-${String(month).padStart(2, "0")}`, days);
  }

  return {
    location,
    healedCount: allDays.length,
    averageDays: allDays.length > 0 ? average(allDays) : null,
    monthly: summarize(monthly, (key) => {
      const [year, month] = key.split("-");
      return `${INDONESIAN_MONTHS_LONG[Number(month) - 1]} ${year}`;
    }),
    yearly: summarize(yearly, (key) => key),
  };
}
