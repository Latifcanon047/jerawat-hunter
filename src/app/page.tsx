import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { auth } from "@/auth";
import { getPauseState } from "@/actions/pause";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { DashboardUserHeader } from "@/components/dashboard/dashboard-user-header";

export const metadata: Metadata = {
  title: "Beranda — Jerawat Hunter",
  description: "Dukungan untuk melewati dorongan picking dengan lebih tenang.",
};

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f7f4] px-4 pb-10 pt-8 text-neutral-900 sm:px-6 sm:pt-12">
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-8">
          <Suspense fallback={<DashboardUserHeaderSkeleton />}>
            <DashboardUserHeaderSection />
          </Suspense>
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
        <Suspense fallback={<DashboardLoading />}>
          <DashboardContent />
        </Suspense>
        <footer className="mt-10 text-center text-xs leading-5 text-neutral-500">
          Setiap usaha berarti. Tidak ada penilaian di sini.
        </footer>
      </div>
    </main>
  );
}

async function DashboardUserHeaderSection() {
  const session = await auth();
  return <DashboardUserHeader user={session?.user} />;
}

function DashboardUserHeaderSkeleton() {
  return (
    <div
      className="mb-6 flex min-h-[34px] items-center justify-end gap-2.5 border-b border-neutral-200/80 pb-3"
      aria-hidden="true"
    />
  );
}

async function DashboardContent() {
  await connection();
  const result = await getPauseState();

  return (
    <DashboardHome
      initialPickingFollowUps={
        result.success ? result.data.pickingFollowUps : []
      }
      stateError={result.success ? null : result.error}
    />
  );
}

function DashboardLoading() {
  return (
    <div
      role="status"
      className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm"
    >
      Memuat dashboard...
    </div>
  );
}
