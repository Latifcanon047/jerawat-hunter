import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Masuk — Jerawat Hunter",
  description:
    "Masuk ke akun Jerawat Hunter Anda untuk memahami dan mengurangi dorongan picking.",
};

export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-neutral-50 dark:bg-neutral-950">
      <Suspense
        fallback={
          <div className="w-full max-w-md mx-auto p-8 text-center text-sm text-neutral-400 animate-pulse">
            Memuat formulir masuk...
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
