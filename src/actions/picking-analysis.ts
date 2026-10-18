"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  getPickingAnalysis,
  PickingAnalysisError,
  type PickingAnalysisErrorCode,
  type PickingAnalysisRepository,
  type PickingAnalysisResult,
} from "@/lib/picking-analysis-service";
import {
  statsFilterSchema,
  getJakartaDateParts,
  type StatsFilterInput,
} from "@/lib/validations/stats";

export type PickingAnalysisActionResult =
  | { success: true; data: PickingAnalysisResult }
  | { success: false; code: PickingAnalysisErrorCode; error: string };

function failure(action: string, error: unknown): PickingAnalysisActionResult {
  if (error instanceof PickingAnalysisError) {
    return {
      success: false,
      code: error.code,
      error: error.message,
    };
  }
  console.error(`Picking analysis action "${action}" failed:`, error);
  return {
    success: false,
    code: "INTERNAL_ERROR",
    error: "Terjadi kesalahan saat memuat analisis. Silakan coba lagi.",
  };
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.trim().length === 0) {
    throw new PickingAnalysisError(
      "UNAUTHENTICATED",
      "Silakan masuk untuk melihat analisis pola picking."
    );
  }
  return userId;
}

function prismaPickingAnalysisRepository(): PickingAnalysisRepository {
  return {
    async findPickingAnalysisRecords(
      userId: string,
      startUtc: Date,
      endUtc: Date
    ) {
      return prisma.pickingEvent.findMany({
        where: {
          userId,
          occurredAt: {
            gte: startUtc,
            lt: endUtc,
          },
        },
        select: {
          triggers: true,
          emotions: true,
          urgeStrength: true,
          durationRange: true,
          reasons: true,
          impacts: true,
          context: true,
        },
      });
    },
  };
}

export async function fetchPickingAnalysis(
  input: unknown
): Promise<PickingAnalysisActionResult> {
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
    const analysis = await getPickingAnalysis(
      prismaPickingAnalysisRepository(),
      userId,
      parsed.data,
      new Date()
    );

    return {
      success: true,
      data: analysis,
    };
  } catch (error: unknown) {
    return failure("fetchPickingAnalysis", error);
  }
}

export async function getDefaultPickingAnalysis(): Promise<PickingAnalysisActionResult> {
  const { year, month, day } = getJakartaDateParts(new Date());
  const defaultFilter: StatsFilterInput = {
    mode: "monthly",
    year,
    month,
    startDay: 1,
    endDay: day,
  };

  return fetchPickingAnalysis(defaultFilter);
}
