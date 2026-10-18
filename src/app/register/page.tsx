import { Suspense } from "react";
import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
  title: "Daftar Akun — Jerawat Hunter",
  description:
    "Buat akun baru Jerawat Hunter untuk memulai langkah tenang Anda dalam mengurangi kebiasaan picking.",
};

export default function RegisterPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-neutral-50 dark:bg-neutral-950">
      <Suspense
        fallback={
          <div className="w-full max-w-md mx-auto p-8 text-center text-sm text-neutral-400 animate-pulse">
            Memuat formulir pendaftaran...
          </div>
        }
      >
        <RegisterForm />
      </Suspense>
    </main>
  );
}
