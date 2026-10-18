export interface PickingFollowUpCandidate {
  userId: string;
  outcome: string | null;
  pickingFollowUpCompleted: boolean;
}

export function selectPendingPickingFollowUps<
  T extends PickingFollowUpCandidate,
>(userId: string, candidates: readonly T[]): T[] {
  return candidates.filter(
    (candidate) =>
      candidate.userId === userId &&
      candidate.outcome === "PICKED" &&
      !candidate.pickingFollowUpCompleted
  );
}

export function isPickingDetailsPending(
  outcome: string | null,
  pickingFollowUpCompleted: boolean
): boolean {
  return outcome === "PICKED" && !pickingFollowUpCompleted;
}
