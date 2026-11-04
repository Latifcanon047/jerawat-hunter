import { z } from "zod";

const acneLocations = [
  "forehead",
  "left_temple",
  "right_temple",
  "nose",
  "left_cheek",
  "right_cheek",
  "around_mouth",
  "chin",
  "left_jaw",
  "right_jaw",
] as const;

export const acneTrackingFieldsSchema = z.object({
  name: z.string().trim().min(1, "Nama pemantauan wajib diisi."),
  location: z.enum(acneLocations),
  startedAt: z.iso.date().optional(),
});

export const acneTrackingMetadataSchema = z
  .object({
    name: z.string().trim().min(1, "Nama pemantauan wajib diisi."),
    location: z.enum(acneLocations),
    startedAt: z.iso.date(),
  })
  .strict();

export const photoMarkerSchema = z.object({
  markerX: z.number().finite().min(0).max(1),
  markerY: z.number().finite().min(0).max(1),
});

const positiveSafeIntegerQuerySchema = z
  .string()
  .regex(/^[1-9]\d*$/, "Harus berupa bilangan bulat positif.")
  .transform(Number)
  .refine(Number.isSafeInteger, "Nilai pagination tidak valid.");

export const acneTrackingListQuerySchema = z
  .object({
    status: z.enum(["ACTIVE", "HEALED"]),
    page: positiveSafeIntegerQuerySchema.optional(),
    pageSize: positiveSafeIntegerQuerySchema
      .refine((value) => value <= 50, "Ukuran halaman maksimal 50.")
      .optional(),
  })
  .strict();

export function parseMarkerCoordinate(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  if (!/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(value.trim())) return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

export type AcneTrackingFields = z.infer<typeof acneTrackingFieldsSchema>;
