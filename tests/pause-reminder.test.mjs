import assert from "node:assert/strict";
import test from "node:test";
import {
  claimPauseReminder,
  shouldTriggerPauseReminder,
} from "../src/lib/pause-reminder-preferences.ts";

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }
}

test("a persistent marker prevents another automatic reminder for the same session", () => {
  const storage = new MemoryStorage();

  assert.equal(claimPauseReminder("pause-1", storage), "claimed");
  assert.equal(claimPauseReminder("pause-1", storage), "already-claimed");
  assert.equal(claimPauseReminder("pause-2", storage), "claimed");
});

test("malformed reminder markers are replaced and storage failures are surfaced", () => {
  const storage = new MemoryStorage();
  storage.setItem(
    "jerawat-hunter:pause-reminder:processed-sessions:v1",
    "{broken"
  );
  assert.equal(claimPauseReminder("pause-1", storage), "claimed");

  const unavailableStorage = {
    getItem() {
      throw new Error("storage unavailable");
    },
    setItem() {
      throw new Error("storage unavailable");
    },
  };
  assert.equal(
    claimPauseReminder("pause-1", unavailableStorage),
    "storage-unavailable"
  );
});

test("only a server-confirmed normal end without an outcome can trigger a reminder", () => {
  assert.equal(
    shouldTriggerPauseReminder({
      endedAt: "2026-10-19T05:00:00.000Z",
      endedEarly: false,
      outcome: null,
    }),
    true
  );
  assert.equal(
    shouldTriggerPauseReminder({
      endedAt: null,
      endedEarly: false,
      outcome: null,
    }),
    false
  );
  assert.equal(
    shouldTriggerPauseReminder({
      endedAt: "2026-10-19T05:00:00.000Z",
      endedEarly: true,
      outcome: null,
    }),
    false
  );
  assert.equal(
    shouldTriggerPauseReminder({
      endedAt: "2026-10-19T05:00:00.000Z",
      endedEarly: false,
      outcome: "STILL_RESISTING",
    }),
    false
  );
});
