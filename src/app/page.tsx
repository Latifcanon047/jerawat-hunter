import type { Metadata } from "next";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { PrivateAppHeader } from "@/components/dashboard/private-app-header";

export const metadata: Metadata = {
  title: "Beranda — Jerawat Hunter",
  description: "Dukungan untuk melewati dorongan picking dengan lebih tenang.",
};

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f7f4] px-4 pb-10 pt-4 text-neutral-900 sm:px-6 sm:pt-6">
      <PrivateAppHeader />
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-8">
          <p className="text-sm font-semibold tracking-wide text-teal-800">
            DASHBOARD
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Ambil jeda. Kamu tidak sendirian.
          </h1>
          <p className="mt-3 max-w-lg text-base leading-7 text-neutral-600">
            Saat dorongan menyentuh kulit muncul, beri dirimu sedikit waktu
            sebelum memutuskan langkah berikutnya.
          </p>
        </header>
        <DashboardHome initialPickingFollowUps={[]} stateError={null} />
        <footer className="mt-10 text-center text-xs leading-5 text-neutral-500">
          Setiap usaha berarti. Tidak ada penilaian di sini.
        </footer>
      </div>
    </main>
  );
}
