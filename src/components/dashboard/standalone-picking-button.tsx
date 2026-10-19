"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PickingForm } from "@/components/picking/picking-form";
import { useToast } from "@/lib/toast-context";

export function StandalonePickingButton({
  onStatsRefresh,
}: {
  onStatsRefresh: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div className="space-y-3">
      {!formOpen ? (
        <button
          type="button"
          onClick={() => {
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
            showToast("success", "Catatan kegagalan berhasil disimpan.");
            onStatsRefresh();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
