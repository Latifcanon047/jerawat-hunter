import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getResistanceHistory } from "@/actions/resistance";
import { ResistanceHistoryList } from "@/components/resistance/resistance-history-list";
import { PrivateAppHeader } from "@/components/dashboard/private-app-header";

export const metadata: Metadata = {
  title: "Riwayat keberhasilan — Jerawat Hunter",
  description: "Riwayat keberhasilan menahan dorongan Anda.",
};

export default function ResistanceHistoryPage() {
  return (
    <main className="min-h-screen bg-[#f7f7f4] px-4 pb-10 pt-4 text-neutral-900 sm:px-6 sm:pt-6">
      <PrivateAppHeader />
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">
            Riwayat keberhasilan
          </h1>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Setiap usaha menahan dorongan tetap berarti dan tercatat.
          </p>
        </header>
        <section aria-live="polite">
          <Suspense fallback={<ResistanceHistoryLoading />}>
            <ResistanceHistory />
          </Suspense>
        </section>
      </div>
    </main>
  );
}

function ResistanceHistoryLoading() {
  return (
    <div
      role="status"
      className="rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-neutral-600 shadow-sm"
    >
      Memuat riwayat keberhasilan...
    </div>
  );
}

async function ResistanceHistory() {
  await connection();
  const result = await getResistanceHistory();

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

  if (result.data.records.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
        <h2 className="font-semibold">Belum ada catatan keberhasilan</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          Saat kamu mencatat keberhasilan menahan dorongan, catatannya akan
          muncul di sini.
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
    <ResistanceHistoryList
      initialRecords={result.data.records}
      initialTotalCount={result.data.totalCount}
      initialPage={result.data.page}
      initialPageSize={result.data.pageSize}
      initialTotalPages={result.data.totalPages}
    />
  );
}
