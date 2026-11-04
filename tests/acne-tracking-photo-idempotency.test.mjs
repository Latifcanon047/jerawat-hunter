import assert from "node:assert/strict";
import test from "node:test";
import {
  fingerprintAcneTrackingPhoto,
  getAcneTrackingPhotoReplayAction,
  parseAcneTrackingPhotoRequestKey,
} from "../src/lib/acne-tracking-photo-idempotency.ts";

test("validates photo replacement idempotency keys", () => {
  assert.equal(parseAcneTrackingPhotoRequestKey("  retry-key_1 "), "retry-key_1");
  assert.equal(parseAcneTrackingPhotoRequestKey(null), null);
  assert.equal(parseAcneTrackingPhotoRequestKey(""), null);
  assert.equal(parseAcneTrackingPhotoRequestKey("invalid key"), null);
  assert.equal(parseAcneTrackingPhotoRequestKey("a".repeat(129)), null);
});

test("fingerprints normalized photo bytes and marker coordinates deterministically", () => {
  const image = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
  const original = fingerprintAcneTrackingPhoto(image, 0.25, 0.75);

  assert.equal(
    fingerprintAcneTrackingPhoto(new Uint8Array(image), 0.25, 0.75),
    original
  );
  assert.notEqual(
    fingerprintAcneTrackingPhoto(image, 0.5, 0.75),
    original
  );
  assert.notEqual(
    fingerprintAcneTrackingPhoto(new Uint8Array([0xff, 0xd8, 0xff, 0x01]), 0.25, 0.75),
    original
  );
});

test("selects replay behavior for existing photo operations", () => {
  assert.equal(
    getAcneTrackingPhotoReplayAction("same", "different", "PENDING"),
    "KEY_REUSED"
  );
  assert.equal(
    getAcneTrackingPhotoReplayAction("same", "same", "PENDING"),
    "IN_PROGRESS"
  );
  assert.equal(
    getAcneTrackingPhotoReplayAction("same", "same", "COMPLETED"),
    "REPLAY_COMPLETED"
  );
  assert.equal(
    getAcneTrackingPhotoReplayAction("same", "same", "FAILED"),
    "REPLAY_FAILED"
  );
});
