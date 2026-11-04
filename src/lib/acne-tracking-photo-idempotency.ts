import { createHash } from "node:crypto";

export function parseAcneTrackingPhotoRequestKey(
  value: string | null
): string | null {
  const key = value?.trim();
  if (!key || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    return null;
  }
  return key;
}

export function fingerprintAcneTrackingPhoto(
  photoBytes: Uint8Array,
  markerX: number,
  markerY: number
): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify({ version: 1, markerX, markerY }));
  hash.update("\0");
  hash.update(photoBytes);
  return hash.digest("hex");
}

export type AcneTrackingPhotoRequestState =
  | "PENDING"
  | "COMPLETED"
  | "FAILED";

export function getAcneTrackingPhotoReplayAction(
  storedFingerprint: string,
  requestFingerprint: string,
  status: AcneTrackingPhotoRequestState
): "KEY_REUSED" | "IN_PROGRESS" | "REPLAY_COMPLETED" | "REPLAY_FAILED" {
  if (storedFingerprint !== requestFingerprint) return "KEY_REUSED";
  if (status === "PENDING") return "IN_PROGRESS";
  return status === "COMPLETED" ? "REPLAY_COMPLETED" : "REPLAY_FAILED";
}
