"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  endPauseEarly,
  getPauseState,
  savePauseOutcome,
  startPauseSession,
  type PauseSessionData,
} from "@/actions/pause";
import {
  getPauseDeadlineMs,
  getPauseRemainingSeconds,
  shouldSyncPauseDeadline,
} from "@/lib/pause-clock";
import { formatPauseStartedAt } from "@/lib/format-pause-started-at";
import {
  createLatestRequestGuard,
  type LatestRequestGuard,
} from "@/lib/latest-request";
import {
  getVisibleCompletedPauseResult,
  shouldClearCompletedPauseResultOnEntry,
  shouldClearCompletedPickingResult,
} from "@/lib/pause-ui-state";
import {
  createPauseStartRequest,
  type PauseStartRequest,
} from "@/lib/pause-start-request";
import {
  PAUSE_REMINDER_AUDIOS,
} from "@/lib/pause-reminder-preferences";
import {
  detectPauseNotificationPlatform,
  getPauseNotificationSettingsGuide,
} from "@/lib/pause-notification-permission";
import { usePauseReminder } from "@/components/pause/pause-reminder-provider";
import { ResistanceForm } from "@/components/resistance/resistance-form";

type PauseStateData = {
  session: PauseSessionData | null;
  pickingFollowUps: PauseSessionData[];
};

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

