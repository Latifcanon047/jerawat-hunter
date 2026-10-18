import type { StatsFilterInput } from "@/lib/validations/stats";

export const JAKARTA_TIME_ZONE = "Asia/Jakarta";
export const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

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
  input: {
    mode: "monthly";
    year: number;
    month: number;
    startDay: number;
    endDay: number;
  },
  now = new Date()
): FilterValidationResult<{
  mode: "monthly";
  year: number;
  month: number;
  startDay: number;
  endDay: number;
  effectiveEndDay: number;
}> {
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
  input: {
    mode: "yearly";
    year: number;
  },
  now = new Date()
): FilterValidationResult<{
  mode: "yearly";
  year: number;
  endMonth: number;
}> {
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

export interface PickingAnalysisRecord {
  triggers: string[];
  emotions: string[];
  urgeStrength: number | null;
  durationRange: string | null;
  reasons: string[];
  impacts: string[];
  context: string | null;
}

export interface PickingAnalysisRepository {
  findPickingAnalysisRecords(
    userId: string,
    startUtc: Date,
    endUtc: Date
  ): Promise<PickingAnalysisRecord[]>;
}

export interface AnalysisOptionItem {
  value: string;
  label: string;
  count: number;
  percentageOfMax: number;
}

export interface AnalysisGroupData {
  key:
    | "triggers"
    | "emotions"
    | "urgeStrength"
    | "durationRange"
    | "reasons"
    | "impacts"
    | "context";
  title: string;
  isMultiSelect: boolean;
  filledCount: number;
  maxCount: number;
  options: AnalysisOptionItem[];
}

export interface PickingAnalysisResult {
  mode: "monthly" | "yearly";
  periodLabel: string;
  totalRecordsInPeriod: number;
  groups: AnalysisGroupData[];
}

export type PickingAnalysisErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_FILTER"
  | "INTERNAL_ERROR";

export class PickingAnalysisError extends Error {
  readonly code: PickingAnalysisErrorCode;

  constructor(code: PickingAnalysisErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface GroupDefinition {
  key: AnalysisGroupData["key"];
  title: string;
  isMultiSelect: boolean;
  options: readonly { value: string | number; label: string }[];
}

export const ANALYSIS_GROUP_DEFINITIONS: readonly GroupDefinition[] = [
  {
    key: "triggers",
    title: "Pemicu",
    isMultiSelect: true,
    options: [
      { value: "TEXTURE_FEEL", label: "Merasa ada benjolan atau tekstur kulit" },
      { value: "MIRROR", label: "Melihat kulit di cermin" },
      { value: "DRY_SCAB", label: "Melihat atau merasakan koreng yang kering" },
      { value: "STRESS", label: "Stres atau cemas" },
      { value: "BOREDOM", label: "Bosan atau tidak ada kegiatan" },
      { value: "AUTOMATIC_HAND", label: "Tangan bergerak otomatis tanpa sadar" },
      { value: "SEEK_RELIEF", label: "Ingin merasakan kepuasan atau kelegaan" },
      { value: "OTHER", label: "Pemicu lainnya" },
    ],
  },
  {
    key: "emotions",
    title: "Emosi",
    isMultiSelect: true,
    options: [
      { value: "ANXIOUS", label: "Cemas atau gelisah" },
      { value: "STRESSED", label: "Stres atau tertekan" },
      { value: "BORED", label: "Bosan" },
      { value: "FRUSTRATED", label: "Kesal atau frustrasi" },
      { value: "NUMB", label: "Kosong atau tidak merasakan apa-apa" },
      { value: "CURIOUS", label: "Penasaran atau ingin merasa puas" },
      { value: "SEEK_RELIEF", label: "Ingin merasa lega" },
      { value: "NEUTRAL", label: "Netral atau biasa saja" },
      { value: "OTHER", label: "Emosi lainnya" },
    ],
  },
  {
    key: "urgeStrength",
    title: "Kekuatan dorongan",
    isMultiSelect: false,
    options: [
      { value: 1, label: "1" },
      { value: 2, label: "2" },
      { value: 3, label: "3" },
      { value: 4, label: "4" },
      { value: 5, label: "5" },
    ],
  },
  {
    key: "durationRange",
    title: "Durasi picking",
    isMultiSelect: false,
    options: [
      { value: "UNDER_1_MIN", label: "Kurang dari 1 menit" },
      { value: "FROM_1_TO_5_MIN", label: "1–5 menit" },
      { value: "FROM_6_TO_15_MIN", label: "6–15 menit" },
      { value: "FROM_16_TO_30_MIN", label: "16–30 menit" },
      { value: "OVER_30_MIN", label: "Lebih dari 30 menit" },
    ],
  },
  {
    key: "reasons",
    title: "Alasan",
    isMultiSelect: true,
    options: [
      {
        value: "REMOVE_TEXTURE",
        label: "Ingin menghilangkan benjolan atau tekstur yang terasa mengganggu",
      },
      {
        value: "PEEL_DRY_SKIN",
        label: "Ingin mengelupas kulit atau koreng yang kering",
      },
      {
        value: "SEEK_SATISFACTION",
        label: "Mencari rasa puas saat memencet atau mengelupas",
      },
      { value: "RELIEVE_URGE", label: "Mencari kelegaan dari dorongan" },
      {
        value: "WANT_SMOOTH_SKIN",
        label: "Ingin kulit terasa lebih halus atau terlihat lebih bersih",
      },
      {
        value: "AUTOMATIC_UNCONSCIOUS",
        label: "Melakukannya tanpa sadar atau tanpa alasan yang jelas",
      },
      { value: "OTHER", label: "Alasan lainnya" },
    ],
  },
  {
    key: "impacts",
    title: "Dampak",
    isMultiSelect: true,
    options: [
      { value: "RED_IRRITATION", label: "Kulit menjadi merah atau iritasi" },
      { value: "BLEEDING_WOUND", label: "Kulit terluka atau berdarah" },
      { value: "NEW_SCAB", label: "Terbentuk koreng baru" },
      { value: "STINGING_PAIN", label: "Terasa perih atau sakit" },
      { value: "MARKS_SCARS", label: "Meninggalkan bekas pada kulit" },
      { value: "TEMPORARY_RELIEF", label: "Merasa lega atau puas sementara" },
      { value: "REGRET_DISAPPOINTED", label: "Merasa menyesal atau kecewa" },
    ],
  },
  {
    key: "context",
    title: "Konteks",
    isMultiSelect: false,
    options: [
      { value: "ALONE_IN_ROOM", label: "Sendirian di kamar" },
      { value: "IN_FRONT_OF_MIRROR", label: "Di depan cermin atau kamar mandi" },
      { value: "USING_PHONE_WATCHING", label: "Saat menggunakan HP atau menonton" },
      { value: "STUDYING_WORKING", label: "Saat belajar atau bekerja" },
      { value: "BEFORE_SLEEP", label: "Sebelum tidur" },
      { value: "OTHER_ACTIVITY", label: "Saat melakukan aktivitas lain" },
      { value: "OTHER", label: "Konteks lainnya" },
    ],
  },
] as const;

export function aggregatePickingAnalysis(
  records: PickingAnalysisRecord[]
): AnalysisGroupData[] {
  return ANALYSIS_GROUP_DEFINITIONS.map((group) => {
    const optionsWithIndex = group.options.map((opt, index) => ({
      value: String(opt.value),
      label: opt.label,
      originalIndex: index,
    }));

    const validKeys = new Set(optionsWithIndex.map((o) => o.value));
    const counts = new Map<string, number>();
    for (const opt of optionsWithIndex) {
      counts.set(opt.value, 0);
    }

    let filledCount = 0;

    for (const record of records) {
      if (group.isMultiSelect) {
        const rawValues = record[group.key as keyof PickingAnalysisRecord];
        if (Array.isArray(rawValues) && rawValues.length > 0) {
          const uniqueValid = Array.from(
            new Set(
              rawValues
                .map((v) => String(v))
                .filter((v) => validKeys.has(v))
            )
          );

          if (uniqueValid.length > 0) {
            filledCount += 1;
            for (const val of uniqueValid) {
              counts.set(val, (counts.get(val) ?? 0) + 1);
            }
          }
        }
      } else {
        const rawValue = record[group.key as keyof PickingAnalysisRecord];
        if (rawValue !== null && rawValue !== undefined && rawValue !== "") {
          const valStr = String(rawValue);
          if (validKeys.has(valStr)) {
            filledCount += 1;
            counts.set(valStr, (counts.get(valStr) ?? 0) + 1);
          }
        }
      }
    }

    const maxCount = Math.max(
      ...optionsWithIndex.map((o) => counts.get(o.value) ?? 0),
      0
    );

    const optionItems = optionsWithIndex.map((o) => {
      const count = counts.get(o.value) ?? 0;
      const percentageOfMax =
        maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
      return {
        value: o.value,
        label: o.label,
        count,
        percentageOfMax,
        originalIndex: o.originalIndex,
      };
    });

    optionItems.sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.originalIndex - b.originalIndex;
    });

    return {
      key: group.key,
      title: group.title,
      isMultiSelect: group.isMultiSelect,
      filledCount,
      maxCount,
      options: optionItems.map(({ value, label, count, percentageOfMax }) => ({
        value,
        label,
        count,
        percentageOfMax,
      })),
    };
  });
}

export async function getPickingAnalysis(
  repository: PickingAnalysisRepository,
  userId: string | null,
  filter: StatsFilterInput,
  now = new Date()
): Promise<PickingAnalysisResult> {
  if (typeof userId !== "string" || userId.trim().length === 0) {
    throw new PickingAnalysisError(
      "UNAUTHENTICATED",
      "Silakan masuk untuk melihat analisis pola picking."
    );
  }

  let startUtc: Date;
  let endUtc: Date;
  let periodLabel: string;

  if (filter.mode === "monthly") {
    const validation = validateMonthlyFilter(filter, now);
    if (!validation.isValid || !validation.data) {
      throw new PickingAnalysisError(
        "INVALID_FILTER",
        validation.error ?? "Filter bulanan tidak valid."
      );
    }
    const { year, month, startDay, effectiveEndDay } = validation.data;
    const bounds = getMonthlyUtcBounds(
      year,
      month,
      startDay,
      effectiveEndDay
    );
    startUtc = bounds.startUtc;
    endUtc = bounds.endUtc;
    const monthName = INDONESIAN_MONTHS_LONG[month - 1];
    periodLabel =
      startDay === effectiveEndDay
        ? `${startDay} ${monthName} ${year}`
        : `${startDay}–${effectiveEndDay} ${monthName} ${year}`;
  } else if (filter.mode === "yearly") {
    const validation = validateYearlyFilter(filter, now);
    if (!validation.isValid || !validation.data) {
      throw new PickingAnalysisError(
        "INVALID_FILTER",
        validation.error ?? "Filter tahunan tidak valid."
      );
    }
    const { year, endMonth } = validation.data;
    const bounds = getYearlyUtcBounds(year, endMonth);
    startUtc = bounds.startUtc;
    endUtc = bounds.endUtc;
    periodLabel = `Tahun ${year}`;
  } else {
    throw new PickingAnalysisError(
      "INVALID_FILTER",
      "Mode filter tidak dikenal."
    );
  }

  const records = await repository.findPickingAnalysisRecords(
    userId,
    startUtc,
    endUtc
  );

  const groups = aggregatePickingAnalysis(records);

  return {
    mode: filter.mode,
    periodLabel,
    totalRecordsInPeriod: records.length,
    groups,
  };
}
