"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  getStats,
  StatsServiceError,
  type StatsErrorCode,
  type StatsRepository,
  type StatsResult,
} from "@/lib/stats-service";
import {
  statsFilterSchema,
  getJakartaDateParts,
  type StatsFilterInput,
} from "@/lib/validations/stats";

export type StatsActionResult =
  | { success: true; data: StatsResult }
  | { success: false; code: StatsErrorCode; error: string };

function failure(action: string, error: unknown): StatsActionResult {
  if (error instanceof StatsServiceError) {
    return {
      success: false,
      code: error.code,
      error: error.message,
    };
  }
  console.error(`Stats action "${action}" failed:`, error);
  return {
    success: false,
    code: "INTERNAL_ERROR",
    error: "Terjadi kesalahan saat memuat statistik. Silakan coba lagi.",
  };
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.trim().length === 0) {
    throw new StatsServiceError(
      "UNAUTHENTICATED",
      "Silakan masuk untuk melihat statistik dashboard."
    );
  }
  return userId;
}

function prismaStatsRepository(): StatsRepository {
  return {
    async findResistanceOccurrences(userId: string, startUtc: Date, endUtc: Date) {
      return prisma.resistance.findMany({
        where: {
          userId,
          occurredAt: {
            gte: startUtc,
            lt: endUtc,
          },
          OR: [
            { pauseSessionId: null },
            { pauseSession: { is: { outcome: "SUCCEEDED" } } },
          ],
        },
        select: {
          occurredAt: true,
        },
      });
    },

    async findPickingOccurrences(userId: string, startUtc: Date, endUtc: Date) {
      return prisma.pickingEvent.findMany({
        where: {
          userId,
          occurredAt: {
            gte: startUtc,
            lt: endUtc,
          },
        },
        select: {
          occurredAt: true,
        },
      });
    },
  };
}

export async function fetchDashboardStats(
  input: unknown
): Promise<StatsActionResult> {
  const parsed = statsFilterSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      code: "INVALID_FILTER",
      error:
        parsed.error.issues[0]?.message ?? "Parameter filter tidak valid.",
    };
  }

  try {
    const userId = await requireUserId();
    const stats = await getStats(
      prismaStatsRepository(),
      userId,
      parsed.data,
      new Date()
    );

    return {
      success: true,
      data: stats,
    };
  } catch (error: unknown) {
    return failure("fetchDashboardStats", error);
  }
}

export async function getDefaultDashboardStats(): Promise<StatsActionResult> {
  const { year, month, day } = getJakartaDateParts(new Date());
  const defaultFilter: StatsFilterInput = {
    mode: "monthly",
    year,
    month,
    startDay: 1,
    endDay: day,
  };

  return fetchDashboardStats(defaultFilter);
}
