import type {
  StatsFilterInput,
  MonthlyFilterInput,
  YearlyFilterInput,
} from "@/lib/validations/stats";

export const JAKARTA_TIME_ZONE = "Asia/Jakarta";
export const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

export const INDONESIAN_MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

export const INDONESIAN_MONTHS_LONG = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export function getJakartaDateParts(now = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  const ms = now.getTime() + JAKARTA_OFFSET_MS;
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export interface FilterValidationResult<T> {
  isValid: boolean;
  error?: string;
  data?: T;
}

export function validateMonthlyFilter(
  input: MonthlyFilterInput,
  now = new Date()
): FilterValidationResult<MonthlyFilterInput & { effectiveEndDay: number }> {
  const jakartaNow = getJakartaDateParts(now);

  if (input.year > jakartaNow.year) {
    return {
      isValid: false,
      error: "Tahun tidak boleh berada di masa depan.",
    };
  }

  if (input.year === jakartaNow.year && input.month > jakartaNow.month) {
    return {
      isValid: false,
      error: "Bulan tidak boleh berada di masa depan.",
    };
  }

  const maxDays = getDaysInMonth(input.year, input.month);
  if (input.startDay > maxDays || input.endDay > maxDays) {
    return {
      isValid: false,
      error: `Bulan ini hanya memiliki ${maxDays} hari.`,
    };
  }

  if (input.startDay > input.endDay) {
    return {
      isValid: false,
      error: "Tanggal awal tidak boleh melebihi tanggal akhir.",
    };
  }

  // Current month constraint: cannot show future days
  const isCurrentMonth =
    input.year === jakartaNow.year && input.month === jakartaNow.month;

  if (isCurrentMonth && input.startDay > jakartaNow.day) {
    return {
      isValid: false,
      error: "Tanggal awal tidak boleh melebihi hari ini untuk bulan berjalan.",
    };
  }

  const effectiveEndDay = isCurrentMonth
    ? Math.min(input.endDay, jakartaNow.day)
    : input.endDay;

  return {
    isValid: true,
    data: {
      ...input,
      effectiveEndDay,
    },
  };
}

export function validateYearlyFilter(
  input: YearlyFilterInput,
  now = new Date()
): FilterValidationResult<YearlyFilterInput & { endMonth: number }> {
  const jakartaNow = getJakartaDateParts(now);

  if (input.year > jakartaNow.year) {
    return {
      isValid: false,
      error: "Tahun tidak boleh berada di masa depan.",
    };
  }

  const endMonth = input.year === jakartaNow.year ? jakartaNow.month : 12;

  return {
    isValid: true,
    data: {
      ...input,
      endMonth,
    },
  };
}

export interface StatsOccurrenceRecord {
  occurredAt: Date | null;
}

export interface StatsRepository {
  findResistanceOccurrences(
    userId: string,
    startUtc: Date,
    endUtc: Date
  ): Promise<StatsOccurrenceRecord[]>;
  findPickingOccurrences(
    userId: string,
    startUtc: Date,
    endUtc: Date
  ): Promise<StatsOccurrenceRecord[]>;
}

export interface StatsDataPoint {
  key: string;
  label: string;
  fullLabel: string;
  resistanceCount: number;
  pickingCount: number;
}

export interface StatsResult {
  mode: "monthly" | "yearly";
  points: StatsDataPoint[];
  totalResistance: number;
  totalPicking: number;
  hasActivity: boolean;
  emptyMessage?: string;
  periodLabel: string;
}

export type StatsErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_FILTER"
  | "INTERNAL_ERROR";

export class StatsServiceError extends Error {
  readonly code: StatsErrorCode;

  constructor(code: StatsErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function toJakartaCalendarDate(date: Date): {
  year: number;
  month: number;
  day: number;
} {
  const ms = date.getTime() + JAKARTA_OFFSET_MS;
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

export function getMonthlyUtcBounds(
  year: number,
  month: number,
  startDay: number,
  effectiveEndDay: number
): { startUtc: Date; endUtc: Date } {
  const startUtc = new Date(
    Date.UTC(year, month - 1, startDay, 0, 0, 0, 0) - JAKARTA_OFFSET_MS
  );
  // Exclusive upper bound is start of the day after effectiveEndDay
  const endUtc = new Date(
    Date.UTC(year, month - 1, effectiveEndDay + 1, 0, 0, 0, 0) -
      JAKARTA_OFFSET_MS
  );
  return { startUtc, endUtc };
}

export function getYearlyUtcBounds(
  year: number,
  endMonth: number
): { startUtc: Date; endUtc: Date } {
  const startUtc = new Date(
    Date.UTC(year, 0, 1, 0, 0, 0, 0) - JAKARTA_OFFSET_MS
  );
  // Exclusive upper bound is start of the month after endMonth
  const endUtc = new Date(
    Date.UTC(year, endMonth, 1, 0, 0, 0, 0) - JAKARTA_OFFSET_MS
  );
  return { startUtc, endUtc };
}

export async function getStats(
  repository: StatsRepository,
  userId: string | null,
  filter: StatsFilterInput,
  now = new Date()
): Promise<StatsResult> {
  if (typeof userId !== "string" || userId.trim().length === 0) {
    throw new StatsServiceError(
      "UNAUTHENTICATED",
      "Silakan masuk untuk melihat statistik dashboard."
    );
  }

  if (filter.mode === "monthly") {
    const validation = validateMonthlyFilter(filter, now);
    if (!validation.isValid || !validation.data) {
      throw new StatsServiceError(
        "INVALID_FILTER",
        validation.error ?? "Filter bulanan tidak valid."
      );
    }

    const { year, month, startDay, effectiveEndDay } = validation.data;
    const { startUtc, endUtc } = getMonthlyUtcBounds(
      year,
      month,
      startDay,
      effectiveEndDay
    );

    const [resistances, pickings] = await Promise.all([
      repository.findResistanceOccurrences(userId, startUtc, endUtc),
      repository.findPickingOccurrences(userId, startUtc, endUtc),
    ]);

    // Build day buckets
    const points: StatsDataPoint[] = [];
    const bucketMap = new Map<number, StatsDataPoint>();

    for (let day = startDay; day <= effectiveEndDay; day++) {
      const monthStr = String(month).padStart(2, "0");
      const dayStr = String(day).padStart(2, "0");
      const key = `${year}-${monthStr}-${dayStr}`;
      const label = `${day} ${INDONESIAN_MONTHS_SHORT[month - 1]}`;
      const fullLabel = `${day} ${INDONESIAN_MONTHS_LONG[month - 1]} ${year}`;
      const point: StatsDataPoint = {
        key,
        label,
        fullLabel,
        resistanceCount: 0,
        pickingCount: 0,
      };
      points.push(point);
      bucketMap.set(day, point);
    }

    // Populate resistance counts
    for (const r of resistances) {
      if (!r.occurredAt) continue;
      const jDate = toJakartaCalendarDate(r.occurredAt);
      if (
        jDate.year === year &&
        jDate.month === month &&
        bucketMap.has(jDate.day)
      ) {
        bucketMap.get(jDate.day)!.resistanceCount += 1;
      }
    }

    // Populate picking counts
    for (const p of pickings) {
      if (!p.occurredAt) continue;
      const jDate = toJakartaCalendarDate(p.occurredAt);
      if (
        jDate.year === year &&
        jDate.month === month &&
        bucketMap.has(jDate.day)
      ) {
        bucketMap.get(jDate.day)!.pickingCount += 1;
      }
    }

    const totalResistance = points.reduce(
      (sum, p) => sum + p.resistanceCount,
      0
    );
    const totalPicking = points.reduce((sum, p) => sum + p.pickingCount, 0);
    const hasActivity = totalResistance > 0 || totalPicking > 0;

    const periodLabel =
      startDay === effectiveEndDay
        ? `${startDay} ${INDONESIAN_MONTHS_LONG[month - 1]} ${year}`
        : `${startDay} - ${effectiveEndDay} ${INDONESIAN_MONTHS_LONG[month - 1]} ${year}`;

    return {
      mode: "monthly",
      points,
      totalResistance,
      totalPicking,
      hasActivity,
      emptyMessage: hasActivity
        ? undefined
        : "Belum ada aktivitas pada periode ini.",
      periodLabel,
    };
  }

  if (filter.mode === "yearly") {
    const validation = validateYearlyFilter(filter, now);
    if (!validation.isValid || !validation.data) {
      throw new StatsServiceError(
        "INVALID_FILTER",
        validation.error ?? "Filter tahunan tidak valid."
      );
    }

    const { year, endMonth } = validation.data;
    const { startUtc, endUtc } = getYearlyUtcBounds(year, endMonth);

    const [resistances, pickings] = await Promise.all([
      repository.findResistanceOccurrences(userId, startUtc, endUtc),
      repository.findPickingOccurrences(userId, startUtc, endUtc),
    ]);

    const points: StatsDataPoint[] = [];
    const bucketMap = new Map<number, StatsDataPoint>();

    for (let month = 1; month <= endMonth; month++) {
      const monthStr = String(month).padStart(2, "0");
      const key = `${year}-${monthStr}`;
      const label = INDONESIAN_MONTHS_SHORT[month - 1];
      const fullLabel = `${INDONESIAN_MONTHS_LONG[month - 1]} ${year}`;
      const point: StatsDataPoint = {
        key,
        label,
        fullLabel,
        resistanceCount: 0,
        pickingCount: 0,
      };
      points.push(point);
      bucketMap.set(month, point);
    }

    // Populate resistance counts
    for (const r of resistances) {
      if (!r.occurredAt) continue;
      const jDate = toJakartaCalendarDate(r.occurredAt);
      if (jDate.year === year && bucketMap.has(jDate.month)) {
        bucketMap.get(jDate.month)!.resistanceCount += 1;
      }
    }

    // Populate picking counts
    for (const p of pickings) {
      if (!p.occurredAt) continue;
      const jDate = toJakartaCalendarDate(p.occurredAt);
      if (jDate.year === year && bucketMap.has(jDate.month)) {
        bucketMap.get(jDate.month)!.pickingCount += 1;
      }
    }

    const totalResistance = points.reduce(
      (sum, p) => sum + p.resistanceCount,
      0
    );
    const totalPicking = points.reduce((sum, p) => sum + p.pickingCount, 0);
    const hasActivity = totalResistance > 0 || totalPicking > 0;

    return {
      mode: "yearly",
      points,
      totalResistance,
      totalPicking,
      hasActivity,
      emptyMessage: hasActivity
        ? undefined
        : "Belum ada aktivitas pada periode ini.",
      periodLabel: `Tahun ${year}`,
    };
  }

  throw new StatsServiceError("INVALID_FILTER", "Mode filter tidak dikenal.");
}
