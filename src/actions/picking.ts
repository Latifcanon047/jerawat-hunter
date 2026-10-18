"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  createPickingFollowUp,
  createStandalonePickingEvent,
  PickingActionError,
  PickingRecordError,
  deleteOwnedPickingEvent as deleteOwnedPickingEventRecord,
  pickingHistoryFilter,
  pickingHistoryOrderBy,
  updateOwnedPickingEvent,
  type PickingEventRecord,
} from "@/lib/picking-service";
import {
  pickingEventSchema,
  pickingEventDeleteSchema,
  pickingEventUpdateSchema,
  type PickingEventDeleteInput,
  type PickingEventInput,
  type PickingEventUpdateInput,
} from "@/lib/validations/picking";
import {
  historyPaginationSchema,
  resolveHistoryDateRange,
  type HistoryPaginationInput,
} from "@/lib/validations/history";

export type { HistoryPaginationInput };

type PickingErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_INPUT"
  | "SESSION_NOT_FOUND"
  | "SESSION_NOT_PICKED"
  | "EVENT_NOT_FOUND"
  | "DUPLICATE_EVENT"
  | "INTEGRITY_ERROR"
  | "INTERNAL_ERROR";

export type PickingActionResult<T> =
  | { success: true; data: T }
  | { success: false; code: PickingErrorCode; error: string };

export interface PickingEventData {
  id: string;
  recordedAt: string;
  occurredAt: string | null;
  pickingType: PickingEventRecord["pickingType"];
  triggers: string[];
  emotions: string[];
  urgeStrength: number | null;
  durationRange: PickingEventRecord["durationRange"];
  reasons: string[];
  impacts: string[];
  context: PickingEventRecord["context"];
  pauseSessionId: string | null;
}

