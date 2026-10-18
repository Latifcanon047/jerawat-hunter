"use client";

import {
  useCallback,
  useId,
  useMemo,
  useState,
} from "react";
import {
  getDaysInMonth,
  getJakartaDateParts,
  type StatsFilterInput,
} from "@/lib/validations/stats";
import { INDONESIAN_MONTHS_LONG } from "@/lib/stats-service";

export interface HistoryDateFilterProps {
  activeFilter: StatsFilterInput | null;
  onApply: (filter: StatsFilterInput) => void;
  onReset: () => void;
  loading?: boolean;
}

export function HistoryDateFilter({
  activeFilter,
  onApply,
  onReset,
  loading = false,
}: HistoryDateFilterProps) {
  const nowParts = useMemo(() => getJakartaDateParts(new Date()), []);

  // Form states
  const [mode, setMode] = useState<"monthly" | "yearly">(
    activeFilter?.mode ?? "monthly"
  );
  const [year, setYear] = useState<number>(
    activeFilter?.year ?? nowParts.year
  );
  const [month, setMonth] = useState<number>(
    activeFilter?.mode === "monthly" ? activeFilter.month : nowParts.month
  );
  const [startDay, setStartDay] = useState<number>(
    activeFilter?.mode === "monthly" ? activeFilter.startDay : 1
  );
  const [endDay, setEndDay] = useState<number>(
    activeFilter?.mode === "monthly" ? activeFilter.endDay : nowParts.day
  );

  const yearId = useId();
  const monthId = useId();
  const startDayId = useId();
  const endDayId = useId();

  const availableYears = useMemo(() => {
    const list: number[] = [];
    const minYear = 2024;
    for (let y = nowParts.year; y >= minYear; y--) {
      list.push(y);
    }
    return list;
  }, [nowParts.year]);

  const availableMonths = useMemo(() => {
    const maxMonth = year === nowParts.year ? nowParts.month : 12;
    return INDONESIAN_MONTHS_LONG.map((name, index) => ({
      index: index + 1,
      name,
    })).filter((m) => m.index <= maxMonth);
  }, [year, nowParts.year, nowParts.month]);

  const getMaxDay = useCallback(
    (targetYear: number, targetMonth: number) => {
      const days = getDaysInMonth(targetYear, targetMonth);
      if (targetYear === nowParts.year && targetMonth === nowParts.month) {
        return Math.min(days, nowParts.day);
      }
      return days;
    },
    [nowParts.year, nowParts.month, nowParts.day]
  );

  const maxSelectableDay = useMemo(() => {
    return getMaxDay(year, month);
  }, [getMaxDay, year, month]);

  const handleYearChange = (newYear: number) => {
    setYear(newYear);
    const maxMonth = newYear === nowParts.year ? nowParts.month : 12;
    const effectiveMonth = month > maxMonth ? maxMonth : month;
    if (effectiveMonth !== month) {
      setMonth(effectiveMonth);
    }
    const maxDay = getMaxDay(newYear, effectiveMonth);
    if (startDay > maxDay) setStartDay(1);
    if (endDay > maxDay) setEndDay(maxDay);
  };

  const handleMonthChange = (newMonth: number) => {
    setMonth(newMonth);
    const maxDay = getMaxDay(year, newMonth);
    if (startDay > maxDay) setStartDay(1);
    if (endDay > maxDay) setEndDay(maxDay);
  };

  const validationError = useMemo(() => {
    if (mode === "monthly") {
      if (startDay > endDay) {
        return "Tanggal awal tidak boleh melebihi tanggal akhir.";
      }
      if (startDay < 1 || startDay > maxSelectableDay) {
        return `Tanggal awal harus antara 1 dan ${maxSelectableDay}.`;
      }
      if (endDay < 1 || endDay > maxSelectableDay) {
        return `Tanggal akhir harus antara 1 dan ${maxSelectableDay}.`;
      }
    }
    if (mode === "yearly") {
      if (year > nowParts.year) {
        return "Tahun tidak boleh berada di masa depan.";
      }
    }
    return null;
  }, [mode, startDay, endDay, maxSelectableDay, year, nowParts.year]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validationError) return;

    if (mode === "monthly") {
      onApply({
        mode: "monthly",
        year,
        month,
        startDay,
        endDay,
      });
    } else {
      onApply({
        mode: "yearly",
        year,
      });
    }
  };

  const activeFilterLabel = useMemo(() => {
    if (!activeFilter) return null;
    if (activeFilter.mode === "monthly") {
      const monthName = INDONESIAN_MONTHS_LONG[activeFilter.month - 1];
      if (activeFilter.startDay === activeFilter.endDay) {
        return `${activeFilter.startDay} ${monthName} ${activeFilter.year}`;
      }
      return `${activeFilter.startDay}–${activeFilter.endDay} ${monthName} ${activeFilter.year}`;
    }
    return `Tahun ${activeFilter.year}`;
  }, [activeFilter]);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 shadow-sm space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">
          Filter Tanggal
        </h2>

        {/* Mode Selector */}
        <div
          role="group"
          aria-label="Mode periode riwayat"
          className="inline-flex rounded-xl bg-neutral-100 p-1 self-start sm:self-auto"
        >
          <button
            type="button"
            onClick={() => setMode("monthly")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              mode === "monthly"
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            Bulanan
          </button>
          <button
            type="button"
            onClick={() => setMode("yearly")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              mode === "yearly"
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            Tahunan
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "monthly" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label
                htmlFor={yearId}
                className="block text-xs font-medium text-neutral-700 mb-1"
              >
                Tahun
              </label>
              <select
                id={yearId}
                value={year}
                onChange={(e) => handleYearChange(Number(e.target.value))}
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs sm:text-sm text-neutral-900 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor={monthId}
                className="block text-xs font-medium text-neutral-700 mb-1"
              >
                Bulan
              </label>
              <select
                id={monthId}
                value={month}
                onChange={(e) => handleMonthChange(Number(e.target.value))}
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs sm:text-sm text-neutral-900 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
              >
                {availableMonths.map((m) => (
                  <option key={m.index} value={m.index}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor={startDayId}
                className="block text-xs font-medium text-neutral-700 mb-1"
              >
                Dari Tgl
              </label>
              <select
                id={startDayId}
                value={startDay}
                onChange={(e) => setStartDay(Number(e.target.value))}
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs sm:text-sm text-neutral-900 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
              >
                {Array.from({ length: maxSelectableDay }, (_, i) => i + 1).map(
                  (d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label
                htmlFor={endDayId}
                className="block text-xs font-medium text-neutral-700 mb-1"
              >
                Sampai Tgl
              </label>
              <select
                id={endDayId}
                value={endDay}
                onChange={(e) => setEndDay(Number(e.target.value))}
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs sm:text-sm text-neutral-900 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
              >
                {Array.from({ length: maxSelectableDay }, (_, i) => i + 1).map(
                  (d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>
        ) : (
          <div className="max-w-xs">
            <label
              htmlFor={yearId}
              className="block text-xs font-medium text-neutral-700 mb-1"
            >
              Pilih Tahun
            </label>
            <select
              id={yearId}
              value={year}
              onChange={(e) => handleYearChange(Number(e.target.value))}
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs sm:text-sm text-neutral-900 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        )}

        {validationError && (
          <p
            role="alert"
            className="text-xs font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2"
          >
            {validationError}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={loading || Boolean(validationError)}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-teal-800 px-5 text-xs font-semibold text-white shadow-sm hover:bg-teal-900 disabled:opacity-50 transition"
            >
              {loading ? "Memuat..." : "Tampilkan"}
            </button>
            {activeFilter && (
              <button
                type="button"
                onClick={onReset}
                disabled={loading}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-neutral-300 px-4 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition"
              >
                Hapus filter
              </button>
            )}
          </div>
          {activeFilterLabel && (
            <p className="text-xs text-neutral-600 font-medium">
              Filter aktif:{" "}
              <span className="font-semibold text-teal-800">
                {activeFilterLabel}
              </span>
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
