import type { Metadata } from "next";
import { PrivateAppHeader } from "@/components/dashboard/private-app-header";
import { AcneTrackingPage } from "@/components/acne-tracking/acne-tracking-page";

export const metadata: Metadata = {
  title: "Pemantauan Jerawat — Jerawat Hunter",
  description: "Pantau perkembangan jerawat dan koreng dengan tenang.",
};

export default function AcneTrackingRoute() {
  return (
    <main className="min-h-screen bg-[#f7f7f4] px-4 pb-10 pt-4 text-neutral-900 sm:px-6 sm:pt-6">
      <PrivateAppHeader />
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8">
          <p className="text-sm font-semibold tracking-wide text-teal-800">
            PEMANTAUAN
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Pemantauan Jerawat
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-neutral-600">
            Catat perkembangan jerawat atau koreng satu per satu, tanpa
            menghakimi proses pemulihanmu.
          </p>
        </header>
        <AcneTrackingPage />
      </div>
    </main>
  );
}
