import { Suspense } from "react";
import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Atur Ulang Kata Sandi — Jerawat Hunter",
  description:
    "Perbarui kata sandi akun Jerawat Hunter Anda dengan aman.",
};

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-neutral-50 dark:bg-neutral-950">
      <Suspense
        fallback={
          <div className="w-full max-w-md mx-auto p-8 text-center text-sm text-neutral-400 animate-pulse">
            Memuat formulir...
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
