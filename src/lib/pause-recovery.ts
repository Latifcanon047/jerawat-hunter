export interface PauseRecoveryCandidate {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  outcome: string | null;
}

export function canResumePauseStartRequest(
  session: Pick<PauseRecoveryCandidate, "outcome">
): boolean {
  return session.outcome === null;
}

export function selectPauseSessionToResume<
  T extends PauseRecoveryCandidate,
>(sessions: readonly T[]): T | null {
  const unresolved = sessions.filter((session) => session.outcome === null);
  if (unresolved.length === 0) return null;

  return [...unresolved].sort((left, right) => {
    const leftIsRunning = left.endedAt === null;
    const rightIsRunning = right.endedAt === null;
    if (leftIsRunning !== rightIsRunning) {
      return leftIsRunning ? -1 : 1;
    }
    return (
      left.startedAt.getTime() - right.startedAt.getTime() ||
      (left.endedAt?.getTime() ?? 0) - (right.endedAt?.getTime() ?? 0) ||
      left.id.localeCompare(right.id)
    );
  })[0];
}
