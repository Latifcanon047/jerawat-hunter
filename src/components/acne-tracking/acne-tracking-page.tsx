"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  Suspense,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
} from "react";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/lib/toast-context";
import { HealingAveragePanel } from "@/components/acne-tracking/healing-average-panel";

type TrackingStatus = "ACTIVE" | "HEALED";
type AcneLocation =
  | "forehead"
  | "left_temple"
  | "right_temple"
  | "nose"
  | "left_cheek"
  | "right_cheek"
  | "around_mouth"
  | "chin"
  | "left_jaw"
  | "right_jaw";

type TrackingRecord = {
  id: string;
  name: string;
  location: AcneLocation;
  startedAt: string;
  status: TrackingStatus;
  healedDate: string | null;
  photoAvailable: boolean;
  photoWidth?: number | null;
  photoHeight?: number | null;
  markerX?: number | null;
  markerY?: number | null;
  photoUploadStatus?: "FAILED" | "RECOVERY_PENDING";
};

type ListResponse = {
  records: TrackingRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

type Panel =
  | { type: "create" }
  | { type: "detail"; trackingId: string }
  | { type: "edit"; trackingId: string }
  | { type: "heal"; trackingId: string }
  | { type: "delete"; trackingId: string }
  | { type: "photo"; trackingId: string }
  | { type: "marker"; trackingId: string }
  | { type: "removePhoto"; trackingId: string }
  | null;

export const locations: { value: AcneLocation; label: string }[] = [
  { value: "forehead", label: "Dahi" },
  { value: "left_temple", label: "Pelipis kiri" },
  { value: "right_temple", label: "Pelipis kanan" },
  { value: "nose", label: "Hidung" },
  { value: "left_cheek", label: "Pipi kiri" },
  { value: "right_cheek", label: "Pipi kanan" },
  { value: "around_mouth", label: "Sekitar mulut" },
  { value: "chin", label: "Dagu" },
  { value: "left_jaw", label: "Rahang kiri" },
  { value: "right_jaw", label: "Rahang kanan" },
];

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_PHOTO_SIDE = 1600;

async function readApiResponse<T>(response: Response): Promise<T> {
  let payload: ApiResponse<T>;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new Error("Respons server tidak dapat dibaca. Silakan coba lagi.");
  }
  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(
      payload.error ?? "Permintaan belum berhasil. Silakan coba lagi.",
    );
  }
  return payload.data;
}

function locationLabel(value: AcneLocation): string {
  return locations.find((location) => location.value === value)?.label ?? value;
}

function formatCalendarDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function jakartaToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

async function shrinkPhoto(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(
      1,
      MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas tidak tersedia.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.8),
    );
    if (!blob) throw new Error("Gagal membuat JPEG.");
    const baseName = file.name.replace(/\.[^.]+$/, "") || "foto";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

