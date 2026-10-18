"use client";

import { useState } from "react";
import { ResistanceForm } from "@/components/resistance/resistance-form";

export function StandaloneResistanceButton() {
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div className="space-y-3">
      {!formOpen ? (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="flex min-h-12 w-full items-center justify-center rounded-xl border border-teal-800 px-5 font-semibold text-teal-900 hover:bg-teal-50"
        >
          Catat keberhasilan
        </button>
      ) : (
        <ResistanceForm
          mode="standalone"
          onCancel={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}
