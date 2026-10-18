"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getPauseState, type PauseSessionData } from "@/actions/pause";
import { StandaloneResistanceButton } from "@/components/dashboard/standalone-resistance-button";
import { StandalonePickingButton } from "@/components/dashboard/standalone-picking-button";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { formatPauseStartedAt } from "@/lib/format-pause-started-at";
import {
  createLatestRequestGuard,
  type LatestRequestGuard,
} from "@/lib/latest-request";

export function DashboardHome({
  initialPickingFollowUps,
  stateError,
}: {
  initialPickingFollowUps: PauseSessionData[];
  stateError: string | null;
}) {
  const router = useRouter();
  const [pickingFollowUps, setPickingFollowUps] = useState(
    initialPickingFollowUps
  );
  const [showReminder, setShowReminder] = useState(
    initialPickingFollowUps.length > 0
  );
  const [error, setError] = useState(stateError ?? "");
  const [checking, setChecking] = useState(false);
  const [statusVerified, setStatusVerified] = useState(false);
  const requestGuardRef = useRef<LatestRequestGuard | null>(null);
  if (requestGuardRef.current === null) {
    requestGuardRef.current = createLatestRequestGuard();
  }

  const refreshPickingFollowUps = useCallback(async (showLoading = true) => {
    const requestId = requestGuardRef.current!.begin();
    if (showLoading) {
      setChecking(true);
      setError("");
    }
    setStatusVerified(false);
    try {
      const result = await getPauseState();
      if (!requestGuardRef.current!.isCurrent(requestId)) return;
      if (!result.success) {
        setError(result.error);
        setStatusVerified(false);
        return;
      }
      setPickingFollowUps(result.data.pickingFollowUps);
      setShowReminder(result.data.pickingFollowUps.length > 0);
      setError("");
      setStatusVerified(true);
    } catch {
      if (!requestGuardRef.current!.isCurrent(requestId)) return;
      setError(
        "Status catatan belum dapat diperiksa. Silakan coba muat ulang dashboard."
      );
      setStatusVerified(false);
    } finally {
      if (requestGuardRef.current!.isCurrent(requestId)) {
        setChecking(false);
      }
    }
  }, []);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshPickingFollowUps(false);
      }
    };

    queueMicrotask(() => {
      void refreshPickingFollowUps(false);
    });
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("pageshow", refreshWhenVisible);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("pageshow", refreshWhenVisible);
      requestGuardRef.current?.invalidate();
    };
  }, [refreshPickingFollowUps]);

  return (
    <div className="space-y-5">
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void refreshPickingFollowUps()}
            disabled={checking}
            className="mt-3 min-h-11 rounded-lg border border-rose-300 px-4 font-semibold disabled:opacity-60"
          >
            {checking ? "Memeriksa..." : "Coba periksa lagi"}
          </button>
        </div>
      )}

      <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-xl font-semibold">Apa yang kamu butuhkan?</h2>
        <Link
          href="/pause"
          className="flex min-h-14 w-full items-center justify-center rounded-xl bg-teal-800 px-5 text-base font-semibold text-white shadow-sm hover:bg-teal-900"
        >
          Mulai atau lanjutkan Pause
        </Link>
        <StandaloneResistanceButton />
        <StandalonePickingButton />
        <Link
          href="/picking"
          className="flex min-h-12 w-full items-center justify-center rounded-xl border border-neutral-300 px-5 font-semibold hover:bg-neutral-50"
        >
          Buka riwayat picking
        </Link>
        <Link
          href="/picking/analysis"
          className="flex min-h-12 w-full items-center justify-center rounded-xl border border-neutral-300 px-5 font-semibold hover:bg-neutral-50"
        >
          Analisis Pola Picking
        </Link>
        <Link
          href="/resistance"
          className="flex min-h-12 w-full items-center justify-center rounded-xl border border-neutral-300 px-5 font-semibold hover:bg-neutral-50"
        >
          Buka riwayat keberhasilan
        </Link>
      </section>

      <DashboardStats />

      {statusVerified && showReminder && pickingFollowUps[0] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="picking-reminder-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 p-4"
        >
          <section className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="picking-reminder-title" className="text-xl font-semibold">
              Catatan picking belum selesai
            </h2>
            <p className="text-sm leading-6 text-neutral-700">
              Catatan picking belum selesai. Silakan isi catatan terlebih
              dahulu agar riwayatmu tetap lengkap. Detail picking dari sesi{" "}
              {formatPauseStartedAt(pickingFollowUps[0].startedAt)} belum
              dicatat.
            </p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/picking/new?pauseSessionId=${encodeURIComponent(pickingFollowUps[0].id)}`
                  )
                }
                className="min-h-12 w-full rounded-xl bg-teal-800 px-5 font-semibold text-white hover:bg-teal-900"
              >
                Lanjutkan catatan picking
              </button>
              <button
                type="button"
                onClick={() => setShowReminder(false)}
                className="min-h-12 w-full rounded-xl border border-neutral-300 px-5 font-semibold hover:bg-neutral-50"
              >
                Tetap buka dashboard
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
