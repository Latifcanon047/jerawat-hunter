"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  deletePickingEvent,
  getPickingHistory,
  type PickingEventData,
} from "@/actions/picking";
import { PickingForm } from "@/components/picking/picking-form";
import { useToast } from "@/lib/toast-context";
import { getPickingOptionLabel } from "@/lib/picking-options";
import {
  createLatestRequestGuard,
  type LatestRequestGuard,
} from "@/lib/latest-request";
import { HistoryDateFilter } from "@/components/history/history-date-filter";
import { HistoryPagination } from "@/components/history/history-pagination";
import type { StatsFilterInput } from "@/lib/validations/stats";

export function PickingHistoryList({
  initialEvents,
  initialTotalCount = initialEvents.length,
  initialPage = 1,
  initialPageSize = 20,
  initialTotalPages = Math.ceil(initialEvents.length / 20),
}: {
  initialEvents: PickingEventData[];
  initialTotalCount?: number;
  initialPage?: number;
  initialPageSize?: number;
  initialTotalPages?: number;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [activeFilter, setActiveFilter] = useState<StatsFilterInput | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PickingEventData | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [notice, setNotice] = useState<{
    id: number;
    message: string;
  } | null>(null);
  const [refreshError, setRefreshError] = useState("");
  const noticeIdRef = useRef(0);
  const deletingIdRef = useRef<string | null>(null);
  const cancelDeleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const requestGuardRef = useRef<LatestRequestGuard | null>(null);
  if (requestGuardRef.current === null) {
    requestGuardRef.current = createLatestRequestGuard();
  }

  useEffect(() => {
    if (!notice) return;

    const timeout = window.setTimeout(() => {
      setNotice((current) => (current?.id === notice.id ? null : current));
    }, 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function showNotice(message: string) {
    noticeIdRef.current += 1;
    setNotice({ id: noticeIdRef.current, message });
  }

  const loadEvents = useCallback(
    async (targetPage: number, targetFilter: StatsFilterInput | null) => {
      const requestId = requestGuardRef.current!.begin();
      setLoading(true);
      try {
        const result = await getPickingHistory({
          page: targetPage,
          pageSize: 20,
          filter: targetFilter,
        });
        if (!requestGuardRef.current!.isCurrent(requestId)) return;
        if (!result.success) {
          setRefreshError(result.error);
          return;
        }
        setEvents(result.data.events);
        setTotalCount(result.data.totalCount);
        setPage(result.data.page);
        setPageSize(result.data.pageSize);
        setTotalPages(result.data.totalPages);
        setActiveFilter(targetFilter);
        setRefreshError("");
      } catch {
        if (requestGuardRef.current!.isCurrent(requestId)) {
          setRefreshError(
            "Riwayat picking belum dapat diperbarui. Silakan coba lagi.",
          );
        }
      } finally {
        if (requestGuardRef.current!.isCurrent(requestId)) {
          setLoading(false);
        }
      }
    },
    [],
  );

  const refreshEvents = useCallback(async () => {
    await loadEvents(page, activeFilter);
  }, [loadEvents, page, activeFilter]);

  useEffect(() => {
    const refreshWhenActive = () => {
      if (document.visibilityState === "visible") {
        void refreshEvents();
      }
    };

    document.addEventListener("visibilitychange", refreshWhenActive);
    window.addEventListener("pageshow", refreshWhenActive);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenActive);
      window.removeEventListener("pageshow", refreshWhenActive);
      requestGuardRef.current?.invalidate();
    };
  }, [refreshEvents]);

  const deleteTargetId = deleteTarget?.id;
  useEffect(() => {
    if (!deleteTargetId) return;
    cancelDeleteButtonRef.current?.focus();
    const previouslyFocused = focusReturnRef.current;
    return () => previouslyFocused?.focus();
  }, [deleteTargetId]);

  const handleApplyFilter = (newFilter: StatsFilterInput) => {
    setNotice(null);
    setEditingId(null);
    void loadEvents(1, newFilter);
  };

  const handleResetFilter = () => {
    setNotice(null);
    setEditingId(null);
    void loadEvents(1, null);
  };

  const handlePageChange = (newPage: number) => {
    setNotice(null);
    setEditingId(null);
    void loadEvents(newPage, activeFilter);
  };

  function updateEvent() {
    showToast("success", "Perubahan catatan berhasil disimpan.");
    void loadEvents(page, activeFilter);
  }

  function requestDelete(event: PickingEventData) {
    focusReturnRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setDeleteError("");
    setNotice(null);
    setDeleteTarget(event);
  }

  async function confirmDelete() {
    const target = deleteTarget;
    if (!target || deletingIdRef.current !== null) return;

    deletingIdRef.current = target.id;
    setDeletingId(target.id);
    setDeleteError("");
    try {
      const result = await deletePickingEvent({ eventId: target.id });
      if (!result.success) {
        setDeleteError(result.error);
        return;
      }

      setDeleteTarget(null);
      if (editingId === target.id) setEditingId(null);
      showNotice("Catatan picking berhasil dihapus.");
      await loadEvents(page, activeFilter);
    } catch {
      setDeleteError(
        "Catatan picking belum dapat dihapus. Periksa koneksi lalu coba lagi.",
      );
    } finally {
      deletingIdRef.current = null;
      setDeletingId(null);
    }
  }

  function handleDeleteDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (deletingIdRef.current === null) setDeleteTarget(null);
      return;
    }
    if (event.key !== "Tab") return;

    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>(
      "button:not([disabled])",
    );
    const first = buttons.item(0);
    const last = buttons.item(buttons.length - 1);
    if (!first || !last) {
      event.preventDefault();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="space-y-4">
      {/* Date Filter */}
      <HistoryDateFilter
        activeFilter={activeFilter}
        onApply={handleApplyFilter}
        onReset={handleResetFilter}
        loading={loading}
      />

      {refreshError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
        >
          <p>{refreshError}</p>
          <button
            type="button"
            onClick={() => void refreshEvents()}
            className="mt-3 min-h-11 rounded-lg border border-rose-300 px-4 font-semibold"
          >
            Coba muat ulang
          </button>
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"
        >
          {notice.message}
        </p>
      )}

      {events.length > 0 && (
        <>
          <ol className="space-y-4">
            {events.map((event, index) => (
              <li key={event.id} className="space-y-3">
                <PickingEventCard
                  event={event}
                  itemNumber={(page - 1) * pageSize + index + 1}
                  onEdit={() => {
                    setNotice(null);
                    setEditingId(event.id);
                  }}
                  onDelete={() => requestDelete(event)}
                />
                {editingId === event.id && (
                  <PickingForm
                    key={event.id}
                    mode="edit"
                    event={event}
                    onCancel={() => setEditingId(null)}
                    onUpdated={() => updateEvent()}
                  />
                )}
              </li>
            ))}
          </ol>

          <HistoryPagination
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            loading={loading}
          />
        </>
      )}

      {events.length === 0 && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-600 shadow-sm space-y-3">
          {activeFilter ? (
            <>
              <p className="font-semibold text-neutral-800">
                Tidak ada catatan pada periode ini.
              </p>
              <p className="text-xs text-neutral-500">
                Coba pilih rentang tanggal lain atau hapus filter untuk melihat
                semua catatan.
              </p>
              <button
                type="button"
                onClick={handleResetFilter}
                disabled={loading}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-neutral-300 px-4 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition"
              >
                Tampilkan semua catatan
              </button>
            </>
          ) : (
            <p role="status">Tidak ada catatan picking tersisa.</p>
          )}
        </div>
      )}

      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-picking-title"
          aria-describedby="delete-picking-description"
          onKeyDown={handleDeleteDialogKeyDown}
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 p-4"
        >
          <section className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="delete-picking-title" className="text-xl font-semibold">
              Hapus catatan picking?
            </h2>
            <p
              id="delete-picking-description"
              className="text-sm leading-6 text-neutral-700"
            >
              Catatan ini akan dihapus dan tidak dapat dipulihkan.
            </p>
            {deleteError && (
              <p
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"
              >
                {deleteError}
              </p>
            )}
            {deletingId === deleteTarget.id && (
              <p role="status" className="text-sm text-neutral-600">
                Menghapus catatan...
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                ref={cancelDeleteButtonRef}
                type="button"
                disabled={deletingId !== null}
                onClick={() => setDeleteTarget(null)}
                className="min-h-12 rounded-xl border border-neutral-300 px-5 font-semibold hover:bg-neutral-50 disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={() => void confirmDelete()}
                className="min-h-12 rounded-xl bg-rose-700 px-5 font-semibold text-white hover:bg-rose-800 disabled:opacity-60"
              >
                {deletingId === deleteTarget.id ? "Menghapus..." : "Hapus"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function PickingEventCard({
  event,
  itemNumber,
  onEdit,
  onDelete,
}: {
  event: PickingEventData;
  itemNumber: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const detailGroups = [
    { label: "Pemicu", values: event.triggers },
    { label: "Emosi", values: event.emotions },
    { label: "Alasan", values: event.reasons },
    { label: "Dampak", values: event.impacts },
  ].filter((group) => group.values.length > 0);

  return (
    <article className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-neutral-500">
            {new Intl.DateTimeFormat("id-ID", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Jakarta",
            }).format(new Date(event.occurredAt ?? event.recordedAt))}
            {!event.occurredAt && " · waktu kejadian tidak diketahui"}
          </p>
          <h2 className="mt-1 text-lg font-semibold">
            {getPickingOptionLabel(event.pickingType)}
          </h2>
        </div>
        <span
          className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 px-2 text-xs font-bold text-neutral-600 tabular-nums"
          aria-label={`Nomor ${itemNumber}`}
        >
          #{itemNumber}
        </span>
      </div>

      {event.urgeStrength !== null && (
        <p className="text-sm text-neutral-700">
          Kekuatan dorongan: {event.urgeStrength}/5
        </p>
      )}
      {event.durationRange && (
        <p className="text-sm text-neutral-700">
          Durasi: {getPickingOptionLabel(event.durationRange)}
        </p>
      )}
      {event.context && (
        <p className="text-sm text-neutral-700">
          Konteks: {getPickingOptionLabel(event.context)}
        </p>
      )}
      {detailGroups.map((group) => (
        <div key={group.label}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {group.label}
          </h3>
          <ul className="mt-1 flex flex-wrap gap-2">
            {group.values.map((value) => (
              <li
                key={value}
                className="rounded-full bg-teal-50 px-3 py-1 text-xs text-teal-950"
              >
                {getPickingOptionLabel(value)}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onEdit}
          className="min-h-11 rounded-xl border border-teal-800 px-4 font-semibold text-teal-900 hover:bg-teal-50"
        >
          Edit catatan
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="min-h-11 rounded-xl border border-rose-700 px-4 font-semibold text-rose-800 hover:bg-rose-50"
        >
          Hapus
        </button>
      </div>
    </article>
  );
}
