import { Suspense } from "react";
import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Lupa Kata Sandi — Jerawat Hunter",
  description:
    "Permintaan pemulihan dan pengaturan ulang kata sandi akun Jerawat Hunter.",
};

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-neutral-50 dark:bg-neutral-950">
      <Suspense
        fallback={
          <div className="w-full max-w-md mx-auto p-8 text-center text-sm text-neutral-400 animate-pulse">
            Memuat formulir...
          </div>
        }
      >
        <ForgotPasswordForm />
      </Suspense>
    </main>
  );
}
