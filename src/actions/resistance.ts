"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  deleteOwnedResistance,
  recordStandaloneResistance,
  ResistanceHistoryError,
  ResistanceRecordError,
  resistanceHistoryFilter,
  resistanceHistoryOrderBy,
  updateOwnedResistance,
  type ResistanceEditableFields,
  type ResistanceRecord,
} from "@/lib/resistance-service";
import {
  resistanceDeleteSchema,
  resistanceInputSchema,
  resistanceUpdateSchema,
} from "@/lib/validations/resistance";
import {
  historyPaginationSchema,
  resolveHistoryDateRange,
  type HistoryPaginationInput,
} from "@/lib/validations/history";

export type { HistoryPaginationInput };

type ResistanceErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "INVALID_PAUSE_STATE"
  | "INTEGRITY_ERROR"
  | "INTERNAL_ERROR";

export type ResistanceActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; code: ResistanceErrorCode; error: string };

export interface ResistanceHistoryItem {
  id: string;
  recordedAt: string;
  occurredAt: string | null;
  durationSecs: number | null;
  note: string | null;
  pauseSessionId: string | null;
  pauseStartedAt: string | null;
}

function toHistoryItem(record: ResistanceRecord): ResistanceHistoryItem {
  return {
    id: record.id,
    recordedAt: record.recordedAt.toISOString(),
    occurredAt: record.occurredAt?.toISOString() ?? null,
    durationSecs: record.durationSecs,
    note: record.note,
    pauseSessionId: record.pauseSessionId,
    pauseStartedAt: record.pauseSession?.startedAt.toISOString() ?? null,
  };
}

function failure<T = undefined>(
  action: string,
  error: unknown
): ResistanceActionResult<T> {
  if (
    error instanceof ResistanceHistoryError ||
    error instanceof ResistanceRecordError
  ) {
    return {
      success: false,
      code: error.code,
      error: error.message,
    };
  }
  console.error(`Resistance action "${action}" failed:`, error);
  return {
    success: false,
    code: "INTERNAL_ERROR",
    error:
      "Terjadi kesalahan saat memproses riwayat keberhasilan. Silakan coba lagi.",
  };
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0) {
    throw new ResistanceHistoryError("UNAUTHENTICATED");
  }
  return userId;
}