function toEventData(event: PickingEventRecord): PickingEventData {
  return {
    id: event.id,
    recordedAt: event.recordedAt.toISOString(),
    occurredAt: event.occurredAt?.toISOString() ?? null,
    pickingType: event.pickingType,
    triggers: event.triggers,
    emotions: event.emotions,
    urgeStrength: event.urgeStrength,
    durationRange: event.durationRange,
    reasons: event.reasons,
    impacts: event.impacts,
    context: event.context,
    pauseSessionId: event.pauseSessionId,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function failure<T>(action: string, error: unknown): PickingActionResult<T> {
  if (error instanceof PickingActionError) {
    return { success: false, code: error.code, error: error.message };
  }
  if (error instanceof PickingRecordError) {
    return { success: false, code: error.code, error: error.message };
  }
  console.error(`Picking action "${action}" failed:`, error);
  return {
    success: false,
    code: "INTERNAL_ERROR",
    error: "Terjadi kesalahan saat memproses catatan picking. Silakan coba lagi.",
  };
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0) {
    throw new PickingActionError(
      "UNAUTHENTICATED",
      "Silakan masuk untuk mengelola catatan picking."
    );
  }
  return userId;
}

export async function createPickingEvent(
  input: unknown
): Promise<
  PickingActionResult<{ event: PickingEventData; alreadyRecorded: boolean }>
> {
  const parsed = pickingEventSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      code: "INVALID_INPUT",
      error: parsed.error.issues[0]?.message ?? "Data picking tidak valid.",
    };
  }

  try {
    const userId = await requireUserId();
    const inputData: PickingEventInput = parsed.data;
    if (inputData.pauseSessionId) {
      try {
        const result = await prisma.$transaction(async (transaction) => {
          const repository = {
            async lockOwnedSession(sessionId: string, ownerId: string) {
              const rows = await transaction.$queryRaw<Array<{ id: string }>>`
                SELECT "id"
                FROM "PauseSession"
                WHERE "id" = ${sessionId} AND "userId" = ${ownerId}
                FOR UPDATE
              `;
              if (rows.length === 0) return "NOT_FOUND" as const;

              const pauseSession =
                await transaction.pauseSession.findFirst({
                  where: { id: sessionId, userId: ownerId },
                  select: { id: true, outcome: true },
                });
              if (!pauseSession) return "NOT_FOUND" as const;
              return pauseSession.outcome === "PICKED"
                ? ("PICKED" as const)
                : ("NOT_PICKED" as const);
            },
            async findEventForSession(sessionId: string) {
              return transaction.pickingEvent.findUnique({
                where: { pauseSessionId: sessionId },
              });
            },
            async createEvent(ownerId: string, eventInput: PickingEventInput) {
              return transaction.pickingEvent.create({
                data: {
                  userId: ownerId,
                  pickingType: eventInput.pickingType,
                  triggers: eventInput.triggers,
                  emotions: eventInput.emotions,
                  urgeStrength: eventInput.urgeStrength ?? null,
                  durationRange: eventInput.durationRange ?? null,
                  reasons: eventInput.reasons,
                  impacts: eventInput.impacts,
                  context: eventInput.context ?? null,
                  occurredAt: eventInput.occurredAt,
                  pauseSessionId: eventInput.pauseSessionId,
                },
              });
            },
            async markFollowUpCompleted(sessionId: string, ownerId: string) {
              const { count } = await transaction.pauseSession.updateMany({
                where: { id: sessionId, userId: ownerId, outcome: "PICKED" },
                data: { pickingFollowUpCompleted: true },
              });
              if (count !== 1) {
                throw new PickingRecordError(
                  "INTEGRITY_ERROR",
                  "Status tindak lanjut sesi tidak dapat diperbarui."
                );
              }
            },
          };

          return createPickingFollowUp(repository, userId, {
            ...inputData,
            pauseSessionId: inputData.pauseSessionId!,
          });
        });

        revalidatePath("/");
        revalidatePath("/pause");
        revalidatePath("/picking");
        revalidatePath("/picking/analysis");
        return {
          success: true,
          data: {
            event: toEventData(result.event),
            alreadyRecorded: result.alreadyRecorded,
          },
        };
      } catch (error: unknown) {
        if (isUniqueConstraintError(error)) {
          const existing = await prisma.$transaction(async (transaction) => {
            const sessions = await transaction.$queryRaw<Array<{ id: string }>>`
              SELECT "id"
              FROM "PauseSession"
              WHERE "id" = ${inputData.pauseSessionId} AND "userId" = ${userId}
              FOR UPDATE
            `;
            if (sessions.length === 0) return null;

            const pauseSession = await transaction.pauseSession.findFirst({
              where: {
                id: inputData.pauseSessionId,
                userId,
                outcome: "PICKED",
              },
              select: { id: true },
            });
            if (!pauseSession) return null;

            const existingEvent = await transaction.pickingEvent.findUnique({
              where: { pauseSessionId: inputData.pauseSessionId },
            });
            if (!existingEvent || existingEvent.userId !== userId) return null;

            const { count } = await transaction.pauseSession.updateMany({
              where: {
                id: pauseSession.id,
                userId,
                outcome: "PICKED",
              },
              data: { pickingFollowUpCompleted: true },
            });
            if (count !== 1) {
              throw new PickingRecordError(
                "INTEGRITY_ERROR",
                "Status tindak lanjut sesi tidak dapat diperbarui."
              );
            }
            return existingEvent;
          });
          if (existing) {
            revalidatePath("/");
            revalidatePath("/pause");
            revalidatePath("/picking");
            revalidatePath("/picking/analysis");
            return {
              success: true,
              data: { event: toEventData(existing), alreadyRecorded: true },
            };
          }
        }
        throw error;
      }
    }

    const result = await createStandalonePickingEvent(
      {
        createEvent(ownerId, eventInput) {
          return prisma.pickingEvent.create({
            data: {
              ...(eventInput.idempotencyKey
                ? { id: eventInput.idempotencyKey }
                : {}),
              userId: ownerId,
              pickingType: eventInput.pickingType,
              triggers: eventInput.triggers,
              emotions: eventInput.emotions,
              urgeStrength: eventInput.urgeStrength ?? null,
              durationRange: eventInput.durationRange ?? null,
              reasons: eventInput.reasons,
              impacts: eventInput.impacts,
              context: eventInput.context ?? null,
              occurredAt: eventInput.occurredAt,
              pauseSessionId: null,
            },
          });
        },
        findOwnedEvent(eventId, ownerId) {
          return prisma.pickingEvent.findFirst({
            where: { id: eventId, userId: ownerId },
          });
        },
      },
      userId,
      inputData
    );

    revalidatePath("/");
    revalidatePath("/picking");
    revalidatePath("/picking/analysis");
    return {
      success: true,
      data: {
        event: toEventData(result.event),
        alreadyRecorded: result.alreadyRecorded,
      },
    };
  } catch (error: unknown) {
    return failure("createPickingEvent", error);
  }
}

