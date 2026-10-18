import type {
  PickingEventInput,
  PickingEventUpdateInput,
} from "@/lib/validations/picking";

export interface PickingEventRecord {
  id: string;
  userId: string;
  recordedAt: Date;
  occurredAt: Date | null;
  createdAt: Date;
  pickingType: PickingEventInput["pickingType"];
  triggers: string[];
  emotions: string[];
  urgeStrength: number | null;
  durationRange: PickingEventInput["durationRange"] | null;
  reasons: string[];
  impacts: string[];
  context: PickingEventInput["context"] | null;
  pauseSessionId: string | null;
}

export interface PausePickingRepository {
  lockOwnedSession(
    sessionId: string,
    userId: string
  ): Promise<"NOT_FOUND" | "NOT_PICKED" | "PICKED">;
  findEventForSession(sessionId: string): Promise<PickingEventRecord | null>;
  createEvent(
    userId: string,
    input: PickingEventInput & { pauseSessionId: string }
  ): Promise<PickingEventRecord>;
  markFollowUpCompleted(sessionId: string, userId: string): Promise<void>;
}

export interface PickingEditRepository {
  findOwnedEvent(
    eventId: string,
    userId: string
  ): Promise<PickingEventRecord | null>;
  updateOwnedEvent(
    eventId: string,
    userId: string,
    input: Omit<PickingEventUpdateInput, "eventId">
  ): Promise<PickingEventRecord | null>;
}

export interface PickingDeleteRepository {
  deleteOwnedEvent(eventId: string, userId: string): Promise<number>;
}

export interface StandalonePickingRepository {
  createEvent(
    userId: string,
    input: Omit<PickingEventInput, "pauseSessionId">
  ): Promise<PickingEventRecord>;
  findOwnedEvent(
    eventId: string,
    userId: string
  ): Promise<PickingEventRecord | null>;
}

export class PickingActionError extends Error {
  readonly code:
    | "UNAUTHENTICATED"
    | "INVALID_INPUT"
    | "SESSION_NOT_FOUND"
    | "SESSION_NOT_PICKED"
    | "DUPLICATE_EVENT"
    | "INTEGRITY_ERROR"
    | "INTERNAL_ERROR";

  constructor(
    code: PickingActionError["code"],
    message: string
  ) {
    super(message);
    this.code = code;
  }
}

export class PickingRecordError extends Error {
  readonly code:
    | "SESSION_NOT_FOUND"
    | "SESSION_NOT_PICKED"
    | "EVENT_NOT_FOUND"
    | "INTEGRITY_ERROR";

  constructor(
    code: PickingRecordError["code"],
    message: string
  ) {
    super(message);
    this.code = code;
  }
}

export async function createStandalonePickingEvent(
  repository: StandalonePickingRepository,
  userId: string | null,
  input: PickingEventInput
): Promise<{ event: PickingEventRecord; alreadyRecorded: boolean }> {
  if (typeof userId !== "string" || userId.length === 0) {
    throw new PickingActionError(
      "UNAUTHENTICATED",
      "Silakan masuk untuk mencatat kejadian picking."
    );
  }

  if (
    !(input.occurredAt instanceof Date) ||
    !Number.isFinite(input.occurredAt.getTime()) ||
    !input.idempotencyKey
  ) {
    throw new PickingActionError(
      "INVALID_INPUT",
      "Waktu kejadian dan kunci pengiriman wajib diisi."
    );
  }

  const eventInput = { ...input };
  delete eventInput.pauseSessionId;
  try {
    return {
      event: await repository.createEvent(userId, eventInput),
      alreadyRecorded: false,
    };
  } catch (error) {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== "P2002"
    ) {
      throw error;
    }

    const existing = await repository.findOwnedEvent(
      input.idempotencyKey,
      userId
    );
    if (
      existing &&
      existing.pickingType === input.pickingType &&
      existing.occurredAt?.getTime() === input.occurredAt.getTime() &&
      JSON.stringify(existing.triggers) === JSON.stringify(input.triggers) &&
      JSON.stringify(existing.emotions) === JSON.stringify(input.emotions) &&
      existing.urgeStrength === (input.urgeStrength ?? null) &&
      existing.durationRange === (input.durationRange ?? null) &&
      JSON.stringify(existing.reasons) === JSON.stringify(input.reasons) &&
      JSON.stringify(existing.impacts) === JSON.stringify(input.impacts) &&
      existing.context === (input.context ?? null) &&
      existing.pauseSessionId === null
    ) {
      return { event: existing, alreadyRecorded: true };
    }

    throw new PickingActionError(
      "DUPLICATE_EVENT",
      "Kunci pengiriman ini sudah digunakan untuk catatan lain."
    );
  }
}

