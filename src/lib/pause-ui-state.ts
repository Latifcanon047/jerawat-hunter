interface CompletedPickingResult {
  session: { id: string };
  outcome: string;
}

interface PauseStateSnapshot {
  session: { id: string } | null;
  pickingFollowUps: { id: string }[];
}

export function getVisibleCompletedPauseResult<T>(
  pauseStateVerified: boolean,
  session: { id: string } | null,
  completed: T | null
): T | null {
  return pauseStateVerified && !session ? completed : null;
}

export function shouldClearCompletedPauseResultOnEntry(
  completed: CompletedPickingResult | null,
  serverState: PauseStateSnapshot
): boolean {
  if (!completed) return false;
  if (serverState.session && serverState.session.id === completed.session.id) {
    return false;
  }
  if (completed.outcome === "PICKED") {
    return shouldClearCompletedPickingResult(completed, serverState);
  }
  return true;
}

export function shouldClearCompletedPickingResult(
  completed: CompletedPickingResult | null,
  serverState: PauseStateSnapshot
): boolean {
  if (!completed || completed.outcome !== "PICKED") return false;
  if (serverState.session) return true;

  return !serverState.pickingFollowUps.some(
    (followUp) => followUp.id === completed.session.id
  );
}
