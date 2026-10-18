import { z } from "zod";

/** Keep anomalously long duration entries within one day. */
export const MAX_RESISTANCE_DURATION_SECS = 86_400;

const optionalDurationSecs = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) return undefined;
    if (typeof value === "string" && /^\d+$/.test(value)) {
      return Number(value);
    }
    return value;
  },
  z
    .number()
    .int("Durasi harus berupa jumlah detik bulat.")
    .min(0, "Durasi tidak boleh negatif.")
    .max(
      MAX_RESISTANCE_DURATION_SECS,
      "Durasi maksimal 24 jam."
    )
    .optional()
);

const optionalNote = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) return undefined;
    return typeof value === "string" ? value.trim() : value;
  },
  z.string().max(500, "Catatan maksimal 500 karakter.").optional()
);

export const resistanceInputSchema = z.object({
  occurredAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
  durationSecs: optionalDurationSecs,
  note: optionalNote,
});

export const pauseResistanceInputSchema = z
  .object({
    sessionId: z.string().trim().min(1).max(64),
  })
  .extend(resistanceInputSchema.shape);

export const resistanceUpdateSchema = z
  .object({
    resistanceId: z.string().trim().min(1).max(64),
  })
  .extend(resistanceInputSchema.shape);

export const resistanceDeleteSchema = z.object({
  resistanceId: z.string().trim().min(1).max(64),
});

export type ResistanceInput = z.infer<typeof resistanceInputSchema>;
export type ResistanceUpdateInput = z.infer<typeof resistanceUpdateSchema>;
