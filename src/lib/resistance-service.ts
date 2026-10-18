import type { ResistanceInput } from "@/lib/validations/resistance";

export type ResistanceCreateData = Omit<
  ResistanceInput,
  "durationSecs" | "note"
> & {
  userId: string;
  pauseSessionId: string | null;
  durationSecs: number | null;
  note: string | null;
};

export interface StandaloneResistanceRepository {
  create(data: ResistanceCreateData & { pauseSessionId: null }): Promise<unknown>;
}

export interface ResistanceRecord {
  id: string;
  userId: string;
  recordedAt: Date;
  occurredAt: Date | null;
  durationSecs: number | null;
  note: string | null;
  pauseSessionId: string | null;
  createdAt: Date;
  pauseSession: {
    outcome: string | null;
    startedAt: Date;
  } | null;
}

export type ResistanceEditableFields = Pick<
  ResistanceInput,
  "occurredAt" | "durationSecs" | "note"
>;

export interface ResistanceHistoryRepository {
  findManyOwned(userId: string): Promise<ResistanceRecord[]>;
  findOwned(
    resistanceId: string,
    userId: string
  ): Promise<ResistanceRecord | null>;
  updateOwned(
    resistanceId: string,
    userId: string,
    fields: ResistanceEditableFields
  ): Promise<ResistanceRecord | null>;
  deleteOwned(
    resistanceId: string,
    userId: string
  ): Promise<
    "NOT_FOUND" | "DELETED" | "INVALID_PAUSE_STATE" | "INTEGRITY_ERROR"
  >;
}

export type ResistanceHistoryErrorCode =
  | "UNAUTHENTICATED"
  | "NOT_FOUND"
  | "INVALID_PAUSE_STATE"
  | "INTEGRITY_ERROR";

const resistanceHistoryErrors: Record<ResistanceHistoryErrorCode, string> = {
  UNAUTHENTICATED: "Silakan masuk untuk mengelola riwayat keberhasilan.",
  NOT_FOUND: "Catatan keberhasilan tidak ditemukan.",
  INVALID_PAUSE_STATE:
    "Sesi Pause terkait tidak lagi berstatus berhasil. Catatan tidak dapat dihapus dengan aman.",
  INTEGRITY_ERROR: "Perubahan catatan tidak dapat diverifikasi.",
};

export class ResistanceHistoryError extends Error {
  readonly code: ResistanceHistoryErrorCode;

  constructor(code: ResistanceHistoryErrorCode) {
    super(resistanceHistoryErrors[code]);
    this.code = code;
  }
}

function requireResistanceUserId(userId: string | null): string {
  if (typeof userId !== "string" || userId.length === 0) {
    throw new ResistanceHistoryError("UNAUTHENTICATED");
  }
  return userId;
}

export async function getOwnedResistanceHistory(
  repository: ResistanceHistoryRepository,
  userId: string | null
): Promise<ResistanceRecord[]> {
  const records = await repository.findManyOwned(
    requireResistanceUserId(userId)
  );
  return records.sort((left, right) => {
    const leftTime = (left.occurredAt ?? left.recordedAt).getTime();
    const rightTime = (right.occurredAt ?? right.recordedAt).getTime();
    return (
      rightTime - leftTime ||
      right.recordedAt.getTime() - left.recordedAt.getTime() ||
      right.createdAt.getTime() - left.createdAt.getTime() ||
      left.id.localeCompare(right.id)
    );
  });
}

export async function updateOwnedResistance(
  repository: ResistanceHistoryRepository,
  userId: string | null,
  resistanceId: string,
  fields: ResistanceEditableFields
): Promise<ResistanceRecord> {
  const ownerId = requireResistanceUserId(userId);
  const existing = await repository.findOwned(resistanceId, ownerId);
  if (!existing) throw new ResistanceHistoryError("NOT_FOUND");

  const updated = await repository.updateOwned(
    resistanceId,
    ownerId,
    fields
  );
  if (!updated) throw new ResistanceHistoryError("NOT_FOUND");
  if (
    updated.id !== existing.id ||
    updated.userId !== existing.userId ||
    updated.recordedAt.getTime() !== existing.recordedAt.getTime() ||
    updated.createdAt.getTime() !== existing.createdAt.getTime() ||
    updated.pauseSessionId !== existing.pauseSessionId ||
    updated.pauseSession?.outcome !== existing.pauseSession?.outcome ||
    updated.pauseSession?.startedAt.getTime() !==
      existing.pauseSession?.startedAt.getTime()
  ) {
    throw new ResistanceHistoryError("INTEGRITY_ERROR");
  }
  return updated;
}

export async function deleteOwnedResistance(
  repository: ResistanceHistoryRepository,
  userId: string | null,
  resistanceId: string
): Promise<void> {
  const ownerId = requireResistanceUserId(userId);
  const result = await repository.deleteOwned(resistanceId, ownerId);
  if (result === "NOT_FOUND") {
    throw new ResistanceHistoryError("NOT_FOUND");
  }
  if (result === "INVALID_PAUSE_STATE") {
    throw new ResistanceHistoryError("INVALID_PAUSE_STATE");
  }
  if (result === "INTEGRITY_ERROR") {
    throw new ResistanceHistoryError("INTEGRITY_ERROR");
  }
}

export class ResistanceRecordError extends Error {
  readonly code = "UNAUTHENTICATED";

