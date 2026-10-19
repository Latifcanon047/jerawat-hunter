"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { fetchDashboardStats } from "@/actions/stats";
import type { StatsDataPoint, StatsResult } from "@/lib/stats-service";
import { INDONESIAN_MONTHS_LONG } from "@/lib/stats-service";
import {
  getDaysInMonth,
  getJakartaDateParts,
  type StatsFilterInput,
} from "@/lib/validations/stats";
import { createAppliedStatsFilter } from "@/lib/dashboard-stats-refresh";
import {
  calculateSuccessPercentage,
  getSuccessPercentageLevel,
  getSuccessRingGeometry,
} from "@/lib/success-percentage";
import {
  createLatestRequestGuard,
  type LatestRequestGuard,
} from "@/lib/latest-request";
import Link from "next/link";

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
  payload: StatsDataPoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-md text-xs">
      <p className="font-semibold text-neutral-900 mb-1.5">{point.fullLabel}</p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#0f766e]" />
            <span className="text-neutral-600">Berhasil Menahan:</span>
          </div>
          <span className="font-semibold text-teal-800">
            {point.resistanceCount}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#e11d48]" />
            <span className="text-neutral-600">Kejadian Picking:</span>
          </div>
          <span className="font-semibold text-rose-800">
            {point.pickingCount}
          </span>
        </div>
      </div>
    </div>
  );
}

const emptySubscribe = () => () => {};

