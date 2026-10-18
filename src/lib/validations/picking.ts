import { z } from "zod";
import type {
  ContextType as ContextTypeValue,
  DurationRange as DurationRangeValue,
  PickingType as PickingTypeValue,
} from "@/generated/prisma/enums";

const pickingTypeCodes = [
  "SQUEEZE",
  "PEEL",
  "TOUCH_FIDGET",
] as const satisfies readonly PickingTypeValue[];
const triggerCodes = [
  "TEXTURE_FEEL",
  "MIRROR",
  "DRY_SCAB",
  "STRESS",
  "BOREDOM",
  "AUTOMATIC_HAND",
  "SEEK_RELIEF",
  "OTHER",
] as const;
const emotionCodes = [
  "ANXIOUS",
  "STRESSED",
  "BORED",
  "FRUSTRATED",
  "NUMB",
  "CURIOUS",
  "SEEK_RELIEF",
  "NEUTRAL",
  "OTHER",
] as const;
const reasonCodes = [
  "REMOVE_TEXTURE",
  "PEEL_DRY_SKIN",
  "SEEK_SATISFACTION",
  "RELIEVE_URGE",
  "WANT_SMOOTH_SKIN",
  "AUTOMATIC_UNCONSCIOUS",
  "OTHER",
] as const;
const impactCodes = [
  "RED_IRRITATION",
  "BLEEDING_WOUND",
  "NEW_SCAB",
  "STINGING_PAIN",
  "MARKS_SCARS",
  "TEMPORARY_RELIEF",
  "REGRET_DISAPPOINTED",
] as const;
const durationRangeCodes = [
  "UNDER_1_MIN",
  "FROM_1_TO_5_MIN",
  "FROM_6_TO_15_MIN",
  "FROM_16_TO_30_MIN",
  "OVER_30_MIN",
] as const satisfies readonly DurationRangeValue[];
const contextCodes = [
  "ALONE_IN_ROOM",
  "IN_FRONT_OF_MIRROR",
  "USING_PHONE_WATCHING",
  "STUDYING_WORKING",
  "BEFORE_SLEEP",
  "OTHER_ACTIVITY",
  "OTHER",
] as const satisfies readonly ContextTypeValue[];

const optionalStrength = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) return undefined;
    if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
    return value;
  },
  z.number().int().min(1).max(5).optional()
);

const optionalDurationRange = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.enum(durationRangeCodes).optional()
);

const optionalContext = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.enum(contextCodes).optional()
);

export const pickingEventSchema = z.object({
  idempotencyKey: z.uuid().optional(),
  occurredAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
  pickingType: z.enum(pickingTypeCodes),
  triggers: z.array(z.enum(triggerCodes)).max(triggerCodes.length).default([]),
  emotions: z.array(z.enum(emotionCodes)).max(emotionCodes.length).default([]),
  urgeStrength: optionalStrength,
  durationRange: optionalDurationRange,
  reasons: z.array(z.enum(reasonCodes)).max(reasonCodes.length).default([]),
  impacts: z.array(z.enum(impactCodes)).max(impactCodes.length).default([]),
  context: optionalContext,
  pauseSessionId: z.string().trim().min(1).max(64).optional(),
});

export const pickingEventUpdateSchema = z
  .object({
    eventId: z.string().trim().min(1).max(64),
  })
  .merge(
    pickingEventSchema.omit({
      pauseSessionId: true,
      idempotencyKey: true,
    })
  );

export const pickingEventDeleteSchema = z.object({
  eventId: z.string().trim().min(1).max(64),
});

export type PickingEventInput = z.infer<typeof pickingEventSchema>;
export type PickingEventUpdateInput = z.infer<
  typeof pickingEventUpdateSchema
>;
export type PickingEventDeleteInput = z.infer<
  typeof pickingEventDeleteSchema
>;
