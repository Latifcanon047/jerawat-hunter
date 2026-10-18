import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getPickingHistory } from "@/actions/picking";
import { PickingHistoryList } from "@/components/picking/picking-history-list";

export const metadata: Metadata = {
  title: "Riwayat picking — Jerawat Hunter",
  description: "Riwayat catatan picking pribadi Anda.",
};

export default function PickingHistoryPage() {
  return (
    <main className="min-h-screen bg-[#f7f7f4] px-4 pb-10 pt-8 text-neutral-900 sm:px-6 sm:pt-12">
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-8">
          <Link
            href="/"
            className="text-sm font-semibold text-teal-800 hover:underline"
          >
            ← Kembali ke beranda
          </Link>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight">
            Riwayat picking
          </h1>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Catatan ini hanya untuk membantu memahami pola, bukan untuk
            menghakimi diri sendiri.
          </p>
        </header>
        <section aria-live="polite">
          <Suspense fallback={<PickingHistoryLoading />}>
            <PickingHistory />
          </Suspense>
        </section>
      </div>
    </main>
  );
}

function PickingHistoryLoading() {
  return (
    <div
      role="status"
      className="rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-neutral-600 shadow-sm"
    >
      Memuat riwayat picking...
    </div>
  );
}

async function PickingHistory() {
  await connection();
  const result = await getPickingHistory();

  if (!result.success) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm leading-6 text-rose-900"
      >
        {result.error}
      </div>
    );
  }

  if (result.data.events.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
        <h2 className="font-semibold">Belum ada catatan</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          Saat kamu mencatat kejadian, riwayatnya akan muncul di sini.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-teal-800 px-5 font-semibold text-white hover:bg-teal-900"
        >
          Kembali ke beranda
        </Link>
      </div>
    );
  }

  return (
    <PickingHistoryList
      initialEvents={result.data.events}
      initialTotalCount={result.data.totalCount}
      initialPage={result.data.page}
      initialPageSize={result.data.pageSize}
      initialTotalPages={result.data.totalPages}
    />
  );
}