  constructor() {
    super("Silakan masuk untuk mencatat keberhasilan.");
  }
}

export async function recordStandaloneResistance(
  repository: StandaloneResistanceRepository,
  userId: string | null,
  input: ResistanceInput
): Promise<void> {
  if (typeof userId !== "string" || userId.length === 0) {
    throw new ResistanceRecordError();
  }

  await repository.create({
    userId,
    pauseSessionId: null,
    occurredAt: input.occurredAt,
    durationSecs: input.durationSecs ?? null,
    note: input.note ?? null,
  });
}

export function shouldCreatePauseResistance(outcome: string): boolean {
  return outcome === "SUCCEEDED";
}

export type PauseResistanceErrorCode =
  | "SESSION_NOT_FOUND"
  | "SESSION_ALREADY_ENDED"
  | "SESSION_STILL_RUNNING"
  | "INTEGRITY_ERROR";

const pauseResistanceErrors: Record<PauseResistanceErrorCode, string> = {
  SESSION_NOT_FOUND: "Sesi Pause tidak ditemukan.",
  SESSION_ALREADY_ENDED: "Hasil sesi Pause ini sudah tersimpan.",
  SESSION_STILL_RUNNING: "Sesi Pause belum mencapai durasi yang dipilih.",
  INTEGRITY_ERROR: "Catatan keberhasilan sesi tidak dapat dipastikan.",
};

export class PauseResistanceRecordError extends Error {
  readonly code: PauseResistanceErrorCode;

  constructor(code: PauseResistanceErrorCode) {
    super(pauseResistanceErrors[code]);
    this.code = code;
  }
}

export interface PauseResistanceSession {
  id: string;
  userId: string;
  durationSecs: number;
  startedAt: Date;
  endedAt: Date | null;
  endedEarly: boolean;
  outcome: "SUCCEEDED" | "STILL_RESISTING" | "PICKED" | null;
  pickingFollowUpCompleted: boolean;
}

export interface PauseResistanceTransaction {
  lockOwnedSession(sessionId: string, userId: string): Promise<boolean>;
  findSession(sessionId: string): Promise<PauseResistanceSession | null>;
  findResistanceOwner(sessionId: string): Promise<string | null>;
  createResistance(data: ResistanceCreateData): Promise<unknown>;
  updateSession(
    sessionId: string,
    data: { endedAt: Date; outcome: "SUCCEEDED" }
  ): Promise<PauseResistanceSession>;
}

export interface PauseResistanceRepository {
  transaction<T>(
    callback: (transaction: PauseResistanceTransaction) => Promise<T>
  ): Promise<T>;
}

export async function savePauseResistanceOutcome(
  repository: PauseResistanceRepository,
  userId: string,
  sessionId: string,
  input: ResistanceInput,
  now = new Date()
): Promise<PauseResistanceSession> {
  return repository.transaction(async (transaction) => {
    if (!(await transaction.lockOwnedSession(sessionId, userId))) {
      throw new PauseResistanceRecordError("SESSION_NOT_FOUND");
    }

    const session = await transaction.findSession(sessionId);
    if (!session || session.userId !== userId) {
      throw new PauseResistanceRecordError("SESSION_NOT_FOUND");
    }

    if (session.outcome === "SUCCEEDED") {
      const existingOwner = await transaction.findResistanceOwner(sessionId);
      if (existingOwner === null && session.endedAt !== null) {
        return session;
      }
      if (existingOwner !== userId) {
        throw new PauseResistanceRecordError("INTEGRITY_ERROR");
      }
      return session;
    }
    if (session.outcome !== null) {
      throw new PauseResistanceRecordError("SESSION_ALREADY_ENDED");
    }

    let endedAt = session.endedAt;
    if (!endedAt) {
      const startedAtMs = session.startedAt.getTime();
      const nowMs = now.getTime();
      if (
        !Number.isFinite(startedAtMs) ||
        !Number.isFinite(nowMs) ||
        nowMs < startedAtMs + session.durationSecs * 1000
      ) {
        throw new PauseResistanceRecordError("SESSION_STILL_RUNNING");
      }
      endedAt = now;
    }

    const existingOwner = await transaction.findResistanceOwner(sessionId);
    if (existingOwner && existingOwner !== userId) {
      throw new PauseResistanceRecordError("INTEGRITY_ERROR");
    }
    if (!existingOwner) {
      await transaction.createResistance({
        userId,
        pauseSessionId: sessionId,
        occurredAt: input.occurredAt,
        durationSecs: input.durationSecs ?? null,
        note: input.note ?? null,
      });
    }

    return transaction.updateSession(sessionId, {
      endedAt,
      outcome: "SUCCEEDED",
    });
  });
}

export function createSubmissionLock() {
  let locked = false;

  return {
    tryAcquire() {
      if (locked) return false;
      locked = true;
      return true;
    },
    release() {
      locked = false;
    },
  };
}

export type SubmissionLock = ReturnType<typeof createSubmissionLock>;

export function resistanceHistoryFilter(
  userId: string,
  dateRange?: { startUtc: Date; endUtc: Date } | null
) {
  return {
    userId,
    OR: [
      { pauseSessionId: null },
      { pauseSession: { is: { outcome: "SUCCEEDED" as const } } },
    ],
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

export const resistanceHistoryOrderBy = [
  { occurredAt: { sort: "desc" as const, nulls: "last" as const } },
  { recordedAt: "desc" as const },
  { id: "desc" as const },
];