export async function updateOwnedPickingEvent(
  repository: PickingEditRepository,
  userId: string,
  input: PickingEventUpdateInput
): Promise<PickingEventRecord> {
  const existing = await repository.findOwnedEvent(input.eventId, userId);
  if (!existing) {
    throw new PickingRecordError(
      "EVENT_NOT_FOUND",
      "Catatan picking tidak ditemukan."
    );
  }

  const updated = await repository.updateOwnedEvent(
    input.eventId,
    userId,
    {
      occurredAt: input.occurredAt,
      pickingType: input.pickingType,
      triggers: input.triggers,
      emotions: input.emotions,
      urgeStrength: input.urgeStrength,
      durationRange: input.durationRange,
      reasons: input.reasons,
      impacts: input.impacts,
      context: input.context,
    }
  );
  if (!updated) {
    throw new PickingRecordError(
      "EVENT_NOT_FOUND",
      "Catatan picking tidak ditemukan."
    );
  }
  if (
    updated.id !== existing.id ||
    updated.userId !== existing.userId ||
    updated.createdAt.getTime() !== existing.createdAt.getTime() ||
    updated.recordedAt.getTime() !== existing.recordedAt.getTime() ||
    updated.occurredAt?.getTime() !== input.occurredAt.getTime() ||
    updated.pauseSessionId !== existing.pauseSessionId
  ) {
    throw new PickingRecordError(
      "INTEGRITY_ERROR",
      "Perubahan catatan tidak dapat diverifikasi."
    );
  }
  return updated;
}

export async function deleteOwnedPickingEvent(
  repository: PickingDeleteRepository,
  userId: string,
  eventId: string
): Promise<void> {
  const deletedCount = await repository.deleteOwnedEvent(eventId, userId);
  if (deletedCount !== 1) {
    throw new PickingRecordError(
      "EVENT_NOT_FOUND",
      "Catatan picking tidak ditemukan."
    );
  }
}

export async function createPickingFollowUp(
  repository: PausePickingRepository,
  userId: string,
  input: PickingEventInput & { pauseSessionId: string }
): Promise<{ event: PickingEventRecord; alreadyRecorded: boolean }> {
  if (
    !(input.occurredAt instanceof Date) ||
    !Number.isFinite(input.occurredAt.getTime())
  ) {
    throw new PickingActionError(
      "INVALID_INPUT",
      "Waktu kejadian wajib diisi."
    );
  }

  const sessionState = await repository.lockOwnedSession(
    input.pauseSessionId,
    userId
  );
  if (sessionState === "NOT_FOUND") {
    throw new PickingRecordError(
      "SESSION_NOT_FOUND",
      "Sesi Pause tidak ditemukan."
    );
  }
  if (sessionState === "NOT_PICKED") {
    throw new PickingRecordError(
      "SESSION_NOT_PICKED",
      "Pencatatan ini hanya dapat dilanjutkan dari sesi dengan hasil picking."
    );
  }

  const existing = await repository.findEventForSession(input.pauseSessionId);
  if (existing) {
    if (existing.userId !== userId) {
      throw new PickingRecordError(
        "INTEGRITY_ERROR",
        "Catatan picking sesi ini tidak sesuai dengan pemiliknya."
      );
    }
    await repository.markFollowUpCompleted(input.pauseSessionId, userId);
    return { event: existing, alreadyRecorded: true };
  }

  const event = await repository.createEvent(userId, input);
  await repository.markFollowUpCompleted(input.pauseSessionId, userId);
  return {
    event,
    alreadyRecorded: false,
  };
}

export function pickingHistoryFilter(
  userId: string,
  dateRange?: { startUtc: Date; endUtc: Date } | null
): {
  userId: string;
  occurredAt?: {
    gte: Date;
    lt: Date;
  };
} {
  return {
    userId,
    ...(dateRange
      ? {
          occurredAt: {
            gte: dateRange.startUtc,
            lt: dateRange.endUtc,
          },
        }
      : {}),
  };
}

export const pickingHistoryOrderBy = [
  { occurredAt: { sort: "desc" as const, nulls: "last" as const } },
  { recordedAt: "desc" as const },
  { id: "desc" as const },
];
