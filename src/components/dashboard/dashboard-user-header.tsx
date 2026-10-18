"use client";

import { useEffect, useState, useTransition } from "react";
import { logoutUser } from "@/actions/auth";
import { getUserDisplayName } from "@/lib/user-greeting";

export interface DashboardUserHeaderProps {
  user?: {
    name?: string | null;
    email?: string | null;
  } | null;
}

export function DashboardUserHeader({ user }: DashboardUserHeaderProps) {
  const displayName = getUserDisplayName(user);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Menutup dialog konfirmasi dengan tombol Escape
  useEffect(() => {
    if (!showConfirm) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) {
        setShowConfirm(false);
        setError(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showConfirm, isPending]);

  const handleCancel = () => {
    if (isPending) return;
    setShowConfirm(false);
    setError(null);
  };

  const handleConfirmLogout = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await logoutUser();
        if (result && !result.success) {
          setError(result.error);
        }
      } catch (err) {
        // NEXT_REDIRECT dilempar oleh runtime Next.js saat redirect server
        if (
          err instanceof Error &&
          (err.message === "NEXT_REDIRECT" ||
            (err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT"))
        ) {
          return;
        }
        setError("Gagal keluar dari akun. Silakan periksa koneksi dan coba lagi.");
      }
    });
  };

  return (
    <>
      <div className="mb-6 flex items-center justify-end gap-2.5 border-b border-neutral-200/80 pb-3">
        {displayName ? (
          <span
            className="min-w-0 max-w-[170px] truncate text-xs font-medium text-neutral-700 sm:max-w-xs sm:text-sm"
            title={displayName}
          >
            {displayName}
          </span>
        ) : null}

        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-800 focus:outline-none focus:ring-2 focus:ring-rose-600 focus:ring-offset-1"
          aria-label="Keluar dari akun"
        >
          <svg
            className="h-3.5 w-3.5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>Keluar</span>
        </button>
      </div>

      {showConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-dialog-title"
          aria-describedby="logout-dialog-description"
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) {
              handleCancel();
            }
          }}
        >
          <section className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <h2
              id="logout-dialog-title"
              className="text-lg font-semibold text-neutral-900"
            >
              Konfirmasi Keluar
            </h2>
            <p
              id="logout-dialog-description"
              className="text-sm leading-6 text-neutral-600"
            >
              Apakah kamu yakin ingin keluar dari akun ini?
            </p>

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-900"
              >
                {error}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                disabled={isPending}
                onClick={handleCancel}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-neutral-300 px-4 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleConfirmLogout}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-50 transition"
              >
                {isPending ? "Keluar..." : "Keluar"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