function historyRepository() {
  return {
    findManyOwned(userId: string) {
      return prisma.resistance.findMany({
        where: {
          userId,
          OR: [
            { pauseSessionId: null },
            { pauseSession: { is: { outcome: "SUCCEEDED" } } },
          ],
        },
        include: {
          pauseSession: { select: { outcome: true, startedAt: true } },
        },
        orderBy: { recordedAt: "desc" },
      });
    },
    findOwned(resistanceId: string, userId: string) {
      return prisma.resistance.findFirst({
        where: { id: resistanceId, userId },
        include: {
          pauseSession: { select: { outcome: true, startedAt: true } },
        },
      });
    },
    async updateOwned(
      resistanceId: string,
      userId: string,
      fields: ResistanceEditableFields
    ) {
      return prisma.$transaction(async (transaction) => {
        const ownedRows = await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "Resistance"
          WHERE "id" = ${resistanceId} AND "userId" = ${userId}
          FOR UPDATE
        `;
        if (ownedRows.length === 0) return null;

        const { count } = await transaction.resistance.updateMany({
          where: { id: resistanceId, userId },
          data: {
            occurredAt: fields.occurredAt,
            durationSecs: fields.durationSecs ?? null,
            note: fields.note ?? null,
          },
        });
        if (count !== 1) return null;
        return transaction.resistance.findFirst({
          where: { id: resistanceId, userId },
          include: {
            pauseSession: { select: { outcome: true, startedAt: true } },
          },
        });
      });
    },
    async deleteOwned(resistanceId: string, userId: string) {
      return prisma.$transaction(async (transaction) => {
        const resistance = await transaction.resistance.findFirst({
          where: { id: resistanceId, userId },
          select: { pauseSessionId: true },
        });
        if (!resistance) return "NOT_FOUND" as const;

        if (resistance.pauseSessionId === null) {
          const { count } = await transaction.resistance.deleteMany({
            where: { id: resistanceId, userId, pauseSessionId: null },
          });
          return count === 1 ? ("DELETED" as const) : ("NOT_FOUND" as const);
        }

        const lockedUsers = await transaction.$queryRaw<
          Array<{ id: string }>
        >`
          SELECT "id"
          FROM "User"
          WHERE "id" = ${userId}
          FOR UPDATE
        `;
        if (lockedUsers.length !== 1) return "INTEGRITY_ERROR" as const;

        const lockedSessions = await transaction.$queryRaw<
          Array<{ id: string }>
        >`
          SELECT "id"
          FROM "PauseSession"
          WHERE "id" = ${resistance.pauseSessionId} AND "userId" = ${userId}
          FOR UPDATE
        `;
        if (lockedSessions.length !== 1) return "INTEGRITY_ERROR" as const;

        const pauseSession = await transaction.pauseSession.findFirst({
          where: { id: resistance.pauseSessionId, userId },
          select: {
            outcome: true,
            pickingEvent: { select: { id: true } },
          },
        });
        if (!pauseSession) return "INTEGRITY_ERROR" as const;
        if (pauseSession.pickingEvent) return "INTEGRITY_ERROR" as const;
        if (pauseSession.outcome !== "SUCCEEDED") {
          return "INVALID_PAUSE_STATE" as const;
        }

        const lockedResistance = await transaction.$queryRaw<
          Array<{ id: string }>
        >`
          SELECT "id"
          FROM "Resistance"
          WHERE "id" = ${resistanceId}
            AND "userId" = ${userId}
            AND "pauseSessionId" = ${resistance.pauseSessionId}
          FOR UPDATE
        `;
        if (lockedResistance.length !== 1) return "NOT_FOUND" as const;

        const { count: deletedCount } = await transaction.resistance.deleteMany({
          where: {
            id: resistanceId,
            userId,
            pauseSessionId: resistance.pauseSessionId,
          },
        });
        if (deletedCount !== 1) return "NOT_FOUND" as const;

        return "DELETED" as const;
      });
    },
  };
}

export interface ResistanceHistoryResultData {
  records: ResistanceHistoryItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function getResistanceHistory(
  input?: unknown
): Promise<ResistanceActionResult<ResistanceHistoryResultData>> {
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
    const where = resistanceHistoryFilter(userId, resolution.dateRange);
    const totalCount = await prisma.resistance.count({ where });
    const totalPages = Math.ceil(totalCount / pageSize);
    const effectivePage =
      totalPages > 0 ? Math.min(requestedPage, totalPages) : 1;
    const skip = (effectivePage - 1) * pageSize;

    const records = await prisma.resistance.findMany({
      where,
      orderBy: resistanceHistoryOrderBy,
      take: pageSize,
      skip,
      include: {
        pauseSession: { select: { outcome: true, startedAt: true } },
      },
    });

    return {
      success: true,
      data: {
        records: records.map(toHistoryItem),
        totalCount,
        page: effectivePage,
        pageSize,
        totalPages,
      },
    };
  } catch (error: unknown) {
    return failure("getResistanceHistory", error);
  }
}

export async function updateResistance(
  input: unknown
): Promise<ResistanceActionResult<{ record: ResistanceHistoryItem }>> {
  const parsed = resistanceUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      code: "INVALID_INPUT",
      error:
        parsed.error.issues[0]?.message ?? "Data keberhasilan tidak valid.",
    };
  }

  try {
    const { resistanceId, ...fields } = parsed.data;
    const record = await updateOwnedResistance(
      historyRepository(),
      await requireUserId(),
      resistanceId,
      fields
    );
    revalidatePath("/resistance");
    return { success: true, data: { record: toHistoryItem(record) } };
  } catch (error: unknown) {
    return failure("updateResistance", error);
  }
}

export async function deleteResistance(
  input: unknown
): Promise<ResistanceActionResult<{ resistanceId: string }>> {
  const parsed = resistanceDeleteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      code: "INVALID_INPUT",
      error:
        parsed.error.issues[0]?.message ??
        "ID catatan keberhasilan tidak valid.",
    };
  }

  try {
    const userId = await requireUserId();
    await deleteOwnedResistance(
      historyRepository(),
      userId,
      parsed.data.resistanceId
    );
    revalidatePath("/");
    revalidatePath("/pause");
    revalidatePath("/resistance");
    return {
      success: true,
      data: { resistanceId: parsed.data.resistanceId },
    };
  } catch (error: unknown) {
    return failure("deleteResistance", error);
  }
}

export async function createStandaloneResistance(
  input: unknown
): Promise<ResistanceActionResult<void>> {
  const parsed = resistanceInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      code: "INVALID_INPUT",
      error:
        parsed.error.issues[0]?.message ?? "Data keberhasilan tidak valid.",
    };
  }

  try {
    const session = await auth();
    await recordStandaloneResistance(
      {
        create(data) {
          return prisma.resistance.create({ data });
        },
      },
      session?.user?.id ?? null,
      parsed.data
    );

    revalidatePath("/resistance");
    return { success: true, data: undefined };
  } catch (error: unknown) {
    if (error instanceof ResistanceRecordError) {
      return {
        success: false,
        code: error.code,
        error: error.message,
      };
    }

    console.error(
      'Resistance action "createStandaloneResistance" failed:',
      error
    );
    return {
      success: false,
      code: "INTERNAL_ERROR",
      error: "Keberhasilan belum dapat disimpan. Silakan coba lagi.",
    };
  }
}