export interface PickingHistoryResultData {
  events: PickingEventData[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function getPickingHistory(
  input?: unknown
): Promise<PickingActionResult<PickingHistoryResultData>> {
  const parsed = historyPaginationSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return {
      success: false,
      code: "INVALID_INPUT",
      error:
        parsed.error.issues[0]?.message ?? "Parameter riwayat tidak valid.",
    };
  }

  const { page: requestedPage, pageSize, filter } = parsed.data;
  const resolution = resolveHistoryDateRange(filter);
  if (!resolution.isValid) {
    return {
      success: false,
      code: "INVALID_INPUT",
      error: resolution.error ?? "Filter tanggal tidak valid.",
    };
  }

  try {
    const userId = await requireUserId();
    const where = pickingHistoryFilter(userId, resolution.dateRange);
    const totalCount = await prisma.pickingEvent.count({ where });
    const totalPages = Math.ceil(totalCount / pageSize);
    const effectivePage =
      totalPages > 0 ? Math.min(requestedPage, totalPages) : 1;
    const skip = (effectivePage - 1) * pageSize;

    const events = await prisma.pickingEvent.findMany({
      where,
      orderBy: pickingHistoryOrderBy,
      take: pageSize,
      skip,
      select: {
        id: true,
        userId: true,
        recordedAt: true,
        occurredAt: true,
        createdAt: true,
        pickingType: true,
        triggers: true,
        emotions: true,
        urgeStrength: true,
        durationRange: true,
        reasons: true,
        impacts: true,
        context: true,
        pauseSessionId: true,
      },
    });
    return {
      success: true,
      data: {
        events: events.map(toEventData),
        totalCount,
        page: effectivePage,
        pageSize,
        totalPages,
      },
    };
  } catch (error: unknown) {
    return failure("getPickingHistory", error);
  }
}

export async function updatePickingEvent(
  input: unknown
): Promise<PickingActionResult<{ event: PickingEventData }>> {
  const parsed = pickingEventUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      code: "INVALID_INPUT",
      error: parsed.error.issues[0]?.message ?? "Data picking tidak valid.",
    };
  }

  try {
    const userId = await requireUserId();
    const updateInput: PickingEventUpdateInput = parsed.data;
    const updated = await prisma.$transaction(async (transaction) => {
      const ownedRows = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "PickingEvent"
        WHERE "id" = ${updateInput.eventId} AND "userId" = ${userId}
        FOR UPDATE
      `;
      if (ownedRows.length === 0) {
        throw new PickingRecordError(
          "EVENT_NOT_FOUND",
          "Catatan picking tidak ditemukan."
        );
      }

      const repository = {
        findOwnedEvent(eventId: string, ownerId: string) {
          return transaction.pickingEvent.findFirst({
            where: { id: eventId, userId: ownerId },
          });
        },
        async updateOwnedEvent(
          eventId: string,
          ownerId: string,
          eventInput: Omit<PickingEventUpdateInput, "eventId">
        ) {
          const { count } = await transaction.pickingEvent.updateMany({
            where: { id: eventId, userId: ownerId },
            data: {
              pickingType: eventInput.pickingType,
              triggers: eventInput.triggers,
              emotions: eventInput.emotions,
              urgeStrength: eventInput.urgeStrength ?? null,
              durationRange: eventInput.durationRange ?? null,
              reasons: eventInput.reasons,
              impacts: eventInput.impacts,
              context: eventInput.context ?? null,
              occurredAt: eventInput.occurredAt,
            },
          });
          if (count !== 1) return null;
          return transaction.pickingEvent.findFirst({
            where: { id: eventId, userId: ownerId },
          });
        },
      };

      return updateOwnedPickingEvent(repository, userId, updateInput);
    });

    revalidatePath("/");
    revalidatePath("/picking");
    revalidatePath("/picking/analysis");
    return { success: true, data: { event: toEventData(updated) } };
  } catch (error: unknown) {
    return failure("updatePickingEvent", error);
  }
}

export async function deletePickingEvent(
  input: unknown
): Promise<PickingActionResult<{ eventId: string }>> {
  const parsed = pickingEventDeleteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      code: "INVALID_INPUT",
      error: parsed.error.issues[0]?.message ?? "ID catatan picking tidak valid.",
    };
  }

  try {
    const userId = await requireUserId();
    const deleteInput: PickingEventDeleteInput = parsed.data;
    await deleteOwnedPickingEventRecord(
      {
        async deleteOwnedEvent(eventId, ownerId) {
          const result = await prisma.pickingEvent.deleteMany({
            where: { id: eventId, userId: ownerId },
          });
          return result.count;
        },
      },
      userId,
      deleteInput.eventId
    );

    revalidatePath("/");
    revalidatePath("/picking");
    revalidatePath("/picking/analysis");
    return { success: true, data: { eventId: deleteInput.eventId } };
  } catch (error: unknown) {
    return failure("deletePickingEvent", error);
  }
}
