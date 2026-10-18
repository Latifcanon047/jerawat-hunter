import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getPauseState } from "@/actions/pause";
import { PauseFlow } from "@/components/pause/pause-flow";

export const metadata: Metadata = {
  title: "Pause — Jerawat Hunter",
  description: "Ambil jeda sejenak saat dorongan picking muncul.",
};

export default function PausePage() {
  return (
    <main className="min-h-screen bg-[#f7f7f4] px-4 pb-10 pt-8 text-neutral-900 sm:px-6 sm:pt-12">
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-8">
          <p className="text-sm font-semibold tracking-wide text-teal-800">
            JERAWAT HUNTER
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Ambil jeda. Kamu tidak sendirian.
          </h1>
          <p className="mt-3 max-w-lg text-base leading-7 text-neutral-600">
            Saat dorongan menyentuh kulit muncul, beri dirimu sedikit waktu
            sebelum memutuskan langkah berikutnya.
          </p>
        </header>
        <Suspense fallback={<PauseLoading />}>
          <PauseContent />
        </Suspense>
      </div>
    </main>
  );
}

async function PauseContent() {
  await connection();
  const result = await getPauseState();
  return <PauseFlow initialResult={result} />;
}

function PauseLoading() {
  return (
    <div
      role="status"
      className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm"
    >
      Memuat status Pause...
    </div>
  );
}
