"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fetchPickingAnalysis } from "@/actions/picking-analysis";
import type {
  AnalysisGroupData,
  AnalysisOptionItem,
  PickingAnalysisResult,
} from "@/lib/picking-analysis-service";
import {
  createLatestRequestGuard,
  type LatestRequestGuard,
} from "@/lib/latest-request";
import {
  getDaysInMonth,
  getJakartaDateParts,
  type StatsFilterInput,
} from "@/lib/validations/stats";
import { INDONESIAN_MONTHS_LONG } from "@/lib/stats-service";

export interface PickingAnalysisViewProps {
  initialData: PickingAnalysisResult | null;
  initialError: string | null;
}

export function PickingAnalysisView({
  initialData,
  initialError,
}: PickingAnalysisViewProps) {
  const nowParts = useMemo(() => getJakartaDateParts(new Date()), []);

  // Form states (independent of applied analysis data)
  const [mode, setMode] = useState<"monthly" | "yearly">(
    initialData?.mode ?? "monthly"
  );
  const [year, setYear] = useState<number>(nowParts.year);
  const [month, setMonth] = useState<number>(nowParts.month);
  const [startDay, setStartDay] = useState<number>(1);
  const [endDay, setEndDay] = useState<number>(nowParts.day);

  // Applied data and fetch state
  const [analysis, setAnalysis] = useState<PickingAnalysisResult | null>(
    initialData
  );
  const [prevInitialData, setPrevInitialData] = useState(initialData);
  if (initialData !== prevInitialData) {
    setPrevInitialData(initialData);
    setAnalysis(initialData);
  }

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>(initialError ?? "");
  const [prevInitialError, setPrevInitialError] = useState(initialError);
  if (initialError !== prevInitialError) {
    setPrevInitialError(initialError);
    setError(initialError ?? "");
  }

  // Accordion open/close state (all closed by default)
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());

  const requestGuardRef = useRef<LatestRequestGuard | null>(null);
  if (requestGuardRef.current === null) {
    requestGuardRef.current = createLatestRequestGuard();
  }

  useEffect(() => {
    return () => {
      requestGuardRef.current?.invalidate();
    };
  }, []);

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

  // Inline validation for the filter form
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

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validationError) return;

    const requestId = requestGuardRef.current!.begin();
    setLoading(true);
    setError("");

    const filterInput: StatsFilterInput =
      mode === "monthly"
        ? {
            mode: "monthly",
            year,
            month,
            startDay,
            endDay,
          }
        : {
            mode: "yearly",
            year,
          };

    try {
      const result = await fetchPickingAnalysis(filterInput);
      if (!requestGuardRef.current!.isCurrent(requestId)) return;
      if (!result.success) {
        setError(result.error);
      } else {
        setAnalysis(result.data);
        setError("");
      }
    } catch {
      if (requestGuardRef.current!.isCurrent(requestId)) {
        setError(
          "Gagal memuat analisis pola picking. Silakan periksa koneksi dan coba lagi."
        );
      }
    } finally {
      if (requestGuardRef.current!.isCurrent(requestId)) {
        setLoading(false);
      }
    }
  };

  const toggleGroup = useCallback((groupKey: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);

  return (
    <div className="space-y-6">
      {/* Filter Card */}
      <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">
              Filter Periode Analisis
            </h2>
            <p className="text-xs text-neutral-500">
              Pilih rentang waktu untuk menganalisis pola catatan picking
            </p>
          </div>

          {/* Mode Selector */}
          <div
            role="group"
            aria-label="Mode periode analisis"
            className="inline-flex self-start rounded-xl bg-neutral-100 p-1 sm:self-auto"
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

        <form onSubmit={handleApply} className="space-y-4">
          {mode === "monthly" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label
                  htmlFor={yearId}
                  className="mb-1 block text-xs font-medium text-neutral-700"
                >
                  Tahun
                </label>
                <select
                  id={yearId}
                  value={year}
                  onChange={(e) => handleYearChange(Number(e.target.value))}
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700 sm:text-sm"
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
                  className="mb-1 block text-xs font-medium text-neutral-700"
                >
                  Bulan
                </label>
                <select
                  id={monthId}
                  value={month}
                  onChange={(e) => handleMonthChange(Number(e.target.value))}
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700 sm:text-sm"
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
                  className="mb-1 block text-xs font-medium text-neutral-700"
                >
                  Dari Tgl
                </label>
                <select
                  id={startDayId}
                  value={startDay}
                  onChange={(e) => setStartDay(Number(e.target.value))}
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700 sm:text-sm"
                >
                  {Array.from(
                    { length: maxSelectableDay },
                    (_, i) => i + 1
                  ).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor={endDayId}
                  className="mb-1 block text-xs font-medium text-neutral-700"
                >
                  Sampai Tgl
                </label>
                <select
                  id={endDayId}
                  value={endDay}
                  onChange={(e) => setEndDay(Number(e.target.value))}
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700 sm:text-sm"
                >
                  {Array.from(
                    { length: maxSelectableDay },
                    (_, i) => i + 1
                  ).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="max-w-xs">
              <label
                htmlFor={yearId}
                className="mb-1 block text-xs font-medium text-neutral-700"
              >
                Pilih Tahun
              </label>
              <select
                id={yearId}
                value={year}
                onChange={(e) => handleYearChange(Number(e.target.value))}
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700 sm:text-sm"
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
              className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs font-medium text-rose-600"
            >
              {validationError}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-xs text-neutral-500">
              Perubahan pilihan filter diperbarui setelah menekan tombol
              Tampilkan.
            </p>
            <button
              type="submit"
              disabled={loading || Boolean(validationError)}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-teal-800 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900 disabled:opacity-50"
            >
              {loading ? "Memuat..." : "Tampilkan"}
            </button>
          </div>
        </form>
      </section>

      {/* Error Banner */}
      {error && (
        <div
          role="alert"
          className="space-y-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
        >
          <p>{error}</p>
          {error.includes("masuk") && (
            <Link
              href="/login"
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-rose-700 px-4 text-xs font-semibold text-white hover:bg-rose-800"
            >
              Masuk ke akun
            </Link>
          )}
        </div>
      )}

      {/* Analysis Result Header */}
      {analysis && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Periode Analisis
            </p>
            <p className="mt-0.5 text-base font-semibold text-neutral-900">
              {analysis.periodLabel}
            </p>
          </div>

          {(analysis.totalRecordsInPeriod === 0 ||
            analysis.groups.every((g) => g.filledCount === 0)) && (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-center text-xs leading-relaxed text-neutral-600">
              Belum ada catatan picking pada periode ini. Semua kelompok analisis
              di bawah tetap menampilkan seluruh opsi yang tersedia dengan hitungan 0.
            </div>
          )}

          {/* Seven Analysis Accordion Groups */}
          <div className="space-y-3">
            {analysis.groups.map((group) => (
              <AnalysisGroupAccordion
                key={group.key}
                group={group}
                isOpen={openGroups.has(group.key)}
                onToggle={() => toggleGroup(group.key)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface AnalysisGroupAccordionProps {
  group: AnalysisGroupData;
  isOpen: boolean;
  onToggle: () => void;
}

function AnalysisGroupAccordion({
  group,
  isOpen,
  onToggle,
}: AnalysisGroupAccordionProps) {
  const panelId = `accordion-panel-${group.key}`;
  const buttonId = `accordion-btn-${group.key}`;

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition">
      <button
        type="button"
        id={buttonId}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex min-h-14 w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-neutral-50 sm:p-5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-neutral-900">
              {group.title}
            </h3>
            <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-800">
              {group.filledCount} kejadian terisi
            </span>
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">
            {group.isMultiSelect
              ? "Pilihan ganda (satu kejadian bisa memilih beberapa opsi)"
              : "Pilihan tunggal (satu kejadian memilih satu opsi)"}
          </p>
        </div>

        <svg
          aria-hidden="true"
          className={`h-5 w-5 shrink-0 text-neutral-500 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={buttonId}
          className="border-t border-neutral-100 bg-neutral-50/40 p-4 sm:p-5"
        >
          <div className="space-y-4">
            {group.options.map((item) => (
              <AnalysisOptionRow
                key={item.value}
                item={item}
                maxCount={group.maxCount}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface AnalysisOptionRowProps {
  item: AnalysisOptionItem;
  maxCount: number;
}

function AnalysisOptionRow({ item, maxCount }: AnalysisOptionRowProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-medium leading-relaxed text-neutral-800 sm:text-sm">
          {item.label}
        </span>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-neutral-900 sm:text-sm">
          {item.count}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={item.count}
        aria-valuemin={0}
        aria-valuemax={maxCount}
        aria-label={`${item.label}: ${item.count} kejadian`}
        className="h-2 w-full overflow-hidden rounded-full bg-neutral-200/80"
      >
        <div
          className="h-full rounded-full bg-teal-700 transition-all duration-300"
          style={{ width: `${item.percentageOfMax}%` }}
        />
      </div>
    </div>
  );
}
