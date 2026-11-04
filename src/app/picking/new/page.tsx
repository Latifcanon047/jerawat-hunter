import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PickingCreateForm } from "@/components/picking/picking-create-form";
import { PrivateAppHeader } from "@/components/dashboard/private-app-header";

export const metadata: Metadata = {
  title: "Catat picking — Jerawat Hunter",
  description: "Catat detail kejadian picking Anda.",
};

export default function NewPickingPage() {
  return (
    <main className="min-h-screen bg-[#f7f7f4] px-4 pb-10 pt-8 text-neutral-900 sm:px-6 sm:pt-12">
      <PrivateAppHeader />
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-8">
          <Link
            href="/"
            className="text-sm font-semibold text-teal-800 hover:underline"
          >
            ← Kembali ke dashboard
          </Link>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight">
            Catat kejadian picking
          </h1>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Pilih jenis kejadian. Detail lain boleh dilewati.
          </p>
        </header>
        <Suspense
          fallback={
            <div
              role="status"
              className="rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-neutral-600 shadow-sm"
            >
              Memuat formulir...
            </div>
          }
        >
          <PickingCreateForm />
        </Suspense>
      </div>
    </main>
  );
}
