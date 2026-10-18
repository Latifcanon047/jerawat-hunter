export interface PauseClockSession {
  id: string;
  startedAt: string;
  durationSecs: number;
}

export function getPauseDeadlineMs(
  startedAt: string,
  durationSecs: number
): number | null {
  if (
    typeof startedAt !== "string" ||
    !Number.isInteger(durationSecs) ||
    durationSecs <= 0
  ) {
    return null;
  }

  const startedAtMs = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs)) return null;

  const deadlineMs = startedAtMs + durationSecs * 1000;
  return Number.isFinite(deadlineMs) ? deadlineMs : null;
}

export function getPauseRemainingSeconds(
  startedAt: string,
  durationSecs: number,
  nowMs = Date.now()
): number | null {
  const deadlineMs = getPauseDeadlineMs(startedAt, durationSecs);
  if (deadlineMs === null || !Number.isFinite(nowMs)) return null;
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

export function shouldSyncPauseDeadline(
  expectedSession: PauseClockSession,
  activeSession: PauseClockSession | null,
  nowMs = Date.now()
): boolean {
  if (
    !activeSession ||
    activeSession.id !== expectedSession.id ||
    activeSession.startedAt !== expectedSession.startedAt ||
    activeSession.durationSecs !== expectedSession.durationSecs ||
    !Number.isFinite(nowMs)
  ) {
    return false;
  }

  const deadlineMs = getPauseDeadlineMs(
    expectedSession.startedAt,
    expectedSession.durationSecs
  );
  return deadlineMs !== null && nowMs >= deadlineMs;
}
