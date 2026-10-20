"use server";

import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getDatabasePoolSnapshot, prisma } from "@/lib/db";
import {
  isPickingDetailsPending,
  selectPendingPickingFollowUps,
} from "@/lib/pause-follow-ups";
import {
  canResumePauseStartRequest,
  selectPauseSessionToResume,
} from "@/lib/pause-recovery";
import {
  PauseResistanceRecordError,
  savePauseResistanceOutcome,
  shouldCreatePauseResistance,
  type PauseResistanceSession,
} from "@/lib/resistance-service";
import {
  finishPauseSchema,
  pauseSessionIdSchema,
  startPauseSchema,
} from "@/lib/validations/pause";
import { pauseResistanceInputSchema } from "@/lib/validations/resistance";
import type { PauseSession } from "@/generated/prisma/client";
import type { PauseOutcome as PauseOutcomeType } from "@/generated/prisma/enums";

export interface PauseSessionData {
  id: string;
  durationSecs: number;
  startedAt: string;
  endedAt: string | null;
  endedEarly: boolean;
  outcome: PauseOutcomeType | null;
  pickingFollowUpCompleted: boolean;
}

type PauseErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_INPUT"
  | "SESSION_NOT_FOUND"
  | "SESSION_ALREADY_ENDED"
  | "SESSION_STILL_RUNNING"
  | "SESSION_CONFLICT"
  | "INTEGRITY_ERROR"
  | "INTERNAL_ERROR";

type PauseActionResult<T> =
  | { success: true; data: T }
  | { success: false; code: PauseErrorCode; error: string };

const SLOW_PAUSE_STATE_TRANSACTION_MS = 1000;

const PAUSE_STATE_CALLERS = [
  "pause-page",
  "pause-flow-refresh",
  "pause-reminder-provider",
  "dashboard-refresh",
  "picking-follow-up",
] as const;

type PauseStateCaller = (typeof PAUSE_STATE_CALLERS)[number];

type PauseStateQueryDurations = Record<string, number>;

interface PauseStateDiagnostics {
  correlationId: string;
  caller: PauseStateCaller | "unknown";
  callbackStarted: boolean;
  transactionStartWaitMs: number | null;
  callbackDurationMs: number | null;
  transactionCompletionMs: number | null;
  transactionTotalMs: number;
  queryDurationsMs: PauseStateQueryDurations;
  queryRowCounts: {
    pauseUnresolved: number | null;
    pauseFollowUpCandidates: number | null;
    pauseFollowUps: number | null;
  };
  poolBefore: ReturnType<typeof getDatabasePoolSnapshot>;
  poolAfter: ReturnType<typeof getDatabasePoolSnapshot>;
  errorCode?: string;
}

class PauseActionError extends Error {
  constructor(
    readonly code: PauseErrorCode,
    message: string
  ) {
    super(message);
  }
}

async function measurePauseStateQuery<T>(
  queryDurations: PauseStateQueryDurations,
  operation: string,
  query: () => Promise<T>
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await query();
  } finally {
    queryDurations[operation] = performance.now() - startedAt;
  }
}

function logPauseStateDiagnostics(
  diagnostics: PauseStateDiagnostics,
  failed: boolean
): void {
  if (
    !failed &&
    diagnostics.transactionTotalMs < SLOW_PAUSE_STATE_TRANSACTION_MS
  ) {
    return;
  }

  try {
    console.warn(
      JSON.stringify({
        event: "db.transaction.diagnostic",
        action: "getPauseState",
        ...diagnostics,
      })
    );
  } catch {
    return;
  }
}

function getErrorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return undefined;
}

function toPauseSessionData(
  session: PauseSession | PauseResistanceSession
): PauseSessionData {
  return {
    id: session.id,
    durationSecs: session.durationSecs,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    endedEarly: session.endedEarly,
    outcome: session.outcome,
    pickingFollowUpCompleted: session.pickingFollowUpCompleted,
  };
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;

  if (typeof userId !== "string" || userId.length === 0) {
    throw new PauseActionError(
      "UNAUTHENTICATED",
      "Silakan masuk untuk menggunakan Pause."
    );
  }

  return userId;
}

function actionFailure<T>(action: string, error: unknown): PauseActionResult<T> {
  if (error instanceof PauseActionError) {
    return { success: false, code: error.code, error: error.message };
  }

  console.error(`Pause action "${action}" failed:`, error);
  return {
    success: false,
    code: "INTERNAL_ERROR",
    error: "Terjadi kesalahan saat menyimpan sesi Pause. Silakan coba lagi.",
  };
}

