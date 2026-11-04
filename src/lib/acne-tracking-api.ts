import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import sharp from "sharp";
import { auth } from "@/auth";
import {
  AcneLocation,
  PhotoUploadIntentStatus,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { getAcneTrackingHealingUpdate } from "@/lib/acne-tracking-status";
import {
  fingerprintAcneTrackingPhoto,
  getAcneTrackingPhotoReplayAction,
  parseAcneTrackingPhotoRequestKey,
  type AcneTrackingPhotoRequestState,
} from "@/lib/acne-tracking-photo-idempotency";
import {
  acneTrackingListQuerySchema,
  acneTrackingFieldsSchema,
  acneTrackingMetadataSchema,
  parseMarkerCoordinate,
  photoMarkerSchema,
} from "@/lib/validations/acne-tracking";

const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const MAX_INPUT_PIXELS = 4_000_000;
const MAX_OUTPUT_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_SIDE = 1600;
const JAKARTA_TIME_ZONE = "Asia/Jakarta";

type ProcessedPhoto = {
  buffer: Buffer;
  width: number;
  height: number;
};

type UploadForm = {
  photo: File;
  markerX: number;
  markerY: number;
};

export class AcneTrackingApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function logAcneTrackingQueryError(operation: string, error: unknown): void {
  if (!(error instanceof Error)) return;

  const details = error as Error & {
    code?: unknown;
    clientVersion?: unknown;
    meta?: unknown;
  };
  if (typeof details.code !== "string" || !/^P\d{4}$/.test(details.code)) {
    return;
  }

  const metadata: Record<string, string | string[]> = {};
  if (typeof details.meta === "object" && details.meta !== null) {
    const meta = details.meta as Record<string, unknown>;
    for (const key of [
      "modelName",
      "table",
      "column",
      "field_name",
      "constraint",
      "target",
    ]) {
      const value = meta[key];
      if (typeof value === "string") {
        metadata[key] = value;
      } else if (
        Array.isArray(value) &&
        value.every((item): item is string => typeof item === "string")
      ) {
        metadata[key] = value;
      }
    }
  }

  console.error("Acne tracking Prisma query failed:", {
    operation,
    code: details.code,
    clientVersion:
      typeof details.clientVersion === "string"
        ? details.clientVersion
        : undefined,
    metadata,
  });
}

function errorResponse(error: unknown): Response {
  if (error instanceof AcneTrackingApiError) {
    return Response.json(
      { success: false, code: error.code, error: error.message },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  console.error(
    "Acne tracking API failed:",
    error instanceof Error ? error.name : "UnknownError",
  );
  return Response.json(
    {
      success: false,
      code: "INTERNAL_ERROR",
      error: "Terjadi kesalahan saat memproses pemantauan. Silakan coba lagi.",
    },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

export function handleAcneTrackingApiError(error: unknown): Response {
  return errorResponse(error);
}

export async function listAcneTrackings(
  userId: string,
  searchParams: URLSearchParams,
): Promise<Response> {
  const queryEntries = [...searchParams.entries()];
  const hasDuplicateParameters =
    new Set(queryEntries.map(([key]) => key)).size !== queryEntries.length;
  const parsed = acneTrackingListQuerySchema.safeParse(
    Object.fromEntries(queryEntries),
  );
  if (hasDuplicateParameters || !parsed.success) {
    throw new AcneTrackingApiError(
      400,
      "INVALID_INPUT",
      parsed.success
        ? "Parameter query tidak valid."
        : (parsed.error.issues[0]?.message ?? "Parameter query tidak valid."),
    );
  }

  const { status, page: requestedPage = 1, pageSize = 50 } = parsed.data;
  const where = { userId, status };
  let totalCount: number;
  try {
    totalCount = await prisma.acneTracking.count({ where });
  } catch (error) {
    logAcneTrackingQueryError("acneTracking.count", error);
    throw error;
  }
  const totalPages = Math.ceil(totalCount / pageSize);
  const page = totalPages > 0 ? Math.min(requestedPage, totalPages) : 1;
  const fetchRecords = () =>
    prisma.acneTracking.findMany({
      where,
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: pageSize,
      skip: (page - 1) * pageSize,
      select: {
        id: true,
        name: true,
        location: true,
        startedAt: true,
        status: true,
        photoPublicId: true,
      },
    });
  let records: Awaited<ReturnType<typeof fetchRecords>>;
  try {
    records = await fetchRecords();
  } catch (error) {
    logAcneTrackingQueryError("acneTracking.findMany", error);
    throw error;
  }

  return Response.json(
    {
      success: true,
      data: {
        records: records.map(({ photoPublicId, startedAt, ...record }) => ({
          ...record,
          startedAt: startedAt.toISOString().slice(0, 10),
          photoAvailable: photoPublicId !== null,
        })),
        totalCount,
        page,
        pageSize,
        totalPages,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function getAcneTracking(
  trackingId: string,
  userId: string,
): Promise<Response> {
  const record = await prisma.acneTracking.findFirst({
    where: { id: trackingId, userId },
    select: {
      id: true,
      name: true,
      location: true,
      startedAt: true,
      status: true,
      healedDate: true,
      photoPublicId: true,
      photoWidth: true,
      photoHeight: true,
      markerX: true,
      markerY: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!record) {
    throw new AcneTrackingApiError(
      404,
      "NOT_FOUND",
      "Catatan pemantauan tidak ditemukan.",
    );
  }

  const { photoPublicId, startedAt, healedDate, ...recordData } = record;
  return Response.json(
    {
      success: true,
      data: {
        ...recordData,
        startedAt: startedAt.toISOString().slice(0, 10),
        healedDate: healedDate?.toISOString().slice(0, 10) ?? null,
        photoAvailable: photoPublicId !== null,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function updateAcneTrackingMetadata(
  trackingId: string,
  request: Request,
  userId: string,
): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new AcneTrackingApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Permintaan harus menggunakan application/json.",
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AcneTrackingApiError(
      400,
      "INVALID_JSON",
      "Isi permintaan JSON tidak valid.",
    );
  }

  const parsed = acneTrackingMetadataSchema.safeParse(body);
  if (!parsed.success) {
    throw new AcneTrackingApiError(
      400,
      "INVALID_INPUT",
      parsed.error.issues[0]?.message ?? "Data pemantauan tidak valid.",
    );
  }
  const startedAt = parseCalendarDate(parsed.data.startedAt);

  const record = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.acneTracking.updateMany({
      where: { id: trackingId, userId },
      data: {
        name: parsed.data.name,
        location: parsed.data.location as AcneLocation,
        startedAt,
      },
    });
    if (updated.count !== 1) return null;

    return transaction.acneTracking.findFirst({
      where: { id: trackingId, userId },
      select: {
        id: true,
        name: true,
        location: true,
        startedAt: true,
        status: true,
        healedDate: true,
        photoPublicId: true,
        photoWidth: true,
        photoHeight: true,
        markerX: true,
        markerY: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  if (!record) {
    throw new AcneTrackingApiError(
      404,
      "NOT_FOUND",
      "Catatan pemantauan tidak ditemukan.",
    );
  }

  const {
    photoPublicId,
    startedAt: savedStartedAt,
    healedDate,
    ...data
  } = record;
  return Response.json(
    {
      success: true,
      data: {
        ...data,
        startedAt: savedStartedAt.toISOString().slice(0, 10),
        healedDate: healedDate?.toISOString().slice(0, 10) ?? null,
        photoAvailable: photoPublicId !== null,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function markAcneTrackingHealed(
  trackingId: string,
  userId: string,
): Promise<Response> {
  const record = await prisma.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<
      Array<{ status: "ACTIVE" | "HEALED" }>
    >`
      SELECT "status"
      FROM "AcneTracking"
      WHERE "id" = ${trackingId} AND "userId" = ${userId}
      FOR UPDATE
    `;
    if (rows.length !== 1) return null;

    const update = getAcneTrackingHealingUpdate(
      rows[0].status,
      parseCalendarDate(undefined),
    );
    if (update) {
      const result = await transaction.acneTracking.updateMany({
        where: { id: trackingId, userId, status: "ACTIVE" },
        data: update,
      });
      if (result.count !== 1) return null;
    }

    return transaction.acneTracking.findFirst({
      where: { id: trackingId, userId },
      select: {
        id: true,
        name: true,
        location: true,
        startedAt: true,
        status: true,
        healedDate: true,
        photoPublicId: true,
        photoWidth: true,
        photoHeight: true,
        markerX: true,
        markerY: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  if (!record) {
    throw new AcneTrackingApiError(
      404,
      "NOT_FOUND",
      "Catatan pemantauan tidak ditemukan.",
    );
  }

  const { photoPublicId, startedAt, healedDate, ...data } = record;
  return Response.json(
    {
      success: true,
      data: {
        ...data,
        startedAt: startedAt.toISOString().slice(0, 10),
        healedDate: healedDate?.toISOString().slice(0, 10) ?? null,
        photoAvailable: photoPublicId !== null,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function requireAcneTrackingUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0) {
    throw new AcneTrackingApiError(
      401,
      "UNAUTHENTICATED",
      "Silakan masuk untuk mengelola pemantauan.",
    );
  }
  return userId;
}

export function requireAcneTrackingSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    throw new AcneTrackingApiError(
      403,
      "INVALID_ORIGIN",
      "Asal permintaan tidak diizinkan.",
    );
  }

  let parsedOrigin: URL;
  let requestOrigin: string;
  try {
    parsedOrigin = new URL(origin);
    requestOrigin = new URL(request.url).origin;
  } catch {
    throw new AcneTrackingApiError(
      403,
      "INVALID_ORIGIN",
      "Asal permintaan tidak diizinkan.",
    );
  }
  if (parsedOrigin.origin !== requestOrigin) {
    throw new AcneTrackingApiError(
      403,
      "INVALID_ORIGIN",
      "Asal permintaan tidak diizinkan.",
    );
  }
}

function cloudinaryClient() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new AcneTrackingApiError(
      503,
      "STORAGE_UNAVAILABLE",
      "Penyimpanan foto belum dikonfigurasi.",
    );
  }
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
  return cloudinary;
}

function assertContentLength(request: Request): void {
  const contentLength = request.headers.get("content-length");
  if (contentLength === null) return;
  if (!/^\d+$/.test(contentLength)) {
    throw new AcneTrackingApiError(
      400,
      "INVALID_CONTENT_LENGTH",
      "Ukuran permintaan tidak valid.",
    );
  }
  if (Number(contentLength) > MAX_REQUEST_BYTES) {
    throw new AcneTrackingApiError(
      413,
      "REQUEST_TOO_LARGE",
      "Ukuran permintaan melebihi batas.",
    );
  }
}

async function readBoundedMultipart(request: Request): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;\s*boundary=/i.test(contentType)) {
    throw new AcneTrackingApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Permintaan harus menggunakan multipart/form-data.",
    );
  }
  try {
    assertContentLength(request);
  } catch (error) {
    await request.body?.cancel().catch(() => undefined);
    throw error;
  }
  if (!request.body) {
    throw new AcneTrackingApiError(400, "EMPTY_BODY", "Isi permintaan kosong.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let exceededLimit = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BYTES) {
        exceededLimit = true;
        throw new AcneTrackingApiError(
          413,
          "REQUEST_TOO_LARGE",
          "Ukuran permintaan melebihi batas.",
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    if (exceededLimit) {
      await reader.cancel().catch(() => undefined);
    }
    throw error;
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return await new Request("http://localhost/upload", {
      method: "POST",
      headers: { "content-type": contentType },
      body,
    }).formData();
  } catch {
    throw new AcneTrackingApiError(
      400,
      "INVALID_MULTIPART",
      "Formulir unggahan tidak valid.",
    );
  }
}

function assertAllowedFields(form: FormData, allowed: string[]): void {
  for (const [key] of form.entries()) {
    if (!allowed.includes(key)) {
      throw new AcneTrackingApiError(
        400,
        "UNEXPECTED_FIELD",
        "Formulir berisi kolom yang tidak dikenal.",
      );
    }
  }
}

function singleTextField(form: FormData, name: string): string | null {
  const entries = form.getAll(name);
  if (
    entries.length > 1 ||
    (entries.length === 1 && typeof entries[0] !== "string")
  ) {
    throw new AcneTrackingApiError(
      400,
      "INVALID_FIELD",
      "Kolom formulir tidak valid.",
    );
  }
  return typeof entries[0] === "string" ? entries[0] : null;
}

function singleFileField(form: FormData, name: string): File | null {
  const entries = form.getAll(name);
  if (
    entries.length > 1 ||
    (entries.length === 1 && typeof entries[0] === "string")
  ) {
    throw new AcneTrackingApiError(
      400,
      "INVALID_FILE_FIELD",
      "Kolom foto tidak valid.",
    );
  }
  return entries[0] instanceof File ? entries[0] : null;
}

function parseUploadForm(
  form: FormData,
  allowedFields: string[] = ["photo", "markerX", "markerY"],
): UploadForm {
  assertAllowedFields(form, allowedFields);
  const photo = singleFileField(form, "photo");
  const markerX = parseMarkerCoordinate(singleTextField(form, "markerX"));
  const markerY = parseMarkerCoordinate(singleTextField(form, "markerY"));
  if (!photo || photo.size === 0) {
    throw new AcneTrackingApiError(
      400,
      "PHOTO_REQUIRED",
      "Foto wajib dipilih.",
    );
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    throw new AcneTrackingApiError(
      413,
      "PHOTO_TOO_LARGE",
      "Ukuran foto maksimal 3 MB.",
    );
  }
  const marker = photoMarkerSchema.safeParse({ markerX, markerY });
  if (!marker.success) {
    throw new AcneTrackingApiError(
      400,
      "INVALID_MARKER",
      "Tentukan satu marker dengan koordinat antara 0 dan 1.",
    );
  }
  return { photo, ...marker.data };
}

function jakartaToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function parseCalendarDate(value: string | undefined): Date {
  const dateString = value ?? jakartaToday();
  const parsed = new Date(`${dateString}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== dateString ||
    dateString > jakartaToday()
  ) {
    throw new AcneTrackingApiError(
      400,
      "INVALID_STARTED_AT",
      "Tanggal mulai tidak valid atau berada di masa depan.",
    );
  }
  return parsed;
}

async function processPhoto(file: File): Promise<ProcessedPhoto> {
  let input: Buffer;
  try {
    input = Buffer.from(await file.arrayBuffer());
  } catch {
    throw new AcneTrackingApiError(
      400,
      "INVALID_IMAGE",
      "Berkas foto tidak dapat dibaca.",
    );
  }
  if (input.byteLength === 0 || input.byteLength > MAX_PHOTO_BYTES) {
    throw new AcneTrackingApiError(
      413,
      "PHOTO_TOO_LARGE",
      "Ukuran foto maksimal 3 MB.",
    );
  }

  try {
    const image = sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
      pages: 1,
      sequentialRead: true,
    });
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > MAX_INPUT_PIXELS ||
      !["jpeg", "png", "webp"].includes(metadata.format ?? "") ||
      (metadata.pages ?? 1) !== 1
    ) {
      throw new Error("Unsupported image");
    }

    const { data, info } = await image
      .rotate()
      .resize({
        width: MAX_IMAGE_SIDE,
        height: MAX_IMAGE_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer({ resolveWithObject: true });

    if (
      data.byteLength > MAX_OUTPUT_BYTES ||
      info.width < 1 ||
      info.height < 1 ||
      info.width > MAX_IMAGE_SIDE ||
      info.height > MAX_IMAGE_SIDE
    ) {
      throw new Error("Processed image exceeds limits");
    }
    return { buffer: data, width: info.width, height: info.height };
  } catch {
    throw new AcneTrackingApiError(
      400,
      "INVALID_IMAGE",
      "Foto harus berupa JPEG, PNG, atau WebP yang valid dan tidak melebihi batas dimensi.",
    );
  }
}

function uploadToCloudinary(
  photo: ProcessedPhoto,
  publicId: string,
): Promise<UploadApiResponse> {
  const client = cloudinaryClient();
  return new Promise((resolve, reject) => {
    const uploadStream = client.uploader.upload_stream(
      {
        public_id: publicId,
        overwrite: false,
        unique_filename: false,
        use_filename: false,
        resource_type: "image",
        type: "authenticated",
        format: "jpg",
        allowed_formats: ["jpg"],
      },
      (error, result) => {
        if (error) {
          reject(
            new AcneTrackingApiError(
              502,
              "PHOTO_UPLOAD_FAILED",
              "Foto belum dapat diunggah. Silakan coba lagi.",
            ),
          );
          return;
        }
        if (
          !result ||
          result.public_id !== publicId ||
          result.format !== "jpg" ||
          result.type !== "authenticated" ||
          result.width !== photo.width ||
          result.height !== photo.height
        ) {
          reject(
            new AcneTrackingApiError(
              502,
              "PHOTO_UPLOAD_UNVERIFIED",
              "Hasil unggahan foto tidak dapat diverifikasi.",
            ),
          );
          return;
        }
        resolve(result);
      },
    );
    Readable.from(photo.buffer).pipe(uploadStream);
    uploadStream.on("error", () => {
      reject(
        new AcneTrackingApiError(
          502,
          "PHOTO_UPLOAD_FAILED",
          "Foto belum dapat diunggah. Silakan coba lagi.",
        ),
      );
    });
  });
}

function partialCreateResponse(
  tracking: { id: string },
  fields: ReturnType<typeof parseCreateFields>,
  photoUploadStatus: "FAILED" | "RECOVERY_PENDING",
  photoAvailable: boolean | null = false,
): Response {
  return Response.json(
    {
      success: true,
      data: {
        id: tracking.id,
        name: fields.name,
        location: fields.location,
        startedAt: fields.startedAt.toISOString().slice(0, 10),
        status: "ACTIVE",
        photoAvailable,
        photoUploadStatus,
      },
      warning:
        "Catatan tersimpan, tetapi status foto belum berhasil dipastikan. Muat ulang catatan sebelum mencoba lagi.",
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

function createRequestFingerprint(
  fields: ReturnType<typeof parseCreateFields>,
  photo: ProcessedPhoto | null,
  markerX: number | null,
  markerY: number | null,
): string {
  const hash = createHash("sha256");
  hash.update(
    JSON.stringify({
      name: fields.name,
      location: fields.location,
      startedAt: fields.startedAtProvided
        ? fields.startedAt.toISOString()
        : null,
      startedAtProvided: fields.startedAtProvided,
      markerX,
      markerY,
      photoAvailable: photo !== null,
    }),
  );
  if (photo) hash.update(photo.buffer);
  return hash.digest("hex");
}

function parseCreateRequestKey(request: Request): string {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new AcneTrackingApiError(
      400,
      "INVALID_IDEMPOTENCY_KEY",
      "Kunci idempotensi wajib diisi dan tidak valid.",
    );
  }
  return key;
}

async function replayCreateRequest(
  userId: string,
  requestKey: string,
  fingerprint: string,
): Promise<Response | null> {
  let createRequest: { fingerprint: string; trackingId: string } | null;
  try {
    createRequest = await prisma.acneTrackingCreateRequest.findUnique({
      where: {
        userId_requestKey: { userId, requestKey },
      },
      select: {
        fingerprint: true,
        trackingId: true,
      },
    });
  } catch (error) {
    logAcneTrackingQueryError("acneTrackingCreateRequest.findUnique", error);
    throw error;
  }
  if (!createRequest) return null;
  if (createRequest.fingerprint !== fingerprint) {
    throw new AcneTrackingApiError(
      409,
      "IDEMPOTENCY_KEY_REUSED",
      "Kunci idempotensi sudah digunakan untuk data yang berbeda.",
    );
  }

  const record = await prisma.acneTracking.findFirst({
    where: { id: createRequest.trackingId, userId },
    select: {
      id: true,
      name: true,
      location: true,
      startedAt: true,
      status: true,
      photoPublicId: true,
      photoWidth: true,
      photoHeight: true,
      markerX: true,
      markerY: true,
      photoUploadIntents: {
        select: { status: true },
      },
    },
  });
  if (!record) {
    throw new AcneTrackingApiError(
      410,
      "CREATE_RESOURCE_DELETED",
      "Catatan yang terkait dengan permintaan ini sudah tidak tersedia.",
    );
  }

  const intentStatuses = new Set(
    record.photoUploadIntents.map((intent) => intent.status),
  );
  const photoUploadStatus =
    intentStatuses.size === 0
      ? undefined
      : intentStatuses.has(PhotoUploadIntentStatus.PENDING)
        ? "RECOVERY_PENDING"
        : "FAILED";
  const data = {
    id: record.id,
    name: record.name,
    location: record.location,
    startedAt: record.startedAt.toISOString().slice(0, 10),
    status: record.status,
    photoAvailable: record.photoPublicId !== null,
    ...(record.photoPublicId
      ? {
          photoWidth: record.photoWidth,
          photoHeight: record.photoHeight,
          markerX: record.markerX,
          markerY: record.markerY,
        }
      : {}),
    ...(!record.photoPublicId && photoUploadStatus
      ? { photoUploadStatus }
      : {}),
  };
  return Response.json(
    { success: true, data },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

function newPublicId(): string {
  return `jawhan/acne/${randomUUID()}`;
}

function parseCreateFields(form: FormData) {
  assertAllowedFields(form, [
    "name",
    "location",
    "startedAt",
    "photo",
    "markerX",
    "markerY",
  ]);
  const parsed = acneTrackingFieldsSchema.safeParse({
    name: singleTextField(form, "name"),
    location: singleTextField(form, "location"),
    startedAt: singleTextField(form, "startedAt") ?? undefined,
  });
  if (!parsed.success) {
    throw new AcneTrackingApiError(
      400,
      "INVALID_INPUT",
      parsed.error.issues[0]?.message ?? "Data pemantauan tidak valid.",
    );
  }
  return {
    ...parsed.data,
    startedAt: parseCalendarDate(parsed.data.startedAt),
    startedAtProvided: parsed.data.startedAt !== undefined,
  };
}

export async function createAcneTracking(
  request: Request,
  userId: string,
): Promise<Response> {
  const form = await readBoundedMultipart(request);
  const fields = parseCreateFields(form);
  const requestKey = parseCreateRequestKey(request);
  const hasPhoto = form.has("photo");
  let uploadForm: UploadForm | null = null;
  let processedPhoto: ProcessedPhoto | null = null;
  if (hasPhoto) {
    uploadForm = parseUploadForm(form, [
      "name",
      "location",
      "startedAt",
      "photo",
      "markerX",
      "markerY",
    ]);
    processedPhoto = await processPhoto(uploadForm.photo);
  } else if (form.has("markerX") || form.has("markerY")) {
    throw new AcneTrackingApiError(
      400,
      "MARKER_WITHOUT_PHOTO",
      "Marker hanya dapat disimpan bersama foto.",
    );
  }

  const fingerprint = createRequestFingerprint(
    fields,
    processedPhoto,
    uploadForm?.markerX ?? null,
    uploadForm?.markerY ?? null,
  );
  const existingResponse = await replayCreateRequest(
    userId,
    requestKey,
    fingerprint,
  );
  if (existingResponse) return existingResponse;

  if (!processedPhoto || !uploadForm) {
    try {
      const record = await prisma.$transaction(async (transaction) => {
        const created = await transaction.acneTracking.create({
          data: {
            userId,
            name: fields.name,
            location: fields.location as AcneLocation,
            startedAt: fields.startedAt,
          },
          select: {
            id: true,
            name: true,
            location: true,
            startedAt: true,
            status: true,
          },
        });
        await transaction.acneTrackingCreateRequest.create({
          data: {
            userId,
            requestKey,
            fingerprint,
            trackingId: created.id,
          },
        });
        return created;
      });
      return Response.json(
        {
          success: true,
          data: {
            ...record,
            startedAt: record.startedAt.toISOString().slice(0, 10),
            photoAvailable: false,
          },
        },
        { status: 201, headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      const replay = await replayCreateRequest(userId, requestKey, fingerprint);
      if (replay) return replay;
      logAcneTrackingQueryError("acneTracking.create.transaction", error);
      throw error;
    }
  }

  const publicId = newPublicId();
  let tracking: { id: string };
  let intent: { id: string };
  try {
    ({ tracking, intent } = await prisma.$transaction(async (transaction) => {
      const record = await transaction.acneTracking.create({
        data: {
          userId,
          name: fields.name,
          location: fields.location as AcneLocation,
          startedAt: fields.startedAt,
        },
        select: { id: true },
      });
      await transaction.acneTrackingCreateRequest.create({
        data: {
          userId,
          requestKey,
          fingerprint,
          trackingId: record.id,
        },
      });
      const uploadIntent = await transaction.photoUploadIntent.create({
        data: { userId, acneTrackingId: record.id, publicId },
      });
      return { tracking: record, intent: uploadIntent };
    }));
  } catch (error) {
    const replay = await replayCreateRequest(userId, requestKey, fingerprint);
    if (replay) return replay;
    logAcneTrackingQueryError(
      "acneTracking.createWithPhoto.transaction",
      error,
    );
    throw error;
  }

  try {
    await uploadToCloudinary(processedPhoto, publicId);
  } catch {
    return partialCreateResponse(tracking, fields, "RECOVERY_PENDING");
  }

  try {
    await prisma.$transaction(async (transaction) => {
      const lockedIntent = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "PhotoUploadIntent"
        WHERE "id" = ${intent.id}
          AND "userId" = ${userId}
          AND "acneTrackingId" = ${tracking.id}
          AND "publicId" = ${publicId}
          AND "status" = 'PENDING'
        FOR UPDATE
      `;
      if (lockedIntent.length !== 1) {
        throw new AcneTrackingApiError(
          409,
          "UPLOAD_INTENT_CHANGED",
          "Unggahan tidak dapat ditautkan ke catatan.",
        );
      }

      const { count } = await transaction.acneTracking.updateMany({
        where: { id: tracking.id, userId, photoPublicId: null },
        data: {
          photoPublicId: publicId,
          photoWidth: processedPhoto.width,
          photoHeight: processedPhoto.height,
          markerX: uploadForm.markerX,
          markerY: uploadForm.markerY,
        },
      });
      if (count !== 1) {
        throw new AcneTrackingApiError(
          404,
          "NOT_FOUND",
          "Catatan pemantauan tidak ditemukan.",
        );
      }
      await transaction.photoUploadIntent.deleteMany({
        where: {
          id: intent.id,
          userId,
          acneTrackingId: tracking.id,
          status: PhotoUploadIntentStatus.PENDING,
        },
      });
    });
  } catch (finalizeError) {
    try {
      const recovery = await prisma.$transaction(async (transaction) => {
        const rows = await transaction.$queryRaw<
          Array<{ photoPublicId: string | null }>
        >`
          SELECT "photoPublicId"
          FROM "AcneTracking"
          WHERE "id" = ${tracking.id} AND "userId" = ${userId}
          FOR UPDATE
        `;
        const intents = await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "PhotoUploadIntent"
          WHERE "id" = ${intent.id}
            AND "userId" = ${userId}
            AND "publicId" = ${publicId}
          FOR UPDATE
        `;
        if (rows[0]?.photoPublicId === publicId) {
          await transaction.photoUploadIntent.deleteMany({
            where: { id: intent.id, userId, publicId },
          });
          return "LINKED" as const;
        }
        if (intents.length === 1) {
          await transaction.cloudinaryCleanupJob.upsert({
            where: { publicId },
            create: { publicId },
            update: {},
          });
          await transaction.photoUploadIntent.update({
            where: { id: intent.id },
            data: { status: PhotoUploadIntentStatus.CLEANUP_QUEUED },
          });
        }
        return "NOT_LINKED" as const;
      });
      if (recovery === "LINKED") {
        return Response.json(
          {
            success: true,
            data: {
              id: tracking.id,
              name: fields.name,
              location: fields.location,
              startedAt: fields.startedAt.toISOString().slice(0, 10),
              status: "ACTIVE",
              photoAvailable: true,
              photoWidth: processedPhoto.width,
              photoHeight: processedPhoto.height,
              markerX: uploadForm.markerX,
              markerY: uploadForm.markerY,
            },
            warning: "Foto tersimpan; status operasi telah dipulihkan.",
          },
          { status: 201, headers: { "Cache-Control": "no-store" } },
        );
      }
      return partialCreateResponse(tracking, fields, "FAILED");
    } catch (recoveryError) {
      console.error(
        "Acne tracking photo finalization recovery is pending:",
        recoveryError instanceof Error
          ? recoveryError.name
          : finalizeError instanceof Error
            ? finalizeError.name
            : "UnknownError",
      );
      return partialCreateResponse(tracking, fields, "RECOVERY_PENDING", null);
    }
  }

  return Response.json(
    {
      success: true,
      data: {
        id: tracking.id,
        name: fields.name,
        location: fields.location,
        startedAt: fields.startedAt.toISOString().slice(0, 10),
        status: "ACTIVE",
        photoAvailable: true,
        photoWidth: processedPhoto.width,
        photoHeight: processedPhoto.height,
        markerX: uploadForm.markerX,
        markerY: uploadForm.markerY,
      },
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

export async function replaceAcneTrackingPhoto(
  trackingId: string,
  request: Request,
  userId: string,
): Promise<Response> {
  const requestKey = parseAcneTrackingPhotoRequestKey(
    request.headers.get("idempotency-key"),
  );
  if (!requestKey) {
    throw new AcneTrackingApiError(
      400,
      "INVALID_IDEMPOTENCY_KEY",
      "Kunci idempotensi wajib diisi dan tidak valid.",
    );
  }

  const form = await readBoundedMultipart(request);
  const upload = parseUploadForm(form);
  const photo = await processPhoto(upload.photo);
  const fingerprint = fingerprintAcneTrackingPhoto(
    photo.buffer,
    upload.markerX,
    upload.markerY,
  );

  type PhotoRequestLedger = {
    id: string;
    fingerprint: string;
    status: AcneTrackingPhotoRequestState;
    intentId: string | null;
    photoWidth: number | null;
    photoHeight: number | null;
    markerX: number | null;
    markerY: number | null;
    failureCode: string | null;
  };

  const claim = await prisma.$transaction(async (transaction) => {
    const findLedger = () => transaction.$queryRaw<PhotoRequestLedger[]>`
      SELECT
        "id",
        "fingerprint",
        "status"::text AS "status",
        "intentId",
        "photoWidth",
        "photoHeight",
        "markerX",
        "markerY",
        "failureCode"
      FROM "AcneTrackingPhotoRequest"
      WHERE "userId" = ${userId}
        AND "trackingId" = ${trackingId}
        AND "requestKey" = ${requestKey}
      FOR UPDATE
    `;
    const rows = await transaction.$queryRaw<
      Array<{ photoPublicId: string | null }>
    >`
      SELECT "photoPublicId"
      FROM "AcneTracking"
      WHERE "id" = ${trackingId} AND "userId" = ${userId}
      FOR UPDATE
    `;
    if (rows.length !== 1) {
      const existing = await findLedger();
      if (existing.length === 1) {
        return { kind: "EXISTING" as const, ledger: existing[0] };
      }
      throw new AcneTrackingApiError(
        404,
        "NOT_FOUND",
        "Catatan pemantauan tidak ditemukan.",
      );
    }

    const existing = await findLedger();
    if (existing.length === 1) {
      return { kind: "EXISTING" as const, ledger: existing[0] };
    }

    const publicId = newPublicId();
    const intent = await transaction.photoUploadIntent.create({
      data: { userId, acneTrackingId: trackingId, publicId },
    });
    const ledgerId = randomUUID();
    const inserted = await transaction.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "AcneTrackingPhotoRequest" (
        "id",
        "userId",
        "trackingId",
        "requestKey",
        "fingerprint",
        "status",
        "intentId",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${ledgerId},
        ${userId},
        ${trackingId},
        ${requestKey},
        ${fingerprint},
        'PENDING',
        ${intent.id},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("userId", "trackingId", "requestKey") DO NOTHING
      RETURNING "id"
    `;
    if (inserted.length !== 1) {
      await transaction.photoUploadIntent.delete({ where: { id: intent.id } });
      const raced = await findLedger();
      if (raced.length !== 1) {
        throw new Error("Photo request claim conflict without a ledger row.");
      }
      return { kind: "EXISTING" as const, ledger: raced[0] };
    }

    return {
      kind: "CLAIMED" as const,
      ledgerId,
      intentId: intent.id,
      publicId,
      previousPublicId: rows[0].photoPublicId,
    };
  });

  const replayLedger = (ledger: PhotoRequestLedger): Response => {
    const action = getAcneTrackingPhotoReplayAction(
      ledger.fingerprint,
      fingerprint,
      ledger.status,
    );
    if (action === "KEY_REUSED") {
      throw new AcneTrackingApiError(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "Kunci idempotensi sudah digunakan untuk data yang berbeda.",
      );
    }
    if (action === "IN_PROGRESS") {
      throw new AcneTrackingApiError(
        409,
        "OPERATION_IN_PROGRESS",
        "Operasi foto dengan kunci ini masih diproses.",
      );
    }
    if (action === "REPLAY_FAILED") {
      if (ledger.failureCode === "PHOTO_CHANGED") {
        throw new AcneTrackingApiError(
          409,
          "PHOTO_CHANGED",
          "Foto catatan berubah selama unggahan. Muat ulang lalu coba lagi.",
        );
      }
      if (ledger.failureCode === "NOT_FOUND") {
        throw new AcneTrackingApiError(
          404,
          "NOT_FOUND",
          "Catatan pemantauan tidak ditemukan.",
        );
      }
      throw new AcneTrackingApiError(
        500,
        "PHOTO_OPERATION_FAILED",
        "Operasi foto gagal dan tidak dapat dipulihkan.",
      );
    }
    return Response.json(
      {
        success: true,
        data: {
          photoAvailable: true,
          photoWidth: ledger.photoWidth,
          photoHeight: ledger.photoHeight,
          markerX: ledger.markerX,
          markerY: ledger.markerY,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  };

  if (claim.kind === "EXISTING") {
    return replayLedger(claim.ledger);
  }

  try {
    await uploadToCloudinary(photo, claim.publicId);
  } catch {
    // A failed response does not prove that the remote asset was not created.
    throw new AcneTrackingApiError(
      502,
      "PHOTO_UPLOAD_UNCERTAIN",
      "Status unggahan belum dapat dipastikan. Operasi tidak akan diulang otomatis.",
    );
  }

  const finalized = await prisma.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<
      Array<{ photoPublicId: string | null }>
    >`
      SELECT "photoPublicId"
      FROM "AcneTracking"
      WHERE "id" = ${trackingId} AND "userId" = ${userId}
      FOR UPDATE
    `;
    const intents = await transaction.$queryRaw<
      Array<{ id: string; publicId: string }>
    >`
      SELECT "id", "publicId"
      FROM "PhotoUploadIntent"
      WHERE "id" = ${claim.intentId}
        AND "userId" = ${userId}
        AND "publicId" = ${claim.publicId}
        AND "status" = 'PENDING'
      FOR UPDATE
    `;
    const ledgers = await transaction.$queryRaw<
      Array<{ status: string; fingerprint: string; intentId: string | null }>
    >`
      SELECT "status"::text AS "status", "fingerprint", "intentId"
      FROM "AcneTrackingPhotoRequest"
      WHERE "id" = ${claim.ledgerId}
        AND "userId" = ${userId}
        AND "trackingId" = ${trackingId}
        AND "requestKey" = ${requestKey}
      FOR UPDATE
    `;
    if (
      intents.length !== 1 ||
      ledgers.length !== 1 ||
      ledgers[0].status !== "PENDING" ||
      ledgers[0].fingerprint !== fingerprint ||
      ledgers[0].intentId !== claim.intentId
    ) {
      throw new Error("Photo request state changed before finalization.");
    }

    const isRecordMissing = rows.length !== 1;
    const hasExpectedPhoto =
      !isRecordMissing && rows[0].photoPublicId === claim.previousPublicId;
    if (!hasExpectedPhoto) {
      const references = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "AcneTracking"
        WHERE "photoPublicId" = ${claim.publicId}
        FOR UPDATE
      `;
      if (references.length !== 0) {
        throw new Error("Uploaded photo is already referenced by a record.");
      }

      await transaction.cloudinaryCleanupJob.upsert({
        where: { publicId: claim.publicId },
        create: { publicId: claim.publicId },
        update: {},
      });
      await transaction.photoUploadIntent.update({
        where: { id: claim.intentId },
        data: { status: PhotoUploadIntentStatus.CLEANUP_QUEUED },
      });
      const failedLedgerCount = await transaction.$executeRaw`
        UPDATE "AcneTrackingPhotoRequest"
        SET "status" = 'FAILED',
            "failureCode" = ${isRecordMissing ? "NOT_FOUND" : "PHOTO_CHANGED"},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${claim.ledgerId}
          AND "status" = 'PENDING'
      `;
      if (failedLedgerCount !== 1) {
        throw new Error("Photo request ledger could not be marked failed.");
      }
      return isRecordMissing
        ? ("NOT_FOUND" as const)
        : ("PHOTO_CHANGED" as const);
    }

    if (claim.previousPublicId) {
      await transaction.cloudinaryCleanupJob.upsert({
        where: { publicId: claim.previousPublicId },
        create: { publicId: claim.previousPublicId },
        update: {},
      });
    }
    await transaction.acneTracking.update({
      where: { id: trackingId },
      data: {
        photoPublicId: claim.publicId,
        photoWidth: photo.width,
        photoHeight: photo.height,
        markerX: upload.markerX,
        markerY: upload.markerY,
      },
    });
    const completedLedgerCount = await transaction.$executeRaw`
      UPDATE "AcneTrackingPhotoRequest"
      SET "status" = 'COMPLETED',
          "photoWidth" = ${photo.width},
          "photoHeight" = ${photo.height},
          "markerX" = ${upload.markerX},
          "markerY" = ${upload.markerY},
          "failureCode" = NULL,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${claim.ledgerId}
        AND "status" = 'PENDING'
    `;
    if (completedLedgerCount !== 1) {
      throw new Error("Photo request ledger could not be marked completed.");
    }
    await transaction.photoUploadIntent.delete({
      where: { id: claim.intentId },
    });
    return "COMPLETED" as const;
  });

  if (finalized !== "COMPLETED") {
    if (finalized === "NOT_FOUND") {
      throw new AcneTrackingApiError(
        404,
        "NOT_FOUND",
        "Catatan pemantauan tidak ditemukan.",
      );
    }
    throw new AcneTrackingApiError(
      409,
      "PHOTO_CHANGED",
      "Foto catatan berubah selama unggahan. Muat ulang lalu coba lagi.",
    );
  }

  return Response.json(
    {
      success: true,
      data: {
        photoAvailable: true,
        photoWidth: photo.width,
        photoHeight: photo.height,
        markerX: upload.markerX,
        markerY: upload.markerY,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function removeAcneTrackingPhoto(
  trackingId: string,
  userId: string,
): Promise<Response> {
  const result = await prisma.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<
      Array<{ photoPublicId: string | null }>
    >`
      SELECT "photoPublicId"
      FROM "AcneTracking"
      WHERE "id" = ${trackingId} AND "userId" = ${userId}
      FOR UPDATE
    `;
    if (rows.length !== 1) return "NOT_FOUND" as const;
    const photoPublicId = rows[0].photoPublicId;
    if (!photoPublicId) return "NO_PHOTO" as const;

    await transaction.cloudinaryCleanupJob.upsert({
      where: { publicId: photoPublicId },
      create: { publicId: photoPublicId },
      update: {},
    });
    await transaction.acneTracking.update({
      where: { id: trackingId },
      data: {
        photoPublicId: null,
        photoWidth: null,
        photoHeight: null,
        markerX: null,
        markerY: null,
      },
    });
    return "REMOVED" as const;
  });

  if (result === "NOT_FOUND") {
    throw new AcneTrackingApiError(
      404,
      "NOT_FOUND",
      "Catatan pemantauan tidak ditemukan.",
    );
  }
  return Response.json(
    { success: true, data: { photoRemoved: result === "REMOVED" } },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function updateAcneTrackingPhotoMarker(
  trackingId: string,
  request: Request,
  userId: string,
): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new AcneTrackingApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Permintaan harus menggunakan application/json.",
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AcneTrackingApiError(
      400,
      "INVALID_JSON",
      "Isi permintaan JSON tidak valid.",
    );
  }

  const parsed = photoMarkerSchema.strict().safeParse(body);
  if (!parsed.success) {
    throw new AcneTrackingApiError(
      400,
      "INVALID_MARKER",
      "Tentukan satu marker dengan koordinat antara 0 dan 1.",
    );
  }

  const result = await prisma.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<
      Array<{ photoPublicId: string | null }>
    >`
      SELECT "photoPublicId"
      FROM "AcneTracking"
      WHERE "id" = ${trackingId} AND "userId" = ${userId}
      FOR UPDATE
    `;
    if (rows.length !== 1) return "NOT_FOUND" as const;
    if (!rows[0].photoPublicId) return "NO_PHOTO" as const;

    await transaction.acneTracking.update({
      where: { id: trackingId },
      data: { markerX: parsed.data.markerX, markerY: parsed.data.markerY },
    });
    return "UPDATED" as const;
  });

  if (result === "NOT_FOUND") {
    throw new AcneTrackingApiError(
      404,
      "NOT_FOUND",
      "Catatan pemantauan tidak ditemukan.",
    );
  }
  if (result === "NO_PHOTO") {
    throw new AcneTrackingApiError(
      404,
      "PHOTO_NOT_FOUND",
      "Foto tidak ditemukan.",
    );
  }
  return Response.json(
    {
      success: true,
      data: {
        photoAvailable: true,
        markerX: parsed.data.markerX,
        markerY: parsed.data.markerY,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function deleteAcneTracking(
  trackingId: string,
  userId: string,
): Promise<Response> {
  const deleted = await prisma.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<
      Array<{ photoPublicId: string | null }>
    >`
      SELECT "photoPublicId"
      FROM "AcneTracking"
      WHERE "id" = ${trackingId} AND "userId" = ${userId}
      FOR UPDATE
    `;
    if (rows.length !== 1) return false;
    if (rows[0].photoPublicId) {
      await transaction.cloudinaryCleanupJob.upsert({
        where: { publicId: rows[0].photoPublicId },
        create: { publicId: rows[0].photoPublicId },
        update: {},
      });
    }
    const result = await transaction.acneTracking.deleteMany({
      where: { id: trackingId, userId },
    });
    return result.count === 1;
  });

  if (!deleted) {
    throw new AcneTrackingApiError(
      404,
      "NOT_FOUND",
      "Catatan pemantauan tidak ditemukan.",
    );
  }
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function readAcneTrackingPhoto(
  trackingId: string,
  userId: string,
): Promise<Response> {
  const record = await prisma.acneTracking.findFirst({
    where: { id: trackingId, userId },
    select: { photoPublicId: true },
  });
  if (!record) {
    throw new AcneTrackingApiError(
      404,
      "NOT_FOUND",
      "Catatan pemantauan tidak ditemukan.",
    );
  }
  if (!record.photoPublicId) {
    throw new AcneTrackingApiError(
      404,
      "PHOTO_NOT_FOUND",
      "Foto tidak ditemukan.",
    );
  }

  const client = cloudinaryClient();
  const signedUrl = client.utils.private_download_url(
    record.photoPublicId,
    "jpg",
    {
      resource_type: "image",
      type: "authenticated",
      expires_at: Math.floor(Date.now() / 1000) + 60,
    },
  );
  let upstream: Response;
  try {
    upstream = await fetch(signedUrl, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AcneTrackingApiError(
      502,
      "PHOTO_UNAVAILABLE",
      "Foto belum dapat dimuat. Silakan coba lagi.",
    );
  }
  if (!upstream.ok || !upstream.body) {
    throw new AcneTrackingApiError(
      502,
      "PHOTO_UNAVAILABLE",
      "Foto belum dapat dimuat. Silakan coba lagi.",
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  const contentLength = upstream.headers.get("content-length");
  if (!/^image\/jpeg(?:\s*;|$)/i.test(contentType)) {
    await upstream.body.cancel();
    throw new AcneTrackingApiError(
      502,
      "PHOTO_UNAVAILABLE",
      "Foto belum dapat dimuat. Silakan coba lagi.",
    );
  }
  if (
    contentLength !== null &&
    (!/^\d+$/.test(contentLength) ||
      Number(contentLength) < 1 ||
      Number(contentLength) > MAX_OUTPUT_BYTES)
  ) {
    await upstream.body.cancel();
    throw new AcneTrackingApiError(
      502,
      "PHOTO_UNAVAILABLE",
      "Foto belum dapat dimuat. Silakan coba lagi.",
    );
  }

  const reader = upstream.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_OUTPUT_BYTES) {
        throw new AcneTrackingApiError(
          502,
          "PHOTO_UNAVAILABLE",
          "Foto belum dapat dimuat. Silakan coba lagi.",
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof AcneTrackingApiError) throw error;
    throw new AcneTrackingApiError(
      502,
      "PHOTO_UNAVAILABLE",
      "Foto belum dapat dimuat. Silakan coba lagi.",
    );
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (
    bytes.byteLength < 4 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff ||
    bytes[bytes.byteLength - 2] !== 0xff ||
    bytes[bytes.byteLength - 1] !== 0xd9
  ) {
    throw new AcneTrackingApiError(
      502,
      "PHOTO_UNAVAILABLE",
      "Foto belum dapat dimuat. Silakan coba lagi.",
    );
  }

  let validatedPhoto: Buffer;
  try {
    const { data, info } = await sharp(bytes, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
      pages: 1,
      sequentialRead: true,
    })
      .jpeg()
      .toBuffer({ resolveWithObject: true });
    if (
      info.format !== "jpeg" ||
      info.width < 1 ||
      info.height < 1 ||
      info.width > MAX_IMAGE_SIDE ||
      info.height > MAX_IMAGE_SIDE ||
      data.byteLength === 0 ||
      data.byteLength > MAX_OUTPUT_BYTES
    ) {
      throw new Error("Invalid Cloudinary JPEG");
    }
    validatedPhoto = data;
  } catch {
    throw new AcneTrackingApiError(
      502,
      "PHOTO_UNAVAILABLE",
      "Foto belum dapat dimuat. Silakan coba lagi.",
    );
  }

  return new Response(new Uint8Array(validatedPhoto), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, no-store, max-age=0",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": 'inline; filename="acne-photo.jpg"',
    },
  });
}
