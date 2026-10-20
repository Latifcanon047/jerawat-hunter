"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type MouseEvent,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutUser } from "@/actions/auth";
import { getUserDisplayName } from "@/lib/user-greeting";

export interface DashboardUserHeaderProps {
  user?: {
    name?: string | null;
    email?: string | null;
  } | null;
}

export function DashboardUserHeader({ user }: DashboardUserHeaderProps) {
  const pathname = usePathname();
  return (
    <DashboardUserHeaderContent
      key={pathname}
      pathname={pathname}
      user={user}
    />
  );
}

function DashboardUserHeaderContent({
  pathname,
  user,
}: DashboardUserHeaderProps & { pathname: string }) {
  const displayName = getUserDisplayName(user);
  const [showConfirm, setShowConfirm] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const sidebarId = useId();
  const accountMenuId = useId();
  const burgerRef = useRef<HTMLButtonElement>(null);
  const closeSidebarRef = useRef<HTMLButtonElement>(null);
  const cancelLogoutRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLDialogElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountTriggerRef = useRef<HTMLButtonElement>(null);
  const skipFocusRestoreRef = useRef(false);

  useEffect(() => {
    const dialog = sidebarRef.current;
    if (!dialog) return;

    if (sidebarOpen && !dialog.open) {
      dialog.showModal();
      closeSidebarRef.current?.focus();
      return;
    }

    if (!sidebarOpen && dialog.open) {
      dialog.close();
      if (!skipFocusRestoreRef.current) {
        burgerRef.current?.focus();
      }
      skipFocusRestoreRef.current = false;
    }
  }, [sidebarOpen]);

  useEffect(() => {
    if (!accountOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !accountRef.current?.contains(event.target)
      ) {
        setAccountOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountOpen(false);
        accountTriggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountOpen]);

  function closeSidebarForNavigation() {
    skipFocusRestoreRef.current = true;
    setSidebarOpen(false);
  }

  function openLogoutConfirmation() {
    setAccountOpen(false);
    setShowConfirm(true);
  }

  function handleSidebarBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      setSidebarOpen(false);
    }
  }

  // Menutup dialog konfirmasi dengan tombol Escape
  useEffect(() => {
    if (!showConfirm) return;
    cancelLogoutRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) {
        setShowConfirm(false);
        setError(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showConfirm, isPending]);

  const handleCancel = () => {
    if (isPending) return;
    setShowConfirm(false);
    setError(null);
  };

  const handleConfirmLogout = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await logoutUser();
        if (result && !result.success) {
          setError(result.error);
        }
      } catch (err) {
        // NEXT_REDIRECT dilempar oleh runtime Next.js saat redirect server
        if (
          err instanceof Error &&
          (err.message === "NEXT_REDIRECT" ||
            (err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT"))
        ) {
          return;
        }
        setError(
          "Gagal keluar dari akun. Silakan periksa koneksi dan coba lagi.",
        );
      }
    });
  };

  return (
    <>
      <header className="mx-auto mb-6 flex min-h-11 w-full max-w-5xl items-center gap-1 border-b border-neutral-200/80 pb-3 sm:gap-2">
        <button
          ref={burgerRef}
          type="button"
          aria-label={sidebarOpen ? "Tutup navigasi" : "Buka navigasi"}
          aria-expanded={sidebarOpen}
          aria-controls={sidebarId}
          onClick={() => setSidebarOpen((open) => !open)}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-teal-800 transition-colors hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2 sm:size-11"
        >
          <svg
            className="size-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            {sidebarOpen ? (
              <path d="M6 6l12 12M18 6 6 18" />
            ) : (
              <path d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>

        <Image
          src="/jawhan-logo.png"
          alt=""
          width={612}
          height={408}
          priority
          className="h-7 w-9 shrink-0 object-contain sm:h-9 sm:w-[54px]"
        />
        <span className="shrink-0 font-[family-name:var(--font-geist-sans)] text-[15px] font-bold tracking-[-0.045em] text-teal-800 sm:text-lg">
          Jawhan
        </span>

        <div ref={accountRef} className="relative ml-auto min-w-0">
          <button
            ref={accountTriggerRef}
            type="button"
            aria-label={`Menu akun${displayName ? ` ${displayName}` : ""}`}
            aria-expanded={accountOpen}
            aria-controls={accountMenuId}
            onClick={() => {
              setSidebarOpen(false);
              setAccountOpen((open) => !open);
            }}
            className="inline-flex min-h-10 max-w-full items-center gap-1 rounded-full border border-teal-100 bg-teal-50/70 px-2 text-sm font-medium text-teal-900 transition-colors hover:border-teal-200 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2 sm:min-h-11 sm:gap-1.5 sm:px-3"
          >
            <UserIcon className="size-[18px] shrink-0 text-teal-700 sm:size-5" />
            <span className="min-w-0 truncate" title={displayName ?? undefined}>
              {displayName ?? "Akun"}
            </span>
            <svg
              className="size-3.5 shrink-0 text-teal-700 sm:size-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m7 10 5 5 5-5" />
            </svg>
          </button>

          <div
            id={accountMenuId}
            role="group"
            aria-label="Menu akun"
            hidden={!accountOpen}
            className="absolute right-0 top-full z-[60] mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-neutral-200 bg-white p-2 shadow-xl"
          >
            <div className="border-b border-neutral-200 px-3 py-2.5">
              <p className="truncate text-sm font-semibold text-neutral-900">
                {displayName ?? "Akun"}
              </p>
              {user?.email && (
                <p className="truncate text-xs text-neutral-600">
                  {user.email}
                </p>
              )}
            </div>
            <button
              type="button"
              disabled
              className="mt-1 flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left text-sm text-neutral-500"
            >
              <span>Pengaturan</span>
              <span className="text-xs">Segera hadir</span>
            </button>
            <button
              type="button"
              onClick={openLogoutConfirmation}
              className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-rose-800 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-inset"
            >
              <LogoutIcon />
              Logout
            </button>
          </div>
        </div>
      </header>

      <dialog
        ref={sidebarRef}
        id={sidebarId}
        aria-modal="true"
        aria-labelledby={`${sidebarId}-title`}
        onCancel={(event) => {
          event.preventDefault();
          setSidebarOpen(false);
        }}
        onClick={handleSidebarBackdropClick}
        className="app-drawer fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[min(20rem,calc(100vw-2rem))] max-w-full flex-col overflow-y-auto overscroll-contain bg-white p-5 text-neutral-900 shadow-2xl"
      >
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Image
              src="/jawhan-logo.png"
              alt=""
              width={612}
              height={408}
              className="h-10 w-[60px] shrink-0 object-contain"
            />
            <h2
              id={`${sidebarId}-title`}
              className="truncate font-[family-name:var(--font-geist-sans)] text-lg font-bold tracking-[-0.04em] text-teal-800"
            >
              Jawhan
            </h2>
          </div>
          <button
            ref={closeSidebarRef}
            type="button"
            aria-label="Tutup sidebar"
            onClick={() => setSidebarOpen(false)}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <nav aria-label="Navigasi utama">
          <ul className="space-y-1">
            <SidebarLink
              href="/"
              active={pathname === "/"}
              onNavigate={closeSidebarForNavigation}
            >
              Dashboard
            </SidebarLink>
            <SidebarLink
              href="/pause"
              active={pathname === "/pause"}
              onNavigate={closeSidebarForNavigation}
            >
              Pause
            </SidebarLink>
            <SidebarLink
              href="/picking"
              active={pathname === "/picking"}
              onNavigate={closeSidebarForNavigation}
            >
              Riwayat Picking
            </SidebarLink>
            <SidebarLink
              href="/picking/analysis"
              active={pathname === "/picking/analysis"}
              onNavigate={closeSidebarForNavigation}
            >
              Analisis Pola Picking
            </SidebarLink>
            <SidebarLink
              href="/resistance"
              active={pathname === "/resistance"}
              onNavigate={closeSidebarForNavigation}
            >
              Riwayat Keberhasilan
            </SidebarLink>
          </ul>
        </nav>
      </dialog>

      {showConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-dialog-title"
          aria-describedby="logout-dialog-description"
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) {
              handleCancel();
            }
          }}
        >
          <section className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <h2
              id="logout-dialog-title"
              className="text-lg font-semibold text-neutral-900"
            >
              Konfirmasi Keluar
            </h2>
            <p
              id="logout-dialog-description"
              className="text-sm leading-6 text-neutral-600"
            >
              Apakah kamu yakin ingin keluar dari akun ini?
            </p>

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-900"
              >
                {error}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                disabled={isPending}
                ref={cancelLogoutRef}
                onClick={handleCancel}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-neutral-300 px-4 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleConfirmLogout}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-50 transition"
              >
                {isPending ? "Keluar..." : "Keluar"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function SidebarLink({
  href,
  active,
  onNavigate,
  children,
}: {
  href: string;
  active: boolean;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-11 items-center rounded-lg px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2 ${
          active
            ? "bg-teal-50 text-teal-800"
            : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950"
        }`}
      >
        {children}
      </Link>
    </li>
  );
}

function UserIcon({ className = "size-5 shrink-0" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      className="size-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