async function lockUserRow(
  transaction: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string
): Promise<void> {
  const users = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "User"
    WHERE "id" = ${userId}
    FOR UPDATE
  `;

  if (users.length === 0) {
    throw new PauseActionError(
      "UNAUTHENTICATED",
      "Sesi akun tidak lagi valid. Silakan masuk kembali."
    );
  }
}

export async function getPauseState(
  caller: PauseStateCaller = "pause-page"
): Promise<
  PauseActionResult<{
    session: PauseSessionData | null;
    pickingFollowUps: PauseSessionData[];
  }>
> {
  try {
    const userId = await requireUserId();
    const diagnosticCaller: PauseStateCaller | "unknown" =
      (PAUSE_STATE_CALLERS as readonly string[]).includes(caller)
        ? caller
        : "unknown";
    const correlationId = randomUUID();
    const poolBefore = getDatabasePoolSnapshot();
    const queryDurationsMs: PauseStateQueryDurations = {};
    const queryRowCounts: PauseStateDiagnostics["queryRowCounts"] = {
      pauseUnresolved: null,
      pauseFollowUpCandidates: null,
      pauseFollowUps: null,
    };
    let callbackStartedAt: number | null = null;
    let callbackFinishedAt: number | null = null;
    const transactionCallStartedAt = performance.now();
    let result: {
      session: PauseSession | null;
      pickingFollowUps: PauseSession[];
    };

    try {
      result = await prisma.$transaction(
        async (transaction) => {
          callbackStartedAt = performance.now();
          const unresolvedSessions = await measurePauseStateQuery(
            queryDurationsMs,
            "pause.unresolved",
            () =>
              transaction.pauseSession.findMany({
                where: { userId, outcome: null },
                orderBy: { startedAt: "asc" },
              })
          );
          queryRowCounts.pauseUnresolved = unresolvedSessions.length;
          const session = selectPauseSessionToResume(unresolvedSessions);

          const pickingFollowUpCandidates = await measurePauseStateQuery(
            queryDurationsMs,
            "pause.followups",
            () =>
              transaction.pauseSession.findMany({
                where: {
                  userId,
                  outcome: "PICKED",
                  pickingFollowUpCompleted: false,
                },
                orderBy: { startedAt: "desc" },
              })
          );
          queryRowCounts.pauseFollowUpCandidates =
            pickingFollowUpCandidates.length;
          const pickingFollowUps = selectPendingPickingFollowUps(
            userId,
            pickingFollowUpCandidates
          );
          queryRowCounts.pauseFollowUps = pickingFollowUps.length;
          callbackFinishedAt = performance.now();
          return { session, pickingFollowUps };
        },
        { maxWait: 5000, isolationLevel: "RepeatableRead" }
      );
    } catch (error: unknown) {
      const transactionFinishedAt = performance.now();
      logPauseStateDiagnostics(
        {
          correlationId,
          caller: diagnosticCaller,
          callbackStarted: callbackStartedAt !== null,
          transactionStartWaitMs:
            callbackStartedAt === null
              ? null
              : callbackStartedAt - transactionCallStartedAt,
          callbackDurationMs:
            callbackStartedAt === null || callbackFinishedAt === null
              ? null
              : callbackFinishedAt - callbackStartedAt,
          transactionCompletionMs:
            callbackFinishedAt === null
              ? null
              : transactionFinishedAt - callbackFinishedAt,
          transactionTotalMs:
            transactionFinishedAt - transactionCallStartedAt,
          queryDurationsMs,
          queryRowCounts,
          poolBefore,
          poolAfter: getDatabasePoolSnapshot(),
          errorCode: getErrorCode(error),
        },
        true
      );
      throw error;
    }

    const transactionFinishedAt = performance.now();
    logPauseStateDiagnostics(
      {
        correlationId,
        caller: diagnosticCaller,
        callbackStarted: callbackStartedAt !== null,
        transactionStartWaitMs:
          callbackStartedAt === null
            ? null
            : callbackStartedAt - transactionCallStartedAt,
        callbackDurationMs:
          callbackStartedAt === null || callbackFinishedAt === null
            ? null
            : callbackFinishedAt - callbackStartedAt,
        transactionCompletionMs:
          callbackFinishedAt === null
            ? null
            : transactionFinishedAt - callbackFinishedAt,
        transactionTotalMs: transactionFinishedAt - transactionCallStartedAt,
        queryDurationsMs,
        queryRowCounts,
        poolBefore,
        poolAfter: getDatabasePoolSnapshot(),
      },
      false
    );

    return {
      success: true,
      data: {
        session: result.session ? toPauseSessionData(result.session) : null,
        pickingFollowUps: result.pickingFollowUps.map(toPauseSessionData),
      },
    };
  } catch (error: unknown) {
    return actionFailure("getPauseState", error);
  }
}

export async function startPauseSession(
  input: unknown
): Promise<PauseActionResult<{ session: PauseSessionData; resumed: boolean }>> {
  const parsed = startPauseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      code: "INVALID_INPUT",
      error: parsed.error.issues[0]?.message ?? "Data sesi Pause tidak valid.",
    };
  }

  try {
    const userId = await requireUserId();
    const { durationSecs, requestId } = parsed.data;

    const result = await prisma.$transaction(async (transaction) => {
      await lockUserRow(transaction, userId);

      const requestedSession = await transaction.pauseSession.findUnique({
        where: { id: requestId },
      });

      if (requestedSession) {
        if (requestedSession.userId !== userId) {
          throw new PauseActionError(
            "SESSION_CONFLICT",
            "Permintaan sesi tidak dapat digunakan."
          );
        }
        if (requestedSession.durationSecs !== durationSecs) {
          throw new PauseActionError(
            "SESSION_CONFLICT",
            "ID permintaan sudah digunakan untuk durasi yang berbeda."
          );
        }
        if (!canResumePauseStartRequest(requestedSession)) {
          throw new PauseActionError(
            "SESSION_CONFLICT",
            "ID permintaan sudah digunakan oleh sesi Pause yang selesai."
          );
        }
        return { session: requestedSession, resumed: true };
      }

      const unresolvedSessions = await transaction.pauseSession.findMany({
        where: { userId, outcome: null },
        orderBy: { startedAt: "asc" },
      });
      const unresolved = selectPauseSessionToResume(unresolvedSessions);
      if (unresolved) {
        return { session: unresolved, resumed: true };
      }

      const createdSession = await transaction.pauseSession.create({
        data: {
          id: requestId,
          userId,
          durationSecs,
        },
      });

      return { session: createdSession, resumed: false };
    });

    return {
      success: true,
      data: {
        session: toPauseSessionData(result.session),
        resumed: result.resumed,
      },
    };
  } catch (error: unknown) {
    return actionFailure("startPauseSession", error);
  }
}

export async function endPauseEarly(
  input: unknown
): Promise<PauseActionResult<{ session: PauseSessionData; endedEarly: boolean }>> {
  const parsed = pauseSessionIdSchema.safeParse(
    typeof input === "object" && input !== null && "sessionId" in input
      ? input.sessionId
      : input
  );
  if (!parsed.success) {
    return {
      success: false,
      code: "INVALID_INPUT",
      error: "ID sesi Pause tidak valid.",
    };
  }

  try {
    const userId = await requireUserId();
    const sessionId = parsed.data;
    const session = await prisma.$transaction(async (transaction) => {
      const lockedSessions = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "PauseSession"
        WHERE "id" = ${sessionId} AND "userId" = ${userId}
        FOR UPDATE
      `;

      if (lockedSessions.length === 0) {
        throw new PauseActionError(
          "SESSION_NOT_FOUND",
          "Sesi Pause tidak ditemukan."
        );
      }

      const current = await transaction.pauseSession.findUniqueOrThrow({
        where: { id: sessionId },
      });

      if (current.outcome !== null) {
        throw new PauseActionError(
          "SESSION_ALREADY_ENDED",
          "Sesi Pause ini sudah selesai."
        );
      }

      if (current.endedAt) {
        return current;
      }

      const reachedDeadline =
        Date.now() >=
        current.startedAt.getTime() + current.durationSecs * 1000;
      return transaction.pauseSession.update({
        where: { id: sessionId },
        data: { endedAt: new Date(), endedEarly: !reachedDeadline },
      });
    });

    return {
      success: true,
      data: {
        session: toPauseSessionData(session),
        endedEarly: session.endedEarly,
      },
    };
  } catch (error: unknown) {
    return actionFailure("endPauseEarly", error);
  }
}