type InitialResult = ActionResult<PauseStateData>;
type Outcome = "SUCCEEDED" | "STILL_RESISTING" | "PICKED";
type CompletedOutcome = {
  session: PauseSessionData;
  outcome: Outcome;
  needsPickingDetails: boolean;
};
const presets = [
  { label: "30 detik", seconds: 30 },
  { label: "1 menit", seconds: 60 },
  { label: "3 menit", seconds: 180 },
  { label: "5 menit", seconds: 300 },
] as const;

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} detik`;
  if (seconds === 0) return `${minutes} menit`;
  return `${minutes} menit ${seconds} detik`;
}

function resultMessage(outcome: Outcome): string {
  switch (outcome) {
    case "SUCCEEDED":
      return "Kamu berhasil melewati dorongan ini. Usahamu sudah tersimpan.";
    case "STILL_RESISTING":
      return "Tidak apa-apa jika dorongannya masih ada. Kamu bisa mengambil jeda lagi atau berhenti di sini.";
    case "PICKED":
      return "Terima kasih sudah mencatat apa yang terjadi. Kamu bisa menambahkan detail kejadian ini.";
  }
}

function Notice({
  children,
  kind = "info",
}: {
  children: React.ReactNode;
  kind?: "info" | "error" | "success";
}) {
  const colors = {
    info: "border-teal-200 bg-teal-50 text-teal-950",
    error: "border-rose-200 bg-rose-50 text-rose-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  }[kind];

  return (
    <div role={kind === "error" ? "alert" : "status"} className={`rounded-xl border p-4 text-sm leading-6 ${colors}`}>
      {children}
    </div>
  );
}

export function PauseFlow({ initialResult }: { initialResult: InitialResult }) {
  const router = useRouter();
  const pauseReminder = usePauseReminder();
  const {
    preferences: reminderPreferences,
    preferencesReady: reminderPreferencesReady,
    storageAvailable: reminderStorageAvailable,
    notificationPermission,
    audioStatus,
    notificationStatus,
    monitorError,
    reminderSessionId,
    setSession: setReminderSession,
    savePreferences: saveReminderPreferences,
    requestNotificationPermission,
    playManualAudio,
  } = pauseReminder;
  const notificationPlatform =
    typeof navigator === "undefined"
      ? "other"
      : detectPauseNotificationPlatform(
          navigator.userAgent,
          navigator.platform,
          navigator.maxTouchPoints
        );
  const [pauseState, setPauseState] = useState<PauseStateData | null>(
    initialResult.success ? initialResult.data : null
  );
  const [pageError, setPageError] = useState(
    initialResult.success ? "" : initialResult.error
  );
  const [pauseStateVerified, setPauseStateVerified] = useState(
    initialResult.success
  );
  const [selectedDuration, setSelectedDuration] = useState<number | null>(60);
  const [customDuration, setCustomDuration] = useState("");
  const [session, setSession] = useState<PauseSessionData | null>(
    initialResult.success ? initialResult.data.session : null
  );
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(() => {
    const initialSession = initialResult.success
      ? initialResult.data.session
      : null;
    return initialSession && !initialSession.endedAt
      ? getPauseRemainingSeconds(
          initialSession.startedAt,
          initialSession.durationSecs
        )
      : 0;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [failedStartDuration, setFailedStartDuration] = useState<number | null>(
    null
  );
  const [completed, setCompleted] = useState<CompletedOutcome | null>(null);
  const [resistanceFormSessionId, setResistanceFormSessionId] = useState<
    string | null
  >(null);
  const pendingRef = useRef(false);
  const sessionRef = useRef(session);
  const refreshGuardRef = useRef<LatestRequestGuard | null>(null);
  if (refreshGuardRef.current === null) {
    refreshGuardRef.current = createLatestRequestGuard();
  }
  const deadlineSyncRef = useRef<string | null>(null);
  const deadlineSyncInFlightRef = useRef<string | null>(null);
  const startRequestRef = useRef<PauseStartRequest | null>(null);
  const pauseEntryNeedsReconciliationRef = useRef(false);

  const updateSession = useCallback((nextSession: PauseSessionData | null) => {
    const previousSession = sessionRef.current;
    if (
      !nextSession ||
      nextSession.endedAt ||
      previousSession?.id !== nextSession.id
    ) {
      deadlineSyncRef.current = null;
    }
    sessionRef.current = nextSession;
    setSession(nextSession);
    setReminderSession(nextSession);
    setRemainingSeconds(
      nextSession && !nextSession.endedAt
        ? getPauseRemainingSeconds(
            nextSession.startedAt,
            nextSession.durationSecs
          )
        : 0
    );
  }, [setReminderSession]);

  const runBusyAction = useCallback(async <T,>(
    action: () => Promise<T>,
    onSuccess: (result: T) => void
  ) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await action();
      onSuccess(result);
    } catch {
      setError("Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.");
    } finally {
      pendingRef.current = false;
      setBusy(false);
    }
  }, []);

  const refreshPauseState = useCallback(async () => {
    const requestId = refreshGuardRef.current!.begin();
    setPauseStateVerified(false);
    try {
      const result = await getPauseState();
      if (!refreshGuardRef.current!.isCurrent(requestId)) return;
      if (!result.success) {
        setPageError(result.error);
        return;
      }

      setPageError("");
      setPauseState(result.data);
      setPauseStateVerified(true);
      const pauseEntry = pauseEntryNeedsReconciliationRef.current;
      pauseEntryNeedsReconciliationRef.current = false;
      if (!pendingRef.current && startRequestRef.current) {
        startRequestRef.current = null;
        setFailedStartDuration(null);
        setError("");
      }
      setCompleted((current) => {
        if (
          pauseEntry &&
          shouldClearCompletedPauseResultOnEntry(current, result.data)
        ) {
          return null;
        }
        return shouldClearCompletedPickingResult(current, result.data)
          ? null
          : current;
      });
      const currentSession = sessionRef.current;
      const serverSession = result.data.session;
      const sessionIsUnchanged =
        currentSession?.id === serverSession?.id &&
        currentSession?.durationSecs === serverSession?.durationSecs &&
        currentSession?.startedAt === serverSession?.startedAt &&
        currentSession?.endedAt === serverSession?.endedAt &&
        currentSession?.endedEarly === serverSession?.endedEarly &&
        currentSession?.outcome === serverSession?.outcome;
      if (!sessionIsUnchanged) updateSession(serverSession);
    } catch {
      if (refreshGuardRef.current!.isCurrent(requestId)) {
        setPauseStateVerified(false);
        setPageError(
          "Status Pause belum dapat diperbarui. Silakan coba muat ulang status."
        );
      }
    }
  }, [updateSession]);

  useEffect(() => {
    const refreshWhenActive = () => {
      if (document.visibilityState === "visible") {
        void refreshPauseState();
      }
    };

    pauseEntryNeedsReconciliationRef.current = true;
    queueMicrotask(() => {
      void refreshPauseState();
    });
    document.addEventListener("visibilitychange", refreshWhenActive);
    window.addEventListener("pageshow", refreshWhenActive);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenActive);
      window.removeEventListener("pageshow", refreshWhenActive);
      setPauseStateVerified(false);
      refreshGuardRef.current?.invalidate();
    };
  }, [refreshPauseState]);

  const syncDeadline = useCallback(
    (expectedSession: PauseSessionData, retry = false) => {
      const activeSession = sessionRef.current;
      const deadlineMs = getPauseDeadlineMs(
        expectedSession.startedAt,
        expectedSession.durationSecs
      );
      if (deadlineMs === null) {
        setRemainingSeconds(null);
        setError("Waktu sesi tidak dapat diverifikasi. Muat ulang status sebelum melanjutkan.");
        return;
      }
      if (
        !shouldSyncPauseDeadline(expectedSession, activeSession) ||
        pendingRef.current
      ) {
        return;
      }

      const requestKey = `${expectedSession.id}:${deadlineMs}`;
      if (deadlineSyncInFlightRef.current === requestKey) return;
      if (!retry && deadlineSyncRef.current === requestKey) return;
      if (pendingRef.current) return;
      deadlineSyncRef.current = requestKey;
      deadlineSyncInFlightRef.current = requestKey;
      void runBusyAction(
        () => endPauseEarly({ sessionId: expectedSession.id }),
        (result) => {
          if (!result.success) {
            setError(result.error);
            return;
          }
          refreshGuardRef.current?.invalidate();
          if (!result.data.session.endedAt) {
            setError("Sesi belum tersinkron. Silakan coba lagi.");
            return;
          }
          setPauseStateVerified(true);
          updateSession(result.data.session);
        }
      ).finally(() => {
        if (deadlineSyncInFlightRef.current === requestKey) {
          deadlineSyncInFlightRef.current = null;
        }
      });
    },
    [runBusyAction, updateSession]
  );

  useEffect(() => {
    if (!session || session.endedAt) return;

    if (getPauseDeadlineMs(session.startedAt, session.durationSecs) === null)
      return;

    const updateRemaining = () => {
      const remaining = getPauseRemainingSeconds(
        session.startedAt,
        session.durationSecs
      );
      setRemainingSeconds(remaining);
      if (remaining === null) return;
      if (remaining === 0) syncDeadline(session);
    };

    updateRemaining();
    const interval = window.setInterval(updateRemaining, 1000);
    document.addEventListener("visibilitychange", updateRemaining);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", updateRemaining);
    };
  }, [session, syncDeadline]);

  async function beginPause(durationSecs: number, retry = false) {
    const request = createPauseStartRequest(
      durationSecs,
      retry,
      startRequestRef.current,
      () => crypto.randomUUID()
    );
    startRequestRef.current = request;
    setFailedStartDuration(durationSecs);
    if (!retry) setCompleted(null);

    await runBusyAction(
      () => startPauseSession(request),
      (result) => {
        if (!result.success) {
          setError(result.error);
          if (result.code !== "INTERNAL_ERROR") {
            startRequestRef.current = null;
            setFailedStartDuration(null);
          }
          if (result.code === "SESSION_CONFLICT") {
            void refreshPauseState();
          }
          return;
        }
        refreshGuardRef.current?.invalidate();
        startRequestRef.current = null;
        setFailedStartDuration(null);
        setPageError("");
        setPauseStateVerified(true);
        setCompleted(null);
        if (result.data.session.outcome !== null) {
          setError("Status sesi berubah. Status Pause sedang diperbarui.");
          void refreshPauseState();
          return;
        }
        setPauseState((previous) => ({
          session: result.data.session,
          pickingFollowUps: previous?.pickingFollowUps ?? [],
        }));
        updateSession(result.data.session);
      }
    );
  }

  async function finishSession(outcome: Outcome) {
    if (!session) return;
    if (outcome === "SUCCEEDED") {
      if (!session.endedAt) {
        setError("Sesi belum terkonfirmasi selesai. Silakan coba lagi.");
        return;
      }
      setResistanceFormSessionId(session.id);
      setError("");
      return;
    }

    await runBusyAction(
      () => savePauseOutcome({ sessionId: session.id, outcome }),
      (result) => {
        if (!result.success) {
          setError(result.error);
          return;
        }
        refreshGuardRef.current?.invalidate();
        if (result.data.session.outcome !== outcome) {
          setError("Hasil sesi belum terkonfirmasi oleh server. Silakan coba lagi.");
          return;
        }
        setPauseStateVerified(true);
        const finished = {
          session: result.data.session,
          outcome,
          needsPickingDetails: result.data.needsPickingDetails,
        };
        setCompleted(finished);
        updateSession(null);
        setPauseState((previous) =>
          previous
            ? { ...previous, session: null }
            : { session: null, pickingFollowUps: [] }
        );
        if (outcome === "PICKED" && result.data.needsPickingDetails) {
          setPauseState((previous) => ({
            session: null,
            pickingFollowUps: [
              ...(previous?.pickingFollowUps ?? []).filter(
                (item) => item.id !== finished.session.id
              ),
              finished.session,
            ],
          }));
        }
      }
    );
  }

  function endEarly() {
    if (!session || !window.confirm("Akhiri Pause sekarang? Kamu bisa memilih hasil setelahnya.")) {
      return;
    }

    void runBusyAction(
      () => endPauseEarly({ sessionId: session.id }),
      (result) => {
        if (!result.success) {
          setError(result.error);
          return;
        }
        refreshGuardRef.current?.invalidate();
        if (!result.data.session.endedAt) {
          setError("Sesi belum terkonfirmasi selesai. Silakan coba lagi.");
          return;
        }
        setPauseStateVerified(true);
        updateSession(result.data.session);
      }
    );
  }

  function chooseDuration(seconds: number) {
    setSelectedDuration(seconds);
    setCustomDuration("");
    setError("");
  }

  function goToStart() {
    setCompleted(null);
    updateSession(null);
    setSelectedDuration(60);
    setError("");
  }

  const durationToStart =
    customDuration.trim() === ""
      ? selectedDuration
      : Number(customDuration);
  const sessionIsReadyForOutcome =
    session?.endedAt !== null && session?.endedAt !== undefined;
  const visibleCompleted = getVisibleCompletedPauseResult(
    pauseStateVerified,
    session,
    completed
  );
  const selectedReminderAudio =
    PAUSE_REMINDER_AUDIOS.find(
      (audio) => audio.id === reminderPreferences.selectedAudio
    ) ?? PAUSE_REMINDER_AUDIOS[0];
  return (
    <div className="space-y-5">
      {pageError && (
        <Notice kind="error">
          <p>{pageError}</p>
          <button
            type="button"
            onClick={() => void refreshPauseState()}
            disabled={busy}
            className="mt-3 min-h-11 rounded-lg border border-rose-300 px-4 font-semibold disabled:opacity-60"
          >
            {busy ? "Memuat..." : "Muat ulang status"}
          </button>
        </Notice>
      )}

      {error && (
        <Notice kind="error">
          <p>{error}</p>
          {session && !session.endedAt && remainingSeconds === 0 && (
            <button
              type="button"
              onClick={() => syncDeadline(session, true)}
              disabled={busy}
              className="mt-3 min-h-11 rounded-lg border border-rose-300 px-4 font-semibold disabled:opacity-60"
            >
              Coba sinkronkan lagi
            </button>
          )}
          {failedStartDuration !== null && (
            <button
              type="button"
              onClick={() => void beginPause(failedStartDuration, true)}
              disabled={busy}
              className="mt-3 min-h-11 rounded-lg border border-rose-300 px-4 font-semibold disabled:opacity-60"
            >
              Coba mulai lagi
            </button>
          )}
        </Notice>
      )}

      {visibleCompleted ? (
        <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7">
          <Notice kind="success">{resultMessage(visibleCompleted.outcome)}</Notice>
          {visibleCompleted.outcome === "PICKED" &&
            visibleCompleted.needsPickingDetails && (
              <div className="space-y-3">
                <Notice>
                  Hasil sesi tersimpan. Detail kejadian picking adalah catatan
                  terpisah dan belum tersimpan.
                </Notice>
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/picking/new?pauseSessionId=${encodeURIComponent(visibleCompleted.session.id)}`
                    )
                  }
                  className="min-h-12 w-full rounded-xl border border-teal-800 px-5 font-semibold text-teal-900 hover:bg-teal-50"
                >
                  Catat detail picking
                </button>
              </div>
            )}
          {visibleCompleted.outcome === "STILL_RESISTING" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={goToStart}
                className="min-h-12 rounded-xl bg-teal-800 px-5 font-semibold text-white hover:bg-teal-900"
              >
                Ambil jeda lagi
              </button>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="min-h-12 rounded-xl border border-neutral-300 px-5 font-semibold hover:bg-neutral-50"
              >
                Kembali ke beranda
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => router.push("/")}
              className="min-h-12 w-full rounded-xl bg-teal-800 px-5 font-semibold text-white hover:bg-teal-900"
            >
              Kembali ke beranda
            </button>
          )}
        </section>
      ) : session ? (
        <section className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7">
          <div>
            <p className="text-sm font-semibold text-teal-800">SESI PAUSE</p>
            <h2 className="mt-2 text-xl font-semibold">
              {sessionIsReadyForOutcome
                ? "Bagaimana keadaanmu sekarang?"
                : "Mari lewati dorongan ini bersama"}
            </h2>
          </div>

          {sessionIsReadyForOutcome &&
          resistanceFormSessionId === session.id ? (
            <ResistanceForm
              mode="pause"
              session={{
                id: session.id,
                startedAt: session.startedAt,
                endedAt: session.endedAt,
              }}
              onCancel={() => setResistanceFormSessionId(null)}
              onSaved={(savedSession) => {
                const finished = {
                  session: {
                    ...session,
                    outcome: savedSession.outcome,
                  },
                  outcome: savedSession.outcome,
                  needsPickingDetails: false,
                };
                refreshGuardRef.current?.invalidate();
                setResistanceFormSessionId(null);
                setCompleted(finished);
                updateSession(null);
                setPauseState((previous) =>
                  previous
                    ? { ...previous, session: null }
                    : { session: null, pickingFollowUps: [] }
                );
                setPauseStateVerified(true);
              }}
            />
          ) : sessionIsReadyForOutcome ? (
            <div className="space-y-3">
              <p className="text-sm leading-6 text-neutral-600">
                Sesi Pause dimulai pada{" "}
                {formatPauseStartedAt(session.startedAt)}.
              </p>
              <p className="text-sm leading-6 text-neutral-600">
                Pilih yang paling sesuai. Tidak ada jawaban yang salah.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => finishSession("SUCCEEDED")}
                className="min-h-12 w-full rounded-xl bg-teal-800 px-5 text-left font-semibold text-white hover:bg-teal-900 disabled:opacity-60"
              >
                Berhasil melewati dorongan
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => finishSession("STILL_RESISTING")}
                className="min-h-12 w-full rounded-xl border border-neutral-300 px-5 text-left font-semibold hover:bg-neutral-50 disabled:opacity-60"
              >
                Masih menahan diri
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => finishSession("PICKED")}
                className="min-h-12 w-full rounded-xl border border-neutral-300 px-5 text-left font-semibold hover:bg-neutral-50 disabled:opacity-60"
              >
                Akhirnya melakukan picking
              </button>
              {busy && (
                <p role="status" className="text-sm text-neutral-600">
                  Menyimpan hasil...
                </p>
              )}
            </div>
          ) : remainingSeconds === null ? (
            <Notice kind="error">
              Waktu sesi tidak dapat diverifikasi. Muat ulang status sebelum
              melanjutkan.
              <button
                type="button"
                onClick={() => void refreshPauseState()}
                disabled={busy}
                className="mt-3 min-h-11 rounded-lg border border-rose-300 px-4 font-semibold disabled:opacity-60"
              >
                {busy ? "Memuat..." : "Muat ulang status"}
              </button>
            </Notice>
          ) : remainingSeconds === 0 ? (
            <div className="space-y-3">
              <p role="status" className="text-sm text-neutral-600">
                {busy
                  ? "Menyinkronkan sesi dengan server..."
                  : "Menunggu konfirmasi server untuk membuka pilihan hasil."}
              </p>
              {!busy && error && (
                <button
                  type="button"
                  onClick={() => syncDeadline(session, true)}
                  className="min-h-11 rounded-xl border border-neutral-300 px-4 font-semibold"
                >
                  Coba lagi
                </button>
              )}
            </div>
          ) : !pauseStateVerified ? (
            <section
              role="status"
              className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm"
            >
              Memeriksa status Pause terbaru...
            </section>
          ) : (
            <>
              <p className="text-sm leading-6 text-neutral-600">
                Jauhkan tangan dari kulit jika bisa. Tarik napas perlahan,
                lalu hembuskan. Kamu tidak perlu memutuskan apa pun sekarang.
              </p>
              <div
                aria-label={`Sisa waktu ${formatTime(remainingSeconds)}`}
                className="py-3 text-center font-mono text-6xl font-semibold tabular-nums tracking-tight text-teal-900 sm:text-7xl"
              >
                {formatTime(remainingSeconds)}
              </div>
              <p className="text-center text-sm text-neutral-500">
                Durasi {formatDuration(session.durationSecs)}
              </p>
              <button
                type="button"
                onClick={endEarly}
                disabled={busy}
                className="min-h-12 w-full rounded-xl border border-neutral-300 px-5 font-semibold hover:bg-neutral-50 disabled:opacity-60"
              >
                {busy ? "Memproses..." : "Akhiri lebih awal"}
              </button>
            </>
          )}
        </section>
      ) : (
        <section className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7">
          <div>
            <p className="text-sm font-semibold text-teal-800">PAUSE</p>
            <h2 className="mt-2 text-xl font-semibold">
              Beri dirimu waktu sejenak
            </h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              Pilih durasi yang terasa pas. Kamu bisa mengakhiri sesi lebih
              awal kapan saja.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {presets.map((preset) => (
              <button
                key={preset.seconds}
                type="button"
                aria-pressed={selectedDuration === preset.seconds && !customDuration}
                onClick={() => chooseDuration(preset.seconds)}
                className={`min-h-12 rounded-xl border px-4 font-semibold ${
                  selectedDuration === preset.seconds && !customDuration
                    ? "border-teal-800 bg-teal-50 text-teal-950"
                    : "border-neutral-300 hover:bg-neutral-50"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <label
              htmlFor="custom-duration"
              className="block text-sm font-medium text-neutral-700"
            >
              Durasi khusus (detik, 30–600)
            </label>
            <input
              id="custom-duration"
              type="number"
              min={30}
              max={600}
              step={1}
              inputMode="numeric"
              value={customDuration}
              onChange={(event) => {
                setCustomDuration(event.target.value);
                setError("");
              }}
              placeholder="Contoh: 90"
              className="min-h-12 w-full rounded-xl border border-neutral-300 px-4 outline-none focus:border-teal-800 focus:ring-2 focus:ring-teal-800/20"
            />
          </div>

          <button
            type="button"
            disabled={
              busy ||
              failedStartDuration !== null ||
              durationToStart === null
            }
            onClick={() => {
              if (durationToStart !== null) void beginPause(durationToStart);
            }}
            className="min-h-14 w-full rounded-xl bg-teal-800 px-5 text-base font-semibold text-white shadow-sm hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Menyimpan sesi..." : "Mulai Pause"}
          </button>
          <p className="text-center text-xs leading-5 text-neutral-500">
            Timer dimulai setelah sesi berhasil disimpan.
          </p>
        </section>
      )}

      <section
        className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7"
        aria-labelledby="pause-reminder-title"
      >
        <div>
          <p className="text-sm font-semibold text-teal-800">PENGINGAT</p>
          <h2 id="pause-reminder-title" className="mt-2 text-xl font-semibold">
            Pengingat Pause
          </h2>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Pengingat dicoba saat waktu Pause tercapai selama halaman dan
            browser masih berjalan. Browser atau perangkat dapat membatasi
            audio maupun notifikasi.
          </p>
        </div>

        <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-neutral-800">
          <input
            type="checkbox"
            checked={reminderPreferences.audioEnabled}
            disabled={!reminderPreferencesReady}
            onChange={(event) => {
              saveReminderPreferences({
                ...reminderPreferences,
                audioEnabled: event.target.checked,
              });
            }}
            className="size-5 accent-teal-800"
          />
          Aktifkan suara pengingat
        </label>

        <div className="space-y-2">
          <label
            htmlFor="pause-reminder-audio"
            className="block text-sm font-medium text-neutral-700"
          >
            Pilih suara
          </label>
          <select
            id="pause-reminder-audio"
            value={reminderPreferences.selectedAudio}
            disabled={!reminderPreferencesReady || !reminderPreferences.audioEnabled}
            onChange={(event) => {
              const selected = PAUSE_REMINDER_AUDIOS.find(
                (audio) => audio.id === event.target.value
              );
              if (selected) {
                saveReminderPreferences({
                  ...reminderPreferences,
                  selectedAudio: selected.id,
                });
              }
            }}
            className="min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 outline-none focus:border-teal-800 focus:ring-2 focus:ring-teal-800/20 disabled:bg-neutral-100 disabled:text-neutral-500"
          >
            {PAUSE_REMINDER_AUDIOS.map((audio) => (
              <option key={audio.id} value={audio.id}>
                {audio.label}
              </option>
            ))}
          </select>
          <p className="text-xs leading-5 text-neutral-500">
            Audio: {selectedReminderAudio.creator} ·{" "}
            {selectedReminderAudio.sourceUrl ? (
              <a
                href={selectedReminderAudio.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                sumber
              </a>
            ) : (
              "sintesis orisinal"
            )}{" "}
            ·{" "}
            <a
              href={selectedReminderAudio.licenseUrl}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              CC0 1.0
            </a>
          </p>
        </div>

        {!reminderStorageAvailable && (
          <Notice kind="error">
            Penyimpanan browser tidak tersedia. Preferensi hanya berlaku
            sementara dan penanda pengingat tidak dapat disimpan lintas refresh.
          </Notice>
        )}
        {monitorError && <Notice kind="error">{monitorError}</Notice>}

        <div className="space-y-2">
          <p className="text-sm leading-6 text-neutral-700">
            {notificationPermission === "checking"
              ? "Memeriksa dukungan dan izin notifikasi..."
              : notificationPermission === "notification-unsupported"
                ? "Browser ini tidak menyediakan Notification API. Pengingat audio tetap dapat digunakan."
                : notificationPermission === "service-worker-unsupported"
                  ? "Browser ini tidak mendukung Service Worker yang diperlukan untuk notifikasi sistem. Pengingat audio tetap dapat digunakan."
                  : notificationPermission === "ios-unsupported"
                    ? "Notifikasi web di iPhone/iPad memerlukan web app Home Screen yang dikonfigurasi. Jerawat Hunter belum memiliki konfigurasi web app/manifest tersebut, jadi notifikasi belum tersedia di perangkat ini."
              : notificationPermission === "granted"
                  ? "Izin notifikasi telah diberikan. Pengaturan browser atau sistem operasi tetap dapat membatasi tampilnya notifikasi."
                  : notificationPermission === "denied"
                    ? "Izin notifikasi ditolak. Buka pengaturan izin situs di browser untuk mengaktifkannya."
                    : notificationPermission === "error"
                      ? "Status izin notifikasi tidak dapat dibaca."
                      : "Izin notifikasi belum diberikan."}
          </p>
          {notificationPermission === "default" && (
            <button
              type="button"
              onClick={() => void requestNotificationPermission()}
              className="min-h-11 rounded-xl border border-teal-800 px-4 font-semibold text-teal-900 hover:bg-teal-50"
            >
              Aktifkan notifikasi
            </button>
          )}
          {(notificationPermission === "denied" ||
            notificationPermission === "ios-unsupported") && (
              <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                <ol className="list-decimal space-y-1 pl-5">
                  {getPauseNotificationSettingsGuide(
                    notificationPlatform
                  ).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            )}
        </div>

        {notificationStatus !== "idle" && (
          <p role="status" className="text-sm leading-6 text-neutral-600">
            {notificationStatus === "shown"
              ? "Notifikasi telah diserahkan ke browser; tampil atau tidaknya bergantung pada pengaturan browser dan perangkat."
              : notificationStatus === "permission-required"
                ? "Notifikasi tidak dicoba karena izin belum diberikan."
                : notificationStatus === "denied"
                  ? "Notifikasi tidak dapat ditampilkan karena izin ditolak."
                  : notificationStatus === "unsupported"
                        ? "Notifikasi tidak dicoba karena salah satu API yang diperlukan tidak tersedia."
                    : notificationStatus === "already-processed"
                      ? "Pengingat untuk sesi ini sudah dicoba sebelumnya."
                      : notificationStatus === "failed"
                        ? "Notifikasi tidak dapat dibuat; percobaan audio tetap berjalan secara terpisah."
                        : null}
          </p>
        )}

        {reminderSessionId && audioStatus !== "idle" && (
          <div className="space-y-2">
            <p role="status" className="text-sm leading-6 text-neutral-600">
              {audioStatus === "playing"
                ? "Audio sedang diputar."
                : audioStatus === "failed"
                  ? "Audio otomatis tidak dapat dimulai. Kamu dapat mencoba memutarnya secara manual."
                  : audioStatus === "completed"
                    ? "Audio pengingat selesai diputar."
                    : audioStatus === "stopped"
                      ? "Audio dihentikan."
                      : "Audio pengingat dinonaktifkan."}
            </p>
            {audioStatus !== "playing" && (
              reminderPreferences.audioEnabled &&
              (audioStatus === "failed" ||
                audioStatus === "disabled" ||
                audioStatus === "stopped") && (
                <button
                  type="button"
                  onClick={playManualAudio}
                  className="min-h-11 rounded-xl border border-teal-800 px-4 font-semibold text-teal-900 hover:bg-teal-50"
                >
                  Putar suara
                </button>
              )
            )}
          </div>
        )}
      </section>

      {pauseStateVerified && pauseState?.pickingFollowUps.length ? (
        <section className="space-y-3" aria-labelledby="picking-follow-up-title">
          <h2
            id="picking-follow-up-title"
            className="text-sm font-semibold text-neutral-700"
          >
            Tindak lanjut yang belum selesai
          </h2>
          {pauseState.pickingFollowUps.map((followUp) => (
            <div
              key={followUp.id}
              className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
            >
              <p className="text-sm leading-6 text-neutral-700">
                Detail picking dari sesi{" "}
                {formatPauseStartedAt(followUp.startedAt)}{" "}
                belum dicatat.
              </p>
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/picking/new?pauseSessionId=${encodeURIComponent(followUp.id)}`
                  )
                }
                className="mt-3 min-h-11 rounded-xl border border-teal-800 px-4 font-semibold text-teal-900 hover:bg-teal-50"
              >
                Lanjutkan pencatatan
              </button>
            </div>
          ))}
        </section>
      ) : null}

      <nav aria-label="Navigasi utama" className="border-t border-neutral-200 pt-4">
        <Link
          href="/"
          className="mr-2 inline-flex min-h-11 items-center rounded-lg px-3 font-semibold text-teal-900 hover:bg-teal-50"
        >
          Dashboard
        </Link>
        <Link
          href="/picking"
          className="inline-flex min-h-11 items-center rounded-lg px-3 font-semibold text-teal-900 hover:bg-teal-50"
        >
          Riwayat picking
        </Link>
      </nav>
    </div>
  );
}
