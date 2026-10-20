"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getPauseState, type PauseSessionData } from "@/actions/pause";
import { PickingForm } from "@/components/picking/picking-form";
import { formatPauseStartedAt } from "@/lib/format-pause-started-at";
import {
  createLatestRequestGuard,
  type LatestRequestGuard,
} from "@/lib/latest-request";

export function PickingCreateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pauseSessionId = searchParams.get("pauseSessionId");
  const [lookup, setLookup] = useState<{
    sessionId: string;
    followUp: PauseSessionData | null;
    error: string;
  } | null>(null);
  const requestGuardRef = useRef<LatestRequestGuard | null>(null);
  if (requestGuardRef.current === null) {
    requestGuardRef.current = createLatestRequestGuard();
  }

  useEffect(() => {
    async function loadFollowUp() {
      if (!pauseSessionId) return;
      const requestId = requestGuardRef.current!.begin();
      try {
        const result = await getPauseState("picking-follow-up");
        if (!requestGuardRef.current!.isCurrent(requestId)) return;
        if (!result.success) {
          setLookup((current) => ({
            sessionId: pauseSessionId,
            followUp:
              current?.sessionId === pauseSessionId
                ? current.followUp
                : null,
            error: result.error,
          }));
          return;
        }
        const ownedFollowUp = result.data.pickingFollowUps.find(
          (candidate) => candidate.id === pauseSessionId
        );
        if (!ownedFollowUp) {
          setLookup({
            sessionId: pauseSessionId,
            followUp: null,
            error: "Catatan picking ini tidak ditemukan atau sudah dilengkapi.",
          });
          return;
        }
        setLookup({
          sessionId: pauseSessionId,
          followUp: ownedFollowUp,
          error: "",
        });
      } catch {
        if (requestGuardRef.current!.isCurrent(requestId)) {
          setLookup((current) => ({
            sessionId: pauseSessionId,
            followUp:
              current?.sessionId === pauseSessionId
                ? current.followUp
                : null,
            error: "Status sesi belum dapat dimuat. Silakan coba lagi.",
          }));
        }
      }
    }

    const refreshWhenActive = () => {
      if (document.visibilityState === "visible") {
        void loadFollowUp();
      }
    };

    queueMicrotask(() => {
      void loadFollowUp();
    });
    document.addEventListener("visibilitychange", refreshWhenActive);
    window.addEventListener("pageshow", refreshWhenActive);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenActive);
      window.removeEventListener("pageshow", refreshWhenActive);
      requestGuardRef.current?.invalidate();
    };
  }, [pauseSessionId]);

  const currentLookup =
    lookup?.sessionId === pauseSessionId ? lookup : null;

  if (pauseSessionId && !currentLookup) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-neutral-600 shadow-sm"
      >
        Memuat sesi Pause...
      </div>
    );
  }

  if (!pauseSessionId || !currentLookup?.followUp) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm leading-6 text-rose-900"
      >
        {currentLookup?.error ||
          "Sesi Pause untuk catatan ini tidak ditemukan. Kembali ke dashboard dan lanjutkan dari tindak lanjut sesi yang sesuai."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {currentLookup.error && (
        <p
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"
        >
          Status sesi belum dapat diverifikasi. Form tetap tersedia; server akan
          memvalidasi sesi saat disimpan. {currentLookup.error}
        </p>
      )}
      <p className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm leading-6 text-teal-950">
        Lengkapi catatan picking dari sesi Pause tanggal{" "}
        {formatPauseStartedAt(currentLookup.followUp.startedAt)}.
      </p>
      <PickingForm
        mode="create"
        source="pause"
        pauseSessionId={pauseSessionId}
        onCancel={() => router.push("/")}
      />
    </div>
  );
}