export function AcneTrackingPage() {
  const { showToast } = useToast();
  const [status, setStatus] = useState<TrackingStatus>("ACTIVE");
  const [healingRefresh, setHealingRefresh] = useState(0);
  const [page, setPage] = useState(1);
  const [list, setList] = useState<ListResponse | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [selected, setSelected] = useState<TrackingRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [name, setName] = useState("");
  const [location, setLocation] = useState<AcneLocation>("forehead");
  const [startedAt, setStartedAt] = useState("");
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);
  const createKeyRef = useRef<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [marker, setMarker] = useState<{ x: number; y: number } | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoTokenRef = useRef(0);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [photoFailedId, setPhotoFailedId] = useState<string | null>(null);
  const [photoLoadedId, setPhotoLoadedId] = useState<string | null>(null);
  const [photoZoomedId, setPhotoZoomedId] = useState<string | null>(null);
  const [markerDraft, setMarkerDraft] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [markerPhotoState, setMarkerPhotoState] = useState<
    "loading" | "ready" | "failed"
  >("loading");
  const listRequestRef = useRef(0);
  const detailRequestRef = useRef(0);

  const loadList = useCallback(
    async (requestedPage: number, requestedStatus: TrackingStatus) => {
      const requestId = ++listRequestRef.current;
      setListLoading(true);
      setListError("");
      try {
        const query = new URLSearchParams({
          status: requestedStatus,
          page: String(requestedPage),
          pageSize: "50",
        });
        const data = await readApiResponse<ListResponse>(
          await fetch(`/api/acne-trackings?${query}`, {
            cache: "no-store",
          }),
        );
        if (requestId !== listRequestRef.current) return;
        setList(data);
        setPage(data.page);
      } catch (error) {
        if (requestId !== listRequestRef.current) return;
        setListError(
          error instanceof Error
            ? error.message
            : "Daftar belum dapat dimuat. Silakan coba lagi.",
        );
      } finally {
        if (requestId === listRequestRef.current) setListLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void loadList(1, status);
    });
    return () => {
      active = false;
      listRequestRef.current += 1;
    };
  }, [status, loadList]);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  const openDetail = useCallback(async (trackingId: string) => {
    const requestId = ++detailRequestRef.current;
    setPanel({ type: "detail", trackingId });
    setSelected(null);
    setDetailError("");
    setPhotoZoomedId(null);
    setPhotoLoadedId(null);
    setPhotoFailedId(null);
    setDetailLoading(true);
    try {
      const data = await readApiResponse<TrackingRecord>(
        await fetch(`/api/acne-trackings/${encodeURIComponent(trackingId)}`, {
          cache: "no-store",
        }),
      );
      if (requestId !== detailRequestRef.current) return;
      setSelected(data);
    } catch (error) {
      if (requestId !== detailRequestRef.current) return;
      setDetailError(
        error instanceof Error
          ? error.message
          : "Detail belum dapat dimuat. Silakan coba lagi.",
      );
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false);
    }
  }, []);

  function clearPhoto() {
    photoTokenRef.current += 1;
    setPhotoProcessing(false);
    if (photoInputRef.current) photoInputRef.current.value = "";
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setPhotoError("");
    setMarker(null);
    createKeyRef.current = null;
  }

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    const token = ++photoTokenRef.current;
    setMarker(null);
    createKeyRef.current = null;
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setPhotoError("");
    if (!PHOTO_TYPES.includes(file.type)) {
      setPhotoError("Foto harus berupa JPEG, PNG, atau WebP.");
      input.value = "";
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setPhotoError("Ukuran foto asli maksimal 25 MB.");
      input.value = "";
      return;
    }
    setPhotoProcessing(true);
    try {
      const shrunk = await shrinkPhoto(file);
      if (token !== photoTokenRef.current) return;
      if (shrunk.size > MAX_PHOTO_BYTES) {
        setPhotoError("Foto masih terlalu besar setelah diperkecil.");
        input.value = "";
        return;
      }
      setPhotoFile(shrunk);
      setPhotoPreviewUrl(URL.createObjectURL(shrunk));
    } catch {
      if (token !== photoTokenRef.current) return;
      setPhotoError("Foto tidak dapat diproses. Coba foto lain.");
      input.value = "";
    } finally {
      if (token === photoTokenRef.current) setPhotoProcessing(false);
    }
  }

  function placeMarker(event: MouseEvent<HTMLImageElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const clamp = (value: number) =>
      Math.round(Math.min(1, Math.max(0, value)) * 10000) / 10000;
    createKeyRef.current = null;
    setMarker({ x: clamp(x), y: clamp(y) });
  }

  function openCreate() {
    setName("");
    setLocation("forehead");
    setStartedAt(jakartaToday());
    setFormError("");
    clearPhoto();
    createKeyRef.current = null;
    setPanel({ type: "create" });
  }

  function changeName(value: string) {
    setName(value);
    if (panel?.type === "create") createKeyRef.current = null;
  }

  function changeLocation(value: AcneLocation) {
    setLocation(value);
    if (panel?.type === "create") createKeyRef.current = null;
  }

  function changeStartedAt(value: string) {
    setStartedAt(value);
    if (panel?.type === "create") createKeyRef.current = null;
  }

  function openEdit(record: TrackingRecord) {
    setName(record.name);
    setLocation(record.location);
    setStartedAt(record.startedAt);
    setFormError("");
    setPanel({ type: "edit", trackingId: record.id });
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || photoProcessing) return;
    if (panel?.type === "create" && photoFile && !marker) {
      setFormError(
        "Ketuk foto untuk menandai letak jerawat sebelum menyimpan.",
      );
      return;
    }
    setPending(true);
    setFormError("");
    try {
      if (panel?.type === "create") {
        const body = new FormData();
        body.set("name", name);
        body.set("location", location);
        if (startedAt) body.set("startedAt", startedAt);
        if (photoFile && marker) {
          body.set("photo", photoFile);
          body.set("markerX", marker.x.toFixed(4));
          body.set("markerY", marker.y.toFixed(4));
        }
        createKeyRef.current ??= crypto.randomUUID();
        const created = await readApiResponse<TrackingRecord>(
          await fetch("/api/acne-trackings", {
            method: "POST",
            headers: { "Idempotency-Key": createKeyRef.current },
            body,
          }),
        );
        createKeyRef.current = null;
        setPanel(null);
        if (created.photoUploadStatus) {
          showToast(
            "error",
            "Catatan tersimpan, tetapi foto belum berhasil dipastikan. Muat ulang halaman untuk memeriksa.",
          );
        } else {
          showToast("success", "Catatan pemantauan berhasil ditambahkan.");
        }
        await loadList(1, status);
      } else if (panel?.type === "edit") {
        const record = await readApiResponse<TrackingRecord>(
          await fetch(
            `/api/acne-trackings/${encodeURIComponent(panel.trackingId)}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, location, startedAt }),
            },
          ),
        );
        setSelected(record);
        setPanel({ type: "detail", trackingId: record.id });
        showToast("success", "Informasi pemantauan berhasil diperbarui.");
        await loadList(page, status);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Perubahan belum dapat disimpan. Silakan coba lagi.";
      setFormError(message);
      showToast("error", message);
    } finally {
      setPending(false);
    }
  }

  function openPhoto(trackingId: string) {
    clearPhoto();
    setFormError("");
    createKeyRef.current = null;
    setPanel({ type: "photo", trackingId });
  }

  async function replacePhoto(trackingId: string) {
    if (pending) return;
    if (!photoFile) {
      setFormError("Pilih foto terlebih dahulu.");
      return;
    }
    if (!marker) {
      setFormError(
        "Ketuk foto untuk menandai letak jerawat sebelum menyimpan.",
      );
      return;
    }
    setPending(true);
    setFormError("");
    try {
      const body = new FormData();
      body.set("photo", photoFile);
      body.set("markerX", marker.x.toFixed(4));
      body.set("markerY", marker.y.toFixed(4));
      createKeyRef.current ??= crypto.randomUUID();
      const data = await readApiResponse<Partial<TrackingRecord>>(
        await fetch(
          `/api/acne-trackings/${encodeURIComponent(trackingId)}/photo`,
          {
            method: "PUT",
            headers: { "Idempotency-Key": createKeyRef.current },
            body,
          },
        ),
      );
      createKeyRef.current = null;
      setSelected((current) =>
        current && current.id === trackingId
          ? { ...current, ...data, photoAvailable: true }
          : current,
      );
      clearPhoto();
      setPhotoLoadedId(null);
      setPhotoFailedId(null);
      setPanel({ type: "detail", trackingId });
      showToast("success", "Foto berhasil disimpan.");
    } catch (error) {
      createKeyRef.current = null;
      const message =
        error instanceof Error
          ? error.message
          : "Foto belum dapat disimpan. Silakan coba lagi.";
      setFormError(message);
      showToast("error", message);
    } finally {
      setPending(false);
    }
  }

  function openMarker(record: TrackingRecord) {
    setFormError("");
    setMarkerPhotoState("loading");
    setMarkerDraft(
      record.markerX != null && record.markerY != null
        ? { x: Number(record.markerX), y: Number(record.markerY) }
        : null,
    );
    setPanel({ type: "marker", trackingId: record.id });
  }

  function placeMarkerDraft(event: MouseEvent<HTMLImageElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const clamp = (value: number) =>
      Math.round(Math.min(1, Math.max(0, value)) * 10000) / 10000;
    setMarkerDraft({
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    });
  }

  async function saveMarker(trackingId: string) {
    if (pending) return;
    if (!markerDraft) {
      setFormError("Ketuk foto untuk menentukan letak penanda.");
      return;
    }
    setPending(true);
    setFormError("");
    try {
      const data = await readApiResponse<Partial<TrackingRecord>>(
        await fetch(
          `/api/acne-trackings/${encodeURIComponent(trackingId)}/photo`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              markerX: markerDraft.x,
              markerY: markerDraft.y,
            }),
          },
        ),
      );
      setSelected((current) =>
        current && current.id === trackingId
          ? { ...current, ...data }
          : current,
      );
      setPhotoLoadedId(null);
      setPhotoFailedId(null);
      setPanel({ type: "detail", trackingId });
      showToast("success", "Penanda berhasil diperbarui.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Penanda belum dapat disimpan. Silakan coba lagi.";
      setFormError(message);
      showToast("error", message);
    } finally {
      setPending(false);
    }
  }

  async function removePhoto(trackingId: string) {
    if (pending) return;
    setPending(true);
    setFormError("");
    try {
      await readApiResponse<{ photoRemoved: boolean }>(
        await fetch(
          `/api/acne-trackings/${encodeURIComponent(trackingId)}/photo`,
          { method: "DELETE" },
        ),
      );
      setSelected((current) =>
        current && current.id === trackingId
          ? {
              ...current,
              photoAvailable: false,
              photoWidth: null,
              photoHeight: null,
              markerX: null,
              markerY: null,
            }
          : current,
      );
      setPhotoLoadedId(null);
      setPhotoFailedId(null);
      setPanel({ type: "detail", trackingId });
      showToast("success", "Foto berhasil dihapus.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Foto belum dapat dihapus. Silakan coba lagi.";
      setFormError(message);
      showToast("error", message);
    } finally {
      setPending(false);
    }
  }

  async function markHealed(trackingId: string) {
    if (pending) return;
    setPending(true);
    setFormError("");
    try {
      const record = await readApiResponse<TrackingRecord>(
        await fetch(
          `/api/acne-trackings/${encodeURIComponent(trackingId)}/heal`,
          { method: "POST" },
        ),
      );
      setSelected(record);
      setPanel({ type: "detail", trackingId });
      showToast("success", "Jerawat ditandai sudah sembuh.");
      setHealingRefresh((current) => current + 1);
      await loadList(page, status);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Status belum dapat diperbarui. Silakan coba lagi.";
      setFormError(message);
      showToast("error", message);
    } finally {
      setPending(false);
    }
  }

  async function deleteTracking(trackingId: string) {
    if (pending) return;
    setPending(true);
    setFormError("");
    try {
      const response = await fetch(
        `/api/acne-trackings/${encodeURIComponent(trackingId)}`,
        { method: "DELETE" },
      );
      if (response.status !== 204) {
        let message = "Catatan belum dapat dihapus. Silakan coba lagi.";
        try {
          const payload = (await response.json()) as ApiResponse<unknown>;
          if (payload.error) message = payload.error;
        } catch {
          // respons error tidak berisi JSON; pakai pesan bawaan
        }
        throw new Error(message);
      }
      setSelected(null);
      setPanel(null);
      showToast("success", "Catatan pemantauan berhasil dihapus.");
      await loadList(page, status);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Catatan belum dapat dihapus. Silakan coba lagi.";
      setFormError(message);
      showToast("error", message);
    } finally {
      setPending(false);
    }
  }

  const modalTitle =
    panel?.type === "create"
      ? "Tambah pemantauan"
      : panel?.type === "heal"
        ? "Tandai sudah sembuh?"
        : panel?.type === "delete"
          ? "Hapus catatan?"
          : panel?.type === "photo"
            ? "Ganti foto"
            : panel?.type === "marker"
              ? "Ubah penanda"
              : panel?.type === "removePhoto"
                ? "Hapus foto?"
                : "Detail pemantauan";

  const photoPicker = (
    <div className="space-y-2 text-sm font-medium">
      <label htmlFor="acne-photo" className="block">
        Foto (opsional)
      </label>
      <input
        id="acne-photo"
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => void choosePhoto(event)}
        className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-teal-50 file:px-4 file:font-semibold file:text-teal-800"
      />
      {photoError && (
        <p role="alert" className="text-sm leading-6 text-rose-700">
          {photoError}
        </p>
      )}
      {photoProcessing && (
        <p role="status" className="text-sm font-normal text-neutral-600">
          Memproses foto...
        </p>
      )}
      {photoFile && photoPreviewUrl && (
        <div className="space-y-2">
          <p className="text-sm font-normal text-neutral-600">
            {marker
              ? "Penanda dipasang. Ketuk foto lagi untuk memindahkan."
              : "Ketuk foto untuk menandai letak jerawat."}
          </p>
          <div className="relative mx-auto w-fit max-w-full">
            {/* eslint-disable-next-line @next/next/no-img-element -- blob URL lokal */}
            <img
              src={photoPreviewUrl}
              alt="Pratinjau foto"
              onClick={placeMarker}
              className="block max-h-72 max-w-full cursor-crosshair rounded-xl border border-neutral-200"
            />
            {marker && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-red-600 bg-red-600/20"
                style={{
                  left: `${marker.x * 100}%`,
                  top: `${marker.y * 100}%`,
                }}
              />
            )}
          </div>
          <button
            type="button"
            onClick={clearPhoto}
            disabled={pending}
            className="min-h-11 text-sm font-semibold text-rose-700 underline disabled:opacity-60"
          >
            Hapus pilihan foto
          </button>
        </div>
      )}
    </div>
  );

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="text-lg font-semibold">Catatan pemantauan</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Jerawat aktif dan catatan yang sudah sembuh.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="min-h-11 rounded-xl bg-teal-800 px-5 font-semibold text-white hover:bg-teal-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
        >
          Tambah jerawat
        </button>
      </div>

      <Suspense
        fallback={
          <div
            role="status"
            className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600 shadow-sm sm:p-5"
          >
            Memuat rata-rata sembuh...
          </div>
        }
      >
        <HealingAveragePanel
          locations={locations}
          refreshSignal={healingRefresh}
        />{" "}
      </Suspense>

      <div className="flex gap-2" aria-label="Filter status pemantauan">
        {(["ACTIVE", "HEALED"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
            className={`min-h-11 flex-1 rounded-xl px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2 ${
              status === value
                ? "bg-teal-800 text-white"
                : "border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            {value === "ACTIVE" ? "Aktif" : "Riwayat sembuh"}
          </button>
        ))}
      </div>

      {listError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900"
        >
          <p>{listError}</p>
          <button
            type="button"
            onClick={() => void loadList(page, status)}
            disabled={listLoading}
            className="mt-2 min-h-11 font-semibold underline disabled:opacity-60"
          >
            {listLoading ? "Memuat..." : "Coba lagi"}
          </button>
        </div>
      )}

      {listLoading ? (
        <div
          role="status"
          className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600"
        >
          Memuat catatan pemantauan...
        </div>
      ) : list?.records.length ? (
        <>
          <ul className="space-y-3">
            {list.records.map((record) => (
              <li key={record.id}>
                <button
                  type="button"
                  onClick={() => void openDetail(record.id)}
                  className="w-full rounded-2xl border border-neutral-200 bg-white p-5 text-left shadow-sm transition hover:border-teal-300 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
                >
                  <span className="flex flex-wrap items-start justify-between gap-3">
                    <span>
                      <span className="block text-base font-semibold">
                        {record.name}
                      </span>
                      <span className="mt-1 block text-sm text-neutral-600">
                        {locationLabel(record.location)} · Mulai{" "}
                        {formatCalendarDate(record.startedAt)}
                      </span>
                    </span>
                    <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
                      {record.status === "ACTIVE" ? "Aktif" : "Sembuh"}
                    </span>
                  </span>
                  <span className="mt-3 block text-sm font-semibold text-teal-800">
                    Lihat detail
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {list.totalPages > 1 && (
            <nav
              aria-label="Halaman daftar pemantauan"
              className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-3"
            >
              <button
                type="button"
                onClick={() => void loadList(page - 1, status)}
                disabled={page <= 1 || listLoading}
                className="min-h-11 rounded-lg px-3 text-sm font-semibold text-teal-800 disabled:text-neutral-400"
              >
                Sebelumnya
              </button>
              <span className="text-sm text-neutral-600">
                Halaman {page} dari {list.totalPages}
              </span>
              <button
                type="button"
                onClick={() => void loadList(page + 1, status)}
                disabled={page >= list.totalPages || listLoading}
                className="min-h-11 rounded-lg px-3 text-sm font-semibold text-teal-800 disabled:text-neutral-400"
              >
                Berikutnya
              </button>
            </nav>
          )}
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-7 text-center">
          <h3 className="font-semibold">
            {status === "ACTIVE"
              ? "Belum ada jerawat yang dipantau"
              : "Belum ada catatan yang sudah sembuh"}
          </h3>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            {status === "ACTIVE"
              ? "Tambahkan catatan saat kamu siap memulai pemantauan."
              : "Catatan yang ditandai sembuh akan muncul di sini."}
          </p>
          {status === "ACTIVE" && (
            <button
              type="button"
              onClick={openCreate}
              className="mt-4 min-h-11 rounded-xl bg-teal-800 px-5 font-semibold text-white hover:bg-teal-900"
            >
              Tambah jerawat
            </button>
          )}
        </div>
      )}

      <Modal
        isOpen={panel !== null}
        title={modalTitle}
        description={
          panel?.type === "create"
            ? "Isi informasi dasar. Tanggal mulai diisi hari ini, boleh diubah ke tanggal sebelumnya."
            : undefined
        }
        closeDisabled={pending}
        onRequestClose={() => {
          if (!pending) setPanel(null);
        }}
      >
        {(panel?.type === "create" || panel?.type === "edit") && (
          <form onSubmit={submitForm} className="space-y-4">
            <label className="block space-y-1.5 text-sm font-medium">
              <span>Nama jerawat atau koreng</span>
              <input
                required
                value={name}
                onChange={(event) => changeName(event.target.value)}
                className="min-h-12 w-full rounded-xl border border-neutral-300 px-3 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              <span>Lokasi</span>
              <select
                value={location}
                onChange={(event) =>
                  changeLocation(event.target.value as AcneLocation)
                }
                className="min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
              >
                {locations.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              <span>Tanggal mulai</span>
              <input
                type="date"
                required
                max={jakartaToday()}
                value={startedAt}
                onChange={(event) => changeStartedAt(event.target.value)}
                className="min-h-12 w-full rounded-xl border border-neutral-300 px-3 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
              />
            </label>
            {panel?.type === "create" && photoPicker}
            {formError && (
              <p role="alert" className="text-sm leading-6 text-rose-700">
                {formError}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPanel(null)}
                disabled={pending}
                className="min-h-11 rounded-xl border border-neutral-300 px-5 font-semibold hover:bg-neutral-50 disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={pending || photoProcessing}
                className="min-h-11 rounded-xl bg-teal-800 px-5 font-semibold text-white hover:bg-teal-900 disabled:opacity-60"
              >
                {pending
                  ? "Menyimpan..."
                  : panel.type === "create"
                    ? "Simpan catatan"
                    : "Simpan perubahan"}
              </button>
            </div>
          </form>
        )}

        {panel?.type === "detail" && (
          <div className="space-y-5">
            {detailLoading ? (
              <p role="status" className="text-sm text-neutral-600">
                Memuat detail...
              </p>
            ) : detailError ? (
              <div role="alert" className="space-y-3 text-sm text-rose-800">
                <p>{detailError}</p>
                <button
                  type="button"
                  onClick={() => void openDetail(panel.trackingId)}
                  className="min-h-11 font-semibold underline"
                >
                  Coba lagi
                </button>
              </div>
            ) : selected ? (
              <>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Nama
                    </dt>
                    <dd className="mt-1 font-medium">{selected.name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Lokasi
                    </dt>
                    <dd className="mt-1 font-medium">
                      {locationLabel(selected.location)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Tanggal mulai
                    </dt>
                    <dd className="mt-1 font-medium">
                      {formatCalendarDate(selected.startedAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Status
                    </dt>
                    <dd className="mt-1 font-medium">
                      {selected.status === "ACTIVE" ? "Aktif" : "Sembuh"}
                    </dd>
                  </div>
                  {selected.healedDate && (
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Tanggal sembuh
                      </dt>
                      <dd className="mt-1 font-medium">
                        {formatCalendarDate(selected.healedDate)}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Foto
                    </dt>
                    <dd className="mt-1 font-medium">
                      {selected.photoAvailable
                        ? "Foto tersimpan"
                        : "Belum ada foto"}
                    </dd>
                  </div>
                </dl>
                {selected.photoAvailable && (
                  <div className="space-y-2">
                    {photoFailedId === selected.id ? (
                      <p
                        role="alert"
                        className="text-sm leading-6 text-rose-700"
                      >
                        Foto belum dapat dimuat. Tutup lalu buka detail lagi
                        untuk mencoba.
                      </p>
                    ) : (
                      <>
                        {photoLoadedId !== selected.id && (
                          <div role="status">
                            <div
                              aria-hidden="true"
                              className="h-64 w-full animate-pulse rounded-xl bg-neutral-200"
                            />
                            <span className="sr-only">Memuat foto...</span>
                          </div>
                        )}
                        <div
                          className={
                            photoLoadedId === selected.id
                              ? "relative mx-auto w-fit max-w-full"
                              : "hidden"
                          }
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setPhotoZoomedId((current) =>
                                current === selected.id ? null : selected.id,
                              )
                            }
                            aria-label={
                              photoZoomedId === selected.id
                                ? "Perkecil foto"
                                : "Perbesar foto"
                            }
                            className={`block max-w-full ${
                              photoZoomedId === selected.id
                                ? "cursor-zoom-out"
                                : "cursor-zoom-in"
                            }`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- foto privat dari API */}
                            <img
                              src={`/api/acne-trackings/${encodeURIComponent(selected.id)}/photo`}
                              alt={`Foto ${selected.name}`}
                              onLoad={() => setPhotoLoadedId(selected.id)}
                              onError={() => setPhotoFailedId(selected.id)}
                              className={`block max-w-full rounded-xl border border-neutral-200 ${
                                photoZoomedId === selected.id ? "" : "max-h-80"
                              }`}
                            />
                          </button>
                          {photoLoadedId === selected.id &&
                            selected.markerX != null &&
                            selected.markerY != null && (
                              <span
                                aria-hidden="true"
                                className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-red-600 bg-red-600/20"
                                style={{
                                  left: `${Number(selected.markerX) * 100}%`,
                                  top: `${Number(selected.markerY) * 100}%`,
                                }}
                              />
                            )}
                        </div>
                      </>
                    )}
                  </div>
                )}
                {formError && (
                  <p role="alert" className="text-sm leading-6 text-rose-700">
                    {formError}
                  </p>
                )}
                <div className="flex flex-col gap-2 border-t border-neutral-200 pt-4 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setPanel(null)}
                    className="min-h-11 rounded-xl border border-neutral-300 px-5 font-semibold hover:bg-neutral-50"
                  >
                    Tutup
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(selected)}
                    className="min-h-11 rounded-xl border border-teal-700 px-5 font-semibold text-teal-800 hover:bg-teal-50"
                  >
                    Edit informasi
                  </button>
                  <button
                    type="button"
                    onClick={() => openPhoto(selected.id)}
                    className="min-h-11 rounded-xl border border-teal-700 px-5 font-semibold text-teal-800 hover:bg-teal-50"
                  >
                    {selected.photoAvailable ? "Ganti foto" : "Tambah foto"}
                  </button>
                  {selected.photoAvailable && (
                    <button
                      type="button"
                      onClick={() => openMarker(selected)}
                      className="min-h-11 rounded-xl border border-teal-700 px-5 font-semibold text-teal-800 hover:bg-teal-50"
                    >
                      Ubah penanda
                    </button>
                  )}
                  {selected.photoAvailable && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormError("");
                        setPanel({
                          type: "removePhoto",
                          trackingId: selected.id,
                        });
                      }}
                      className="min-h-11 rounded-xl border border-rose-300 px-5 font-semibold text-rose-700 hover:bg-rose-50"
                    >
                      Hapus foto
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setFormError("");
                      setPanel({ type: "delete", trackingId: selected.id });
                    }}
                    className="min-h-11 rounded-xl border border-rose-300 px-5 font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    Hapus
                  </button>
                  {selected.status === "ACTIVE" && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormError("");
                        setPanel({ type: "heal", trackingId: selected.id });
                      }}
                      className="min-h-11 rounded-xl bg-teal-800 px-5 font-semibold text-white hover:bg-teal-900"
                    >
                      Tandai sembuh
                    </button>
                  )}
                </div>
              </>
            ) : null}
          </div>
        )}

        {panel?.type === "heal" && (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-neutral-700">
              Tandai catatan ini sebagai sembuh? Tanggal sembuh akan dicatat
              hari ini dan tidak dapat diubah lewat aksi ini.
            </p>
            {formError && (
              <p role="alert" className="text-sm leading-6 text-rose-700">
                {formError}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() =>
                  setPanel({ type: "detail", trackingId: panel.trackingId })
                }
                disabled={pending}
                className="min-h-11 rounded-xl border border-neutral-300 px-5 font-semibold hover:bg-neutral-50 disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void markHealed(panel.trackingId)}
                disabled={pending}
                className="min-h-11 rounded-xl bg-teal-800 px-5 font-semibold text-white hover:bg-teal-900 disabled:opacity-60"
              >
                {pending ? "Menyimpan..." : "Ya, tandai sembuh"}
              </button>
            </div>
          </div>
        )}
        {panel?.type === "delete" && (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-neutral-700">
              Hapus catatan ini? Catatan akan dihapus dan tidak dapat
              dikembalikan.
            </p>
            {formError && (
              <p role="alert" className="text-sm leading-6 text-rose-700">
                {formError}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() =>
                  setPanel({ type: "detail", trackingId: panel.trackingId })
                }
                disabled={pending}
                className="min-h-11 rounded-xl border border-neutral-300 px-5 font-semibold hover:bg-neutral-50 disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void deleteTracking(panel.trackingId)}
                disabled={pending}
                className="min-h-11 rounded-xl bg-rose-700 px-5 font-semibold text-white hover:bg-rose-800 disabled:opacity-60"
              >
                {pending ? "Menghapus..." : "Ya, hapus"}
              </button>
            </div>
          </div>
        )}
        {panel?.type === "removePhoto" && (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-neutral-700">
              Hapus foto dan penandanya dari catatan ini? Catatan tetap ada, dan
              foto tidak dapat dikembalikan.
            </p>
            {formError && (
              <p role="alert" className="text-sm leading-6 text-rose-700">
                {formError}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() =>
                  setPanel({ type: "detail", trackingId: panel.trackingId })
                }
                disabled={pending}
                className="min-h-11 rounded-xl border border-neutral-300 px-5 font-semibold hover:bg-neutral-50 disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void removePhoto(panel.trackingId)}
                disabled={pending}
                className="min-h-11 rounded-xl bg-rose-700 px-5 font-semibold text-white hover:bg-rose-800 disabled:opacity-60"
              >
                {pending ? "Menghapus..." : "Ya, hapus foto"}
              </button>
            </div>
          </div>
        )}
        {panel?.type === "photo" && (
          <div className="space-y-4">
            {photoPicker}
            {formError && (
              <p role="alert" className="text-sm leading-6 text-rose-700">
                {formError}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  clearPhoto();
                  setPanel({ type: "detail", trackingId: panel.trackingId });
                }}
                disabled={pending}
                className="min-h-11 rounded-xl border border-neutral-300 px-5 font-semibold hover:bg-neutral-50 disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void replacePhoto(panel.trackingId)}
                disabled={pending || !photoFile}
                className="min-h-11 rounded-xl bg-teal-800 px-5 font-semibold text-white hover:bg-teal-900 disabled:opacity-60"
              >
                {pending ? "Menyimpan..." : "Simpan foto"}
              </button>
            </div>
          </div>
        )}
        {panel?.type === "marker" && (
          <div className="space-y-4">
            {markerPhotoState === "failed" ? (
              <p role="alert" className="text-sm leading-6 text-rose-700">
                Foto belum dapat dimuat. Tutup lalu coba lagi.
              </p>
            ) : (
              <>
                {markerPhotoState === "loading" && (
                  <div role="status">
                    <div
                      aria-hidden="true"
                      className="h-64 w-full animate-pulse rounded-xl bg-neutral-200"
                    />
                    <span className="sr-only">Memuat foto...</span>
                  </div>
                )}
                <div
                  className={
                    markerPhotoState === "ready" ? "space-y-2" : "hidden"
                  }
                >
                  <p className="text-sm text-neutral-600">
                    Ketuk foto untuk memindahkan penanda.
                  </p>
                  <div className="relative mx-auto w-fit max-w-full">
                    {/* eslint-disable-next-line @next/next/no-img-element -- foto privat dari API */}
                    <img
                      src={`/api/acne-trackings/${encodeURIComponent(panel.trackingId)}/photo`}
                      alt="Foto untuk mengubah penanda"
                      onLoad={() => setMarkerPhotoState("ready")}
                      onError={() => setMarkerPhotoState("failed")}
                      onClick={placeMarkerDraft}
                      className="block max-h-80 max-w-full cursor-crosshair rounded-xl border border-neutral-200"
                    />
                    {markerDraft && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-red-600 bg-red-600/20"
                        style={{
                          left: `${markerDraft.x * 100}%`,
                          top: `${markerDraft.y * 100}%`,
                        }}
                      />
                    )}
                  </div>
                </div>
              </>
            )}
            {formError && (
              <p role="alert" className="text-sm leading-6 text-rose-700">
                {formError}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setPhotoLoadedId(null);
                  setPhotoFailedId(null);
                  setPanel({ type: "detail", trackingId: panel.trackingId });
                }}
                disabled={pending}
                className="min-h-11 rounded-xl border border-neutral-300 px-5 font-semibold hover:bg-neutral-50 disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void saveMarker(panel.trackingId)}
                disabled={
                  pending || markerPhotoState !== "ready" || !markerDraft
                }
                className="min-h-11 rounded-xl bg-teal-800 px-5 font-semibold text-white hover:bg-teal-900 disabled:opacity-60"
              >
                {pending ? "Menyimpan..." : "Simpan penanda"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
