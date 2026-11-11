"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { acneLocations } from "@/lib/validations/acne-tracking";
import {
  getHealingAverages,
  type HealingAverageResult,
} from "@/lib/healing-average-service";

const healingAverageFilterSchema = z
  .object({
    location: z.union([z.literal("all"), z.enum(acneLocations)]),
  })
  .strict();

export type HealingAverageActionResult =
  | { success: true; data: HealingAverageResult }
  | {
      success: false;
      code: "UNAUTHENTICATED" | "INVALID_FILTER" | "INTERNAL_ERROR";
      error: string;
    };

export async function fetchHealingAverages(
  input: unknown,
): Promise<HealingAverageActionResult> {
  const parsed = healingAverageFilterSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      code: "INVALID_FILTER",
      error: "Filter lokasi tidak valid.",
    };
  }

  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (typeof userId !== "string" || userId.trim().length === 0) {
      return {
        success: false,
        code: "UNAUTHENTICATED",
        error: "Silakan masuk untuk melihat rata-rata sembuh.",
      };
    }

    const records = await prisma.acneTracking.findMany({
      where: { userId, status: "HEALED", healedDate: { not: null } },
      select: { location: true, startedAt: true, healedDate: true },
    });

    return {
      success: true,
      data: getHealingAverages(records, parsed.data.location),
    };
  } catch (error: unknown) {
    console.error(
      'Healing average action "fetchHealingAverages" failed:',
      error,
    );
    return {
      success: false,
      code: "INTERNAL_ERROR",
      error:
        "Terjadi kesalahan saat memuat rata-rata sembuh. Silakan coba lagi.",
    };
  }
}
