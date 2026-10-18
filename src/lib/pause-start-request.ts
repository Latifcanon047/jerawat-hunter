export interface PauseStartRequest {
  durationSecs: number;
  requestId: string;
}

export function createPauseStartRequest(
  durationSecs: number,
  retry: boolean,
  pendingRequest: PauseStartRequest | null,
  createRequestId: () => string
): PauseStartRequest {
  if (retry && pendingRequest?.durationSecs === durationSecs) {
    return pendingRequest;
  }
  return { durationSecs, requestId: createRequestId() };
}
