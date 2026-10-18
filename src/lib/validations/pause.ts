import { z } from "zod";

const pauseOutcomes = ["SUCCEEDED", "STILL_RESISTING", "PICKED"] as const;

export const pauseDurationSchema = z
  .number()
  .int("Durasi harus berupa jumlah detik bulat.")
  .min(30, "Durasi minimal 30 detik.")
  .max(600, "Durasi maksimal 10 menit.");

export const pauseOutcomeSchema = z.enum(pauseOutcomes);

export const startPauseSchema = z.object({
  durationSecs: pauseDurationSchema,
  requestId: z.uuid(),
});

export const pauseSessionIdSchema = z.string().trim().min(1).max(64);

export const finishPauseSchema = z.object({
  sessionId: pauseSessionIdSchema,
  outcome: pauseOutcomeSchema,
});

export type StartPauseInput = z.infer<typeof startPauseSchema>;
export type FinishPauseInput = z.infer<typeof finishPauseSchema>;