export async function savePauseOutcome(
  input: unknown
): Promise<PauseActionResult<{ session: PauseSessionData; needsPickingDetails: boolean }>> {
  const parsed = finishPauseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      code: "INVALID_INPUT",
      error: parsed.error.issues[0]?.message ?? "Hasil Pause tidak valid.",
    };
  }

  if (shouldCreatePauseResistance(parsed.data.outcome)) {
    const parsedResistance = pauseResistanceInputSchema.safeParse(input);
    if (!parsedResistance.success) {
      return {
        success: false,
        code: "INVALID_INPUT",
        error:
          parsedResistance.error.issues[0]?.message ??
          "Data keberhasilan tidak valid.",
      };
    }

    try {
      const userId = await requireUserId();
      const savedSession = await savePauseResistanceOutcome(
        {
          transaction: (callback) =>
            prisma.$transaction(async (transaction) =>
              callback({
                async lockOwnedSession(sessionId, ownerId) {
                  const rows = await transaction.$queryRaw<Array<{ id: string }>>`
                    SELECT "id"
                    FROM "PauseSession"
                    WHERE "id" = ${sessionId} AND "userId" = ${ownerId}
                    FOR UPDATE
                  `;
                  return rows.length === 1;
                },
                findSession(sessionId) {
                  return transaction.pauseSession.findUnique({
                    where: { id: sessionId },
                  });
                },
                async findResistanceOwner(sessionId) {
                  const resistance = await transaction.resistance.findUnique({
                    where: { pauseSessionId: sessionId },
                    select: { userId: true },
                  });
                  return resistance?.userId ?? null;
                },
                async createResistance(data) {
                  return transaction.resistance.create({ data });
                },
                updateSession(sessionId, data) {
                  return transaction.pauseSession.update({
                    where: { id: sessionId },
                    data,
                  });
                },
              })
            ),
        },
        userId,
        parsedResistance.data.sessionId,
        parsedResistance.data
      );

      revalidatePath("/resistance");
      return {
        success: true,
        data: {
          session: toPauseSessionData(savedSession),
          needsPickingDetails: false,
        },
      };
    } catch (error: unknown) {
      if (error instanceof PauseResistanceRecordError) {
        return {
          success: false,
          code: error.code,
          error: error.message,
        };
      }
      return actionFailure("savePauseOutcome", error);
    }
  }

  try {
    const userId = await requireUserId();
    const { sessionId, outcome } = parsed.data;

    const result = await prisma.$transaction(async (transaction) => {
      const lockedSessions = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "PauseSession"
        WHERE "id" = ${sessionId} AND "userId" = ${userId}
        FOR UPDATE
      `;

      if (lockedSessions.length === 0) {
        throw new PauseActionError(
          "SESSION_NOT_FOUND",
          "Sesi Pause tidak ditemukan."
        );
      }

      const current = await transaction.pauseSession.findUniqueOrThrow({
        where: { id: sessionId },
      });

      if (current.outcome !== null) {
        if (current.outcome !== outcome) {
          throw new PauseActionError(
            "SESSION_ALREADY_ENDED",
            "Hasil sesi Pause ini sudah tersimpan."
          );
        }
      } else {
        let endedAt = current.endedAt;
        if (!endedAt) {
          const deadline =
            current.startedAt.getTime() + current.durationSecs * 1000;
          if (Date.now() < deadline) {
            throw new PauseActionError(
              "SESSION_STILL_RUNNING",
              "Sesi Pause belum mencapai durasi yang dipilih."
            );
          }
          endedAt = new Date();
        }

        const updatedSession = await transaction.pauseSession.update({
          where: { id: sessionId },
          data: { endedAt, outcome },
        });
        const pickingEvent =
          outcome === "PICKED"
            ? await transaction.pickingEvent.findUnique({
                where: { pauseSessionId: sessionId },
                select: { userId: true },
              })
            : null;

        if (pickingEvent && pickingEvent.userId !== userId) {
          throw new PauseActionError(
            "INTEGRITY_ERROR",
            "Catatan picking sesi ini tidak sesuai dengan pemiliknya."
          );
        }

        return {
          session: updatedSession,
          needsPickingDetails: isPickingDetailsPending(
            outcome,
            updatedSession.pickingFollowUpCompleted
          ),
        };
      }

      const pickingEvent =
        outcome === "PICKED"
          ? await transaction.pickingEvent.findUnique({
              where: { pauseSessionId: sessionId },
              select: { userId: true },
            })
          : null;
      if (pickingEvent && pickingEvent.userId !== userId) {
        throw new PauseActionError(
          "INTEGRITY_ERROR",
          "Catatan picking sesi ini tidak sesuai dengan pemiliknya."
        );
      }
      return {
        session: current,
        needsPickingDetails: isPickingDetailsPending(
          outcome,
          current.pickingFollowUpCompleted
        ),
      };
    });

    return {
      success: true,
      data: {
        session: toPauseSessionData(result.session),
        needsPickingDetails: result.needsPickingDetails,
      },
    };
  } catch (error: unknown) {
    return actionFailure("savePauseOutcome", error);
  }
}
