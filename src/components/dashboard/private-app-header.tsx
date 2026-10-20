import { Suspense } from "react";
import { auth } from "@/auth";
import { DashboardUserHeader } from "@/components/dashboard/dashboard-user-header";

export function PrivateAppHeader() {
  return (
    <Suspense
      fallback={
        <div
          className="mx-auto mb-4 h-11 w-full max-w-5xl border-b border-neutral-200/80"
          aria-hidden="true"
        />
      }
    >
      <AuthenticatedHeader />
    </Suspense>
  );
}

async function AuthenticatedHeader() {
  const session = await auth();
  return <DashboardUserHeader user={session?.user} />;
}
