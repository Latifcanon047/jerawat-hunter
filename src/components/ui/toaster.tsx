"use client";

import { useEffect, useRef } from "react";

export type Toast = {
  id: number;
  kind: "success" | "error";
  message: string;
};

export function Toaster({
  toast,
  onDismiss,
}: {
  toast: Toast | null;
  onDismiss: (id: number) => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const popover = popoverRef.current;
    if (!popover || !toast) return;

    if (!popover.matches(":popover-open")) popover.showPopover();
    const timeout = window.setTimeout(() => onDismiss(toast.id), 4000);

    return () => {
      window.clearTimeout(timeout);
      if (popover.matches(":popover-open")) popover.hidePopover();
    };
  }, [onDismiss, toast]);

  return (
    <div
      ref={popoverRef}
      popover="manual"
      className="fixed inset-x-4 top-4 z-[100] m-0 w-[calc(100%-2rem)] max-w-lg border-0 bg-transparent p-0"
    >
      {toast && (
        <div
          role={toast.kind === "error" ? "alert" : "status"}
          aria-live={toast.kind === "error" ? "assertive" : "polite"}
          aria-atomic="true"
          className={`flex items-start justify-between gap-4 rounded-xl border p-4 text-sm shadow-lg ${
            toast.kind === "error"
              ? "border-rose-200 bg-rose-50 text-rose-950"
              : "border-emerald-200 bg-emerald-50 text-emerald-950"
          }`}
        >
          <p className="leading-6">{toast.message}</p>
          <button
            type="button"
            aria-label="Tutup notifikasi"
            onClick={() => onDismiss(toast.id)}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-xl leading-none hover:bg-black/5"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      )}
    </div>
  );
}
