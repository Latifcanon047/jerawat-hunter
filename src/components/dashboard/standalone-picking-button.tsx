"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PickingForm } from "@/components/picking/picking-form";

export function StandalonePickingButton() {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;

    const timeout = window.setTimeout(() => setSaved(false), 4000);
    return () => window.clearTimeout(timeout);
  }, [saved]);

  return (
    <div className="space-y-3">
      {saved && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-950"
        >
          Catatan kegagalan berhasil disimpan.
        </p>
      )}
      {!formOpen ? (
        <button
          type="button"
          onClick={() => {
            setSaved(false);
            setFormOpen(true);
          }}
          className="flex min-h-12 w-full items-center justify-center rounded-xl border border-rose-300 px-5 font-semibold text-rose-900 hover:bg-rose-50"
        >
          Catat Kegagalan
        </button>
      ) : (
        <PickingForm
          mode="create"
          source="manual"
          onCancel={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            setSaved(true);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
