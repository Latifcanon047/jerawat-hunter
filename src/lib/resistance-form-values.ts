const JAKARTA_TIME_ZONE = "Asia/Jakarta";
const JAKARTA_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

export function toJakartaDateTimeInput(value: Date): string {
  if (!Number.isFinite(value.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((valuePart) => valuePart.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`;
}

export function parseJakartaDateTimeInput(value: string): Date | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText ?? "0");
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  const calendarTime = new Date(0);
  calendarTime.setUTCFullYear(year, month - 1, day);
  calendarTime.setUTCHours(hour, minute, second, 0);
  if (
    calendarTime.getUTCFullYear() !== year ||
    calendarTime.getUTCMonth() !== month - 1 ||
    calendarTime.getUTCDate() !== day
  ) {
    return null;
  }

  return new Date(calendarTime.getTime() - JAKARTA_UTC_OFFSET_MS);
}

export interface PauseResistanceDefaults {
  occurredAt: string;
  durationSecs: string;
}

export function getPauseResistanceDefaults(
  startedAt: string,
  endedAt: string | null,
  formOpenedAt = new Date()
): PauseResistanceDefaults {
  if (!endedAt) return { occurredAt: "", durationSecs: "" };

  const started = new Date(startedAt);
  const ended = new Date(endedAt);
  const elapsedMs = ended.getTime() - started.getTime();
  if (
    !Number.isFinite(started.getTime()) ||
    !Number.isFinite(ended.getTime()) ||
    elapsedMs < 0
  ) {
    return { occurredAt: "", durationSecs: "" };
  }

  return {
    occurredAt: toJakartaDateTimeInput(formOpenedAt),
    durationSecs: String(Math.floor(elapsedMs / 1000)),
  };
}
