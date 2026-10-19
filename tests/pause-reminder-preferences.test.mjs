import assert from "node:assert/strict";
import test from "node:test";
import {
  claimPauseReminder,
  DEFAULT_PAUSE_REMINDER_PREFERENCES,
  PAUSE_REMINDER_AUDIOS,
  readPauseReminderPreferences,
  writePauseReminderPreferences,
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

test("defaults to enabled gentle chimes and exposes three CC0 audio choices", () => {
  assert.deepEqual(
    DEFAULT_PAUSE_REMINDER_PREFERENCES,
    { audioEnabled: true, selectedAudio: "gentle-chimes" }
  );
  assert.equal(PAUSE_REMINDER_AUDIOS.length, 3);
  assert.ok(
    PAUSE_REMINDER_AUDIOS.every((audio) =>
      audio.licenseUrl.includes("publicdomain/zero/1.0")
    )
  );
});

test("reads valid preferences and falls back safely for invalid values", () => {
  const storage = new MemoryStorage();
  assert.deepEqual(readPauseReminderPreferences(storage), {
    preferences: DEFAULT_PAUSE_REMINDER_PREFERENCES,
    storageAvailable: true,
  });

  storage.setItem(
    "jerawat-hunter:pause-reminder:preferences:v1",
    JSON.stringify({ audioEnabled: false, selectedAudio: "ambient-bell" })
  );
  assert.deepEqual(readPauseReminderPreferences(storage).preferences, {
    audioEnabled: false,
    selectedAudio: "ambient-bell",
  });

  storage.setItem(
    "jerawat-hunter:pause-reminder:preferences:v1",
    JSON.stringify({ audioEnabled: "yes", selectedAudio: "../../unknown.mp3" })
  );
  assert.deepEqual(
    readPauseReminderPreferences(storage).preferences,
    DEFAULT_PAUSE_REMINDER_PREFERENCES
  );
});

test("falls back safely for malformed data and unavailable storage", () => {
  const storage = new MemoryStorage();
  storage.setItem("jerawat-hunter:pause-reminder:preferences:v1", "{broken");
  assert.deepEqual(readPauseReminderPreferences(storage), {
    preferences: DEFAULT_PAUSE_REMINDER_PREFERENCES,
    storageAvailable: true,
  });

  const unavailableStorage = {
    getItem() {
      throw new Error("storage unavailable");
    },
    setItem() {
      throw new Error("storage unavailable");
    },
  };
  assert.deepEqual(readPauseReminderPreferences(unavailableStorage), {
    preferences: DEFAULT_PAUSE_REMINDER_PREFERENCES,
    storageAvailable: false,
  });
  assert.equal(
    writePauseReminderPreferences(
      DEFAULT_PAUSE_REMINDER_PREFERENCES,
      unavailableStorage
    ),
    false
  );
});

test("writes preferences and claims each session only once when storage works", () => {
  const storage = new MemoryStorage();
  assert.equal(
    writePauseReminderPreferences(
      { audioEnabled: false, selectedAudio: "soft-chime" },
      storage
    ),
    true
  );
  assert.deepEqual(readPauseReminderPreferences(storage).preferences, {
    audioEnabled: false,
    selectedAudio: "soft-chime",
  });

  assert.equal(claimPauseReminder("pause-a", storage), "claimed");
  assert.equal(claimPauseReminder("pause-a", storage), "already-claimed");
  assert.equal(claimPauseReminder("pause-b", storage), "claimed");
});
