import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getDefaultPickingAnalysis } from "@/actions/picking-analysis";
import { PickingAnalysisView } from "@/components/picking-analysis/picking-analysis-view";
import { PrivateAppHeader } from "@/components/dashboard/private-app-header";

export const metadata: Metadata = {
  title: "Analisis Pola Picking — Jerawat Hunter",
  description: "Pahami pola, pemicu, dan konteks kejadian picking Anda.",
};

export default function PickingAnalysisPage() {
  return (
    <main className="min-h-screen bg-[#f7f7f4] px-4 pb-10 pt-4 text-neutral-900 sm:px-6 sm:pt-6">
      <PrivateAppHeader />
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">
            Analisis Pola Picking
          </h1>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Pahami pola, pemicu, dan konteks kejadian picking Anda untuk
            membantu mengidentifikasi dorongan dengan lebih sadar.
          </p>
        </header>
        <section aria-live="polite">
          <Suspense fallback={<PickingAnalysisLoading />}>
            <PickingAnalysisContent />
          </Suspense>
        </section>
      </div>
    </main>
  );
}

function PickingAnalysisLoading() {
  return (
    <div
      role="status"
      className="rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-neutral-600 shadow-sm"
    >
      Memuat analisis pola picking...
    </div>
  );
}

async function PickingAnalysisContent() {
  await connection();
  const initialResult = await getDefaultPickingAnalysis();

  return (
    <PickingAnalysisView
      initialData={initialResult.success ? initialResult.data : null}
      initialError={initialResult.success ? null : initialResult.error}
    />
  );
}
