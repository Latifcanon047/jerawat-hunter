"use client";

export interface HistoryPaginationProps {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  loading?: boolean;
}

export function HistoryPagination({
  page,
  pageSize,
  totalCount,
  totalPages,
  onPageChange,
  loading = false,
}: HistoryPaginationProps) {
  if (totalCount === 0) return null;

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalCount);
  const rangeText = `Menampilkan ${startItem}–${endItem} dari ${totalCount} catatan`;

  if (totalPages <= 1) {
    return (
      <div className="py-2 text-center sm:text-left">
        <p className="text-xs font-medium text-neutral-600">{rangeText}</p>
      </div>
    );
  }

  return (
    <nav
      aria-label="Navigasi halaman riwayat"
      className="flex flex-col items-center justify-between gap-3 pt-4 sm:flex-row"
    >
      <p className="text-xs font-medium text-neutral-600">{rangeText}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1 || loading}
          onClick={() => onPageChange(page - 1)}
          aria-label="Halaman sebelumnya"
          className="min-h-11 rounded-xl border border-neutral-300 bg-white px-4 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 transition shadow-sm"
        >
          Sebelumnya
        </button>
        <span className="text-xs font-medium text-neutral-700 px-1">
          Halaman {page} dari {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages || loading}
          onClick={() => onPageChange(page + 1)}
          aria-label="Halaman berikutnya"
          className="min-h-11 rounded-xl border border-neutral-300 bg-white px-4 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 transition shadow-sm"
        >
          Berikutnya
        </button>
      </div>
    </nav>
  );
}
