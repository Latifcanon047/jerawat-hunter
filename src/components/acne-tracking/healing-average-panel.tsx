"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchHealingAverages } from "@/actions/healing-average";
import type { HealingAverageResult } from "@/lib/healing-average-service";
import {
  createLatestRequestGuard,
  type LatestRequestGuard,
} from "@/lib/latest-request";
import { INDONESIAN_MONTHS_LONG } from "@/lib/stats-service";
import { getJakartaDateParts } from "@/lib/validations/stats";

const MIN_YEAR = 2024;

type LocationOption = { value: string; label: string };

type AppliedFilter = {
  mode: "monthly" | "yearly";
  year: number;
  month: number;
  location: string;
};

function formatDays(value: number | null): string {
  if (value === null) return "-";
  return String(value).replace(".", ",");
}

export function HealingAveragePanel({
  locations,
  refreshSignal,
}: {
  locations: LocationOption[];
  refreshSignal: number;
}) {
  const nowParts = useMemo(() => getJakartaDateParts(new Date()), []);
  const locationOptions = useMemo(
    () => [{ value: "all", label: "Semua lokasi" }, ...locations],
    [locations],
  );
  const initialFilter = useMemo<AppliedFilter>(
    () => ({
      mode: "monthly",
      year: nowParts.year,
      month: nowParts.month,
      location: "all",
    }),
    [nowParts.year, nowParts.month],
  );

  const [mode, setMode] = useState<"monthly" | "yearly">("monthly");
  const [year, setYear] = useState<number>(nowParts.year);
  const [month, setMonth] = useState<number>(nowParts.month);
  const [location, setLocation] = useState("all");
  const [applied, setApplied] = useState<AppliedFilter>(initialFilter);
  const [data, setData] = useState<HealingAverageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const yearId = useId();
  const monthId = useId();
  const locationId = useId();

  const requestGuardRef = useRef<LatestRequestGuard | null>(null);
  if (requestGuardRef.current === null) {
    requestGuardRef.current = createLatestRequestGuard();
  }

  const load = useCallback(async (submitted: AppliedFilter) => {
    const requestId = requestGuardRef.current!.begin();
    setLoading(true);
    setError("");
    try {
      const result = await fetchHealingAverages({
        location: submitted.location,
      });
      if (!requestGuardRef.current!.isCurrent(requestId)) return;
      if (!result.success) {
        setError(result.error);
      } else {
        setData(result.data);
        setApplied(submitted);
      }
    } catch {
      if (requestGuardRef.current!.isCurrent(requestId)) {
        setError(
          "Gagal memuat rata-rata sembuh. Silakan periksa koneksi dan coba lagi.",
        );
      }
    } finally {
      if (requestGuardRef.current!.isCurrent(requestId)) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void load(initialFilter);
    });
    return () => {
      active = false;
      requestGuardRef.current?.invalidate();
    };
  }, [load, initialFilter]);

  const lastRefreshSignalRef = useRef(refreshSignal);
  useEffect(() => {
    if (lastRefreshSignalRef.current === refreshSignal) return;
    lastRefreshSignalRef.current = refreshSignal;
    void load(applied);
  }, [refreshSignal, applied, load]);

  const availableYears = useMemo(() => {
    const list: number[] = [];
    for (let y = nowParts.year; y >= MIN_YEAR; y--) list.push(y);
    return list;
  }, [nowParts.year]);

  const availableMonths = useMemo(() => {
    const maxMonth = year === nowParts.year ? nowParts.month : 12;
    return INDONESIAN_MONTHS_LONG.map((name, index) => ({
      index: index + 1,
      name,
    })).filter((m) => m.index <= maxMonth);
  }, [year, nowParts.year, nowParts.month]);

  const handleYearChange = (newYear: number) => {
    setYear(newYear);
    const maxMonth = newYear === nowParts.year ? nowParts.month : 12;
    if (month > maxMonth) setMonth(maxMonth);
  };

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    void load({ mode, year, month, location });
  };

  const rows = data
    ? applied.mode === "monthly"
      ? data.monthly
      : data.yearly
    : [];
  const selectedKey =
    applied.mode === "monthly"
      ? `${applied.year}-${String(applied.month).padStart(2, "0")}`
      : String(applied.year);
  const selectedRow = rows.find((row) => row.key === selectedKey) ?? null;
  const selectedLabel =
    applied.mode === "monthly"
      ? `${INDONESIAN_MONTHS_LONG[applied.month - 1]} ${applied.year}`
      : `Tahun ${applied.year}`;
  const selectedLocationLabel =
    locationOptions.find((item) => item.value === applied.location)?.label ??
    "";

  const selectClass =
    "w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-teal-700 focus:outline-none focus:ring-1 focus:ring-teal-700";

  return (
    <section
      aria-label="Rata-rata sembuh"
      className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div>
        <h2 className="text-lg font-semibold">Rata-rata sembuh</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Lama jerawat sembuh, dihitung dari catatan yang sudah sembuh.
        </p>
      </div>

      <form onSubmit={handleApply} className="space-y-3">
        <div
          role="group"
          aria-label="Mode periode"
          className="inline-flex rounded-xl bg-neutral-100 p-1"
        >
          {(["monthly", "yearly"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                mode === value
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              {value === "monthly" ? "Bulanan" : "Tahunan"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
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
              className={selectClass}
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          {mode === "monthly" && (
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
                onChange={(e) => setMonth(Number(e.target.value))}
                className={selectClass}
              >
                {availableMonths.map((m) => (
                  <option key={m.index} value={m.index}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div>
          <label
            htmlFor={locationId}
            className="mb-1 block text-xs font-medium text-neutral-700"
          >
            Lokasi
          </label>
          <select
            id={locationId}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={selectClass}
          >
            {locationOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-neutral-500">
            Diterapkan setelah menekan Tampilkan.
          </p>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-teal-800 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900 disabled:opacity-50"
          >
            {loading ? "Memuat..." : "Tampilkan"}
          </button>
        </div>
      </form>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-900"
        >
          {error}
        </div>
      )}

      {data ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-600">
            {selectedLabel} · {selectedLocationLabel}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4">
              <p className="text-xs font-semibold text-teal-800">
                Rata-rata Sembuh
              </p>
              <p className="mt-1 text-2xl font-bold text-teal-950 sm:text-3xl">
                {formatDays(selectedRow?.averageDays ?? null)}
              </p>
              <p className="mt-0.5 text-xs text-teal-700">hari</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <p className="text-xs font-semibold text-neutral-700">
                Jumlah Sembuh
              </p>
              <p className="mt-1 text-2xl font-bold text-neutral-900 sm:text-3xl">
                {selectedRow?.healedCount ?? 0}
              </p>
              <p className="mt-0.5 text-xs text-neutral-500">catatan</p>
            </div>
          </div>
        </div>
      ) : (
        loading && (
          <p role="status" className="text-sm text-neutral-600">
            Memuat rata-rata sembuh...
          </p>
        )
      )}
    </section>
  );
}