export function DashboardStats({ refreshSignal }: { refreshSignal: number }) {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const nowParts = useMemo(() => getJakartaDateParts(new Date()), []);

  // Filter state being edited in the form
  const [mode, setMode] = useState<"monthly" | "yearly">("monthly");
  const [year, setYear] = useState<number>(nowParts.year);
  const [month, setMonth] = useState<number>(nowParts.month);
  const [startDay, setStartDay] = useState<number>(1);
  const [endDay, setEndDay] = useState<number>(nowParts.day);

  // Applied data and fetch state
  const [stats, setStats] = useState<StatsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const initialFilter = useMemo<StatsFilterInput>(
    () => ({
      mode: "monthly",
      year: nowParts.year,
      month: nowParts.month,
      startDay: 1,
      endDay: nowParts.day,
    }),
    [nowParts.day, nowParts.month, nowParts.year],
  );
  const appliedFilterRef = useRef<ReturnType<
    typeof createAppliedStatsFilter
  > | null>(null);
  if (appliedFilterRef.current === null) {
    appliedFilterRef.current = createAppliedStatsFilter(initialFilter);
  }
  const lastRefreshSignalRef = useRef(refreshSignal);
  const requestGuardRef = useRef<LatestRequestGuard | null>(null);
  if (requestGuardRef.current === null) {
    requestGuardRef.current = createLatestRequestGuard();
  }
  const successPercentage = calculateSuccessPercentage(
    stats?.totalResistance ?? 0,
    stats?.totalPicking ?? 0,
  );
  const successPercentageLevel = getSuccessPercentageLevel(successPercentage);
  const successRingGeometry = getSuccessRingGeometry(successPercentage);
  const successPercentageColorClass = {
    red: "text-rose-700",
    yellow: "text-amber-700",
    blue: "text-blue-700",
    green: "text-emerald-700",
  }[successPercentageLevel];

  const yearId = useId();
  const monthId = useId();
  const startDayId = useId();
  const endDayId = useId();

  // Available year options (e.g. from 2024 to current year)
  const availableYears = useMemo(() => {
    const list: number[] = [];
    const minYear = 2024;
    for (let y = nowParts.year; y >= minYear; y--) {
      list.push(y);
    }
    return list;
  }, [nowParts.year]);

  // Available months: if current year, limit to months up to nowParts.month
  const availableMonths = useMemo(() => {
    const maxMonth = year === nowParts.year ? nowParts.month : 12;
    return INDONESIAN_MONTHS_LONG.map((name, index) => ({
      index: index + 1,
      name,
    })).filter((m) => m.index <= maxMonth);
  }, [year, nowParts.year, nowParts.month]);

  // Helper to compute max selectable day for a given year & month
  const getMaxDay = useCallback(
    (targetYear: number, targetMonth: number) => {
      const days = getDaysInMonth(targetYear, targetMonth);
      if (targetYear === nowParts.year && targetMonth === nowParts.month) {
        return Math.min(days, nowParts.day);
      }
      return days;
    },
    [nowParts.year, nowParts.month, nowParts.day],
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

  // Inline validation for the form
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

  // Execute fetch for given filter
  const loadStats = useCallback(async (filterToFetch: StatsFilterInput) => {
    const requestId = requestGuardRef.current!.begin();
    setLoading(true);
    setError("");
    try {
      const result = await fetchDashboardStats(filterToFetch);
      if (!requestGuardRef.current!.isCurrent(requestId)) return;
      if (!result.success) {
        setError(result.error);
      } else {
        setStats(result.data);
        setError("");
      }
    } catch {
      if (requestGuardRef.current!.isCurrent(requestId)) {
        setError(
          "Gagal memuat statistik. Silakan periksa koneksi dan coba lagi.",
        );
      }
    } finally {
      if (requestGuardRef.current!.isCurrent(requestId)) {
        setLoading(false);
      }
    }
  }, []);

  // Initial load on mount
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void loadStats(initialFilter);
    });
    return () => {
      active = false;
      requestGuardRef.current?.invalidate();
    };
  }, [initialFilter, loadStats]);

  useEffect(() => {
    if (lastRefreshSignalRef.current === refreshSignal) return;
    lastRefreshSignalRef.current = refreshSignal;
    void loadStats(appliedFilterRef.current!.get());
  }, [loadStats, refreshSignal]);

  // Form submit handler
  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    if (validationError) return;

    if (mode === "monthly") {
      const appliedFilter: StatsFilterInput = {
        mode: "monthly",
        year,
        month,
        startDay,
        endDay,
      };
      appliedFilterRef.current!.apply(appliedFilter);
      void loadStats(appliedFilter);
    } else {
      const appliedFilter: StatsFilterInput = {
        mode: "yearly",
        year,
      };
      appliedFilterRef.current!.apply(appliedFilter);
      void loadStats(appliedFilter);
    }
  };

  return (
    <section className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900">
            Statistik Aktivitas
          </h2>
          <p className="text-xs text-neutral-500">
            {stats?.periodLabel
              ? `Periode: ${stats.periodLabel}`
              : "Pantau kemajuan menahan dorongan dan riwayat picking"}
          </p>
        </div>

        {/* Mode Selector */}
        <div
          role="group"
          aria-label="Mode periode"
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

      {/* Filter Form */}
      <form
        onSubmit={handleApply}
        className="rounded-xl border border-neutral-100 bg-neutral-50/60 p-4 space-y-4"
      >
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
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
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
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
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
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
              >
                {Array.from({ length: maxSelectableDay }, (_, i) => i + 1).map(
                  (d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ),
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
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
              >
                {Array.from({ length: maxSelectableDay }, (_, i) => i + 1).map(
                  (d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ),
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
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
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

        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-neutral-500">
            Perubahan filter akan diterapkan setelah menekan tombol Tampilkan.
          </p>
          <button
            type="submit"
            disabled={loading || Boolean(validationError)}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-teal-800 px-6 text-sm font-semibold text-white shadow-sm hover:bg-teal-900 disabled:opacity-50 transition"
          >
            {loading ? "Memuat..." : "Tampilkan"}
          </button>
        </div>
      </form>

      {/* Global Error Banner */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900 leading-relaxed"
        >
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="@container">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 @lg:grid-cols-3">
          <Link
            href="/resistance"
            aria-label="Buka riwayat keberhasilan menahan dorongan"
            className="order-1 rounded-xl border border-teal-200 bg-teal-50/50 p-4 transition hover:bg-teal-50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
          >
            {" "}
            <p className="text-xs font-semibold text-teal-800">
              Berhasil Menahan
            </p>
            <p className="mt-1 text-2xl font-bold text-teal-950 sm:text-3xl">
              {stats ? stats.totalResistance : 0}
            </p>
            <p className="mt-0.5 text-xs text-teal-700">
              kali dorongan ditahan
            </p>
          </Link>

          <Link
            href="/picking"
            aria-label="Buka riwayat picking"
            className="order-2 rounded-xl border border-rose-200 bg-rose-50/50 p-4 transition hover:bg-rose-50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700 focus-visible:ring-offset-2 @lg:order-3"
          >
            <p className="text-xs font-semibold text-rose-800">
              Kejadian Picking
            </p>
            <p className="mt-1 text-2xl font-bold text-rose-950 sm:text-3xl">
              {stats ? stats.totalPicking : 0}
            </p>
            <p className="mt-0.5 text-xs text-rose-700">kali picking dicatat</p>
          </Link>

          <div className="order-3 col-span-2 flex min-w-0 flex-col items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50/60 p-3 @lg:order-2 @lg:col-span-1">
            <p className="text-center text-xs font-semibold text-neutral-700">
              Persentase Keberhasilan
            </p>
            <div
              role="img"
              aria-label={`Persentase Keberhasilan ${Math.round(successPercentage)}%`}
              className={`relative flex size-24 shrink-0 items-center justify-center ${successPercentageColorClass}`}
            >
              <svg
                aria-hidden="true"
                className="absolute inset-0 size-full -rotate-90"
                viewBox="0 0 120 120"
              >
                <circle
                  className="fill-none stroke-neutral-200"
                  cx="60"
                  cy="60"
                  r="52"
                  strokeWidth="8"
                />
                <circle
                  className="fill-none stroke-current"
                  cx="60"
                  cy="60"
                  r="52"
                  strokeDasharray={successRingGeometry.strokeDasharray}
                  strokeDashoffset={successRingGeometry.strokeDashoffset}
                  strokeLinecap="butt"
                  strokeWidth="8"
                />
              </svg>
              <span className="relative text-2xl font-bold tabular-nums">
                {Math.round(successPercentage)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Empty State Message */}
      {stats && !stats.hasActivity && (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-center text-xs text-neutral-600">
          {stats.emptyMessage ?? "Belum ada aktivitas pada periode ini."}
        </div>
      )}

      {/* Line Chart */}
      <div className="h-64 w-full sm:h-72">
        {!mounted || !stats ? (
          <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50 text-xs text-neutral-400">
            Memuat grafik...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={stats.points}
              margin={{ top: 10, right: 10, left: -22, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#737373" }}
                minTickGap={16}
                interval="preserveStartEnd"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "#737373" }}
                domain={[0, (dataMax: number) => Math.max(dataMax, 3)]}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="top"
                height={36}
                formatter={(value) => (
                  <span className="text-xs font-medium text-neutral-700">
                    {value}
                  </span>
                )}
              />
              <Line
                type="monotone"
                dataKey="resistanceCount"
                name="Berhasil Menahan"
                stroke="#0f766e"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#0f766e" }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="pickingCount"
                name="Kejadian Picking"
                stroke="#e11d48"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#e11d48" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
