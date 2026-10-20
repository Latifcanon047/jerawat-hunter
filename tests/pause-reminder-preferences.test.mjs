import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
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

test("keeps the original defaults and exposes six CC0 audio choices", () => {
  assert.deepEqual(
    DEFAULT_PAUSE_REMINDER_PREFERENCES,
    { audioEnabled: true, selectedAudio: "gentle-chimes" }
  );
  assert.deepEqual(
    PAUSE_REMINDER_AUDIOS.slice(0, 3).map((audio) => audio.id),
    ["gentle-chimes", "ambient-bell", "soft-chime"]
  );
  assert.deepEqual(
    PAUSE_REMINDER_AUDIOS.slice(3).map((audio) => audio.id),
    ["pulse-signal", "digital-alert", "bright-chime"]
  );
  assert.equal(PAUSE_REMINDER_AUDIOS.length, 6);
  assert.ok(
    PAUSE_REMINDER_AUDIOS.every((audio) =>
      audio.licenseUrl.includes("publicdomain/zero/1.0")
    )
  );
  assert.ok(
    PAUSE_REMINDER_AUDIOS.slice(3).every(
      (audio) => audio.creator === "Jerawat Hunter" && audio.sourceUrl === null
    )
  );
});

test("ships original synthesized sounds as unclipped PCM WAV assets", () => {
  for (const audio of PAUSE_REMINDER_AUDIOS.slice(3)) {
    const filePath = path.join(
      process.cwd(),
      "public",
      audio.src.replace(/^\//, "")
    );
    const wav = readFileSync(filePath);
    assert.equal(wav.toString("ascii", 0, 4), "RIFF");
    assert.equal(wav.toString("ascii", 8, 12), "WAVE");
    assert.equal(wav.readUInt16LE(20), 1);
    assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt32LE(24), 44100);
    assert.equal(wav.readUInt16LE(34), 16);

    let peak = 0;
    for (let offset = 44; offset + 1 < wav.length; offset += 2) {
      peak = Math.max(peak, Math.abs(wav.readInt16LE(offset)) / 32768);
    }
    assert.ok(peak <= 0.671, `${audio.id} peak was ${peak}`);
  }
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

test("persists selections for all six presets without changing the default", () => {
  const storage = new MemoryStorage();
  assert.equal(DEFAULT_PAUSE_REMINDER_PREFERENCES.selectedAudio, "gentle-chimes");

  for (const audio of PAUSE_REMINDER_AUDIOS) {
    assert.equal(
      writePauseReminderPreferences(
        { audioEnabled: true, selectedAudio: audio.id },
        storage
      ),
      true
    );
    assert.equal(
      readPauseReminderPreferences(storage).preferences.selectedAudio,
      audio.id
    );
  }
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
