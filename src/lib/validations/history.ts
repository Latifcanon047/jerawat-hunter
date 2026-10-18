import { z } from "zod";

export const JAKARTA_TIME_ZONE = "Asia/Jakarta";
export const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
export const DEFAULT_PAGE_SIZE = 50;

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

export const monthlyFilterInputSchema = z.object({
  mode: z.literal("monthly"),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  startDay: z.number().int().min(1).max(31),
  endDay: z.number().int().min(1).max(31),
});

export const yearlyFilterInputSchema = z.object({
  mode: z.literal("yearly"),
  year: z.number().int().min(2020).max(2100),
});

export const statsFilterSchema = z.discriminatedUnion("mode", [
  monthlyFilterInputSchema,
  yearlyFilterInputSchema,
]);

export type MonthlyFilterInput = z.infer<typeof monthlyFilterInputSchema>;
export type YearlyFilterInput = z.infer<typeof yearlyFilterInputSchema>;
export type StatsFilterInput = z.infer<typeof statsFilterSchema>;

export const historyPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(DEFAULT_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
  filter: statsFilterSchema.nullable().optional().default(null),
});

export type HistoryPaginationInput = z.infer<typeof historyPaginationSchema>;

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

export function getMonthlyUtcBounds(
  year: number,
  month: number,
  startDay: number,
  effectiveEndDay: number
): { startUtc: Date; endUtc: Date } {
  const startUtc = new Date(
    Date.UTC(year, month - 1, startDay, 0, 0, 0, 0) - JAKARTA_OFFSET_MS
  );
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
  const endUtc = new Date(
    Date.UTC(year, endMonth, 1, 0, 0, 0, 0) - JAKARTA_OFFSET_MS
  );
  return { startUtc, endUtc };
}

export interface HistoryDateRange {
  startUtc: Date;
  endUtc: Date;
}

export interface HistoryFilterResolution {
  isValid: boolean;
  error?: string;
  dateRange: HistoryDateRange | null;
}

export function resolveHistoryDateRange(
  filter: StatsFilterInput | null | undefined,
  now = new Date()
): HistoryFilterResolution {
  if (!filter) {
    return { isValid: true, dateRange: null };
  }

  if (filter.mode === "monthly") {
    const validation = validateMonthlyFilter(filter, now);
    if (!validation.isValid || !validation.data) {
      return {
        isValid: false,
        error: validation.error ?? "Filter bulanan tidak valid.",
        dateRange: null,
      };
    }
    const { year, month, startDay, effectiveEndDay } = validation.data;
    const dateRange = getMonthlyUtcBounds(
      year,
      month,
      startDay,
      effectiveEndDay
    );
    return { isValid: true, dateRange };
  }

  if (filter.mode === "yearly") {
    const validation = validateYearlyFilter(filter, now);
    if (!validation.isValid || !validation.data) {
      return {
        isValid: false,
        error: validation.error ?? "Filter tahunan tidak valid.",
        dateRange: null,
      };
    }
    const { year, endMonth } = validation.data;
    const dateRange = getYearlyUtcBounds(year, endMonth);
    return { isValid: true, dateRange };
  }

  return {
    isValid: false,
    error: "Mode filter tidak dikenal.",
    dateRange: null,
  };
}
