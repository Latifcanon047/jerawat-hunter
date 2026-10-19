export const PAUSE_REMINDER_AUDIOS = [
  {
    id: "gentle-chimes",
    label: "Lonceng lembut",
    src: "/audio/gentle-chimes.mp3",
    creator: "Vendarro",
    sourceUrl: "https://freesound.org/people/Vendarro/sounds/399538",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
  {
    id: "ambient-bell",
    label: "Lonceng ambient",
    src: "/audio/ambient-bell.mp3",
    creator: "Divinux",
    sourceUrl: "https://freesound.org/people/Divinux/sounds/198416",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
  {
    id: "soft-chime",
    label: "Chime singkat",
    src: "/audio/soft-chime.mp3",
    creator: "Jofae",
    sourceUrl: "https://freesound.org/people/Jofae/sounds/380482",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
] as const;

export type PauseReminderAudioId =
  (typeof PAUSE_REMINDER_AUDIOS)[number]["id"];

export interface PauseReminderPreferences {
  audioEnabled: boolean;
  selectedAudio: PauseReminderAudioId;
}

export interface PauseReminderStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PauseReminderSessionState {
  endedAt: string | null;
  endedEarly: boolean;
  outcome: string | null;
}

export const DEFAULT_PAUSE_REMINDER_PREFERENCES: PauseReminderPreferences = {
  audioEnabled: true,
  selectedAudio: "gentle-chimes",
};

const PREFERENCES_KEY = "jerawat-hunter:pause-reminder:preferences:v1";
const PROCESSED_SESSIONS_KEY =
  "jerawat-hunter:pause-reminder:processed-sessions:v1";
const MAX_PROCESSED_SESSION_IDS = 100;

export function shouldTriggerPauseReminder(
  session: PauseReminderSessionState
): boolean {
  return session.endedAt !== null && !session.endedEarly && session.outcome === null;
}

function getBrowserStorage(): PauseReminderStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function resolveStorage(
  storage: PauseReminderStorage | undefined
): PauseReminderStorage | null {
  return storage ?? getBrowserStorage();
}

function isPauseReminderAudioId(value: unknown): value is PauseReminderAudioId {
  return PAUSE_REMINDER_AUDIOS.some((audio) => audio.id === value);
}

function parsePreferences(value: unknown): PauseReminderPreferences {
  if (typeof value !== "object" || value === null) {
    return DEFAULT_PAUSE_REMINDER_PREFERENCES;
  }
  const candidate = value as Record<string, unknown>;
  return {
    audioEnabled:
      typeof candidate.audioEnabled === "boolean"
        ? candidate.audioEnabled
        : DEFAULT_PAUSE_REMINDER_PREFERENCES.audioEnabled,
    selectedAudio: isPauseReminderAudioId(candidate.selectedAudio)
      ? candidate.selectedAudio
      : DEFAULT_PAUSE_REMINDER_PREFERENCES.selectedAudio,
  };
}

export function readPauseReminderPreferences(
  storage?: PauseReminderStorage
): { preferences: PauseReminderPreferences; storageAvailable: boolean } {
  const target = resolveStorage(storage);
  if (!target) {
    return {
      preferences: DEFAULT_PAUSE_REMINDER_PREFERENCES,
      storageAvailable: false,
    };
  }

  let raw: string | null;
  try {
    raw = target.getItem(PREFERENCES_KEY);
  } catch {
    return {
      preferences: DEFAULT_PAUSE_REMINDER_PREFERENCES,
      storageAvailable: false,
    };
  }

  if (raw === null) {
    return {
      preferences: DEFAULT_PAUSE_REMINDER_PREFERENCES,
      storageAvailable: true,
    };
  }

  try {
    return {
      preferences: parsePreferences(JSON.parse(raw)),
      storageAvailable: true,
    };
  } catch {
    return {
      preferences: DEFAULT_PAUSE_REMINDER_PREFERENCES,
      storageAvailable: true,
    };
  }
}

export function writePauseReminderPreferences(
  preferences: PauseReminderPreferences,
  storage?: PauseReminderStorage
): boolean {
  const target = resolveStorage(storage);
  if (!target) return false;

  try {
    target.setItem(
      PREFERENCES_KEY,
      JSON.stringify(parsePreferences(preferences))
    );
    return true;
  } catch {
    return false;
  }
}

export type PauseReminderClaimResult =
  | "claimed"
  | "already-claimed"
  | "storage-unavailable";

export function claimPauseReminder(
  sessionId: string,
  storage?: PauseReminderStorage
): PauseReminderClaimResult {
  const target = resolveStorage(storage);
  if (!target || !sessionId) return "storage-unavailable";

  let raw: string | null;
  try {
    raw = target.getItem(PROCESSED_SESSIONS_KEY);
  } catch {
    return "storage-unavailable";
  }

  let sessionIds: string[] = [];
  if (raw !== null) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        sessionIds = parsed.filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0
        );
      }
    } catch {
      sessionIds = [];
    }
  }

  if (sessionIds.includes(sessionId)) return "already-claimed";

  try {
    target.setItem(
      PROCESSED_SESSIONS_KEY,
      JSON.stringify(
        [...sessionIds, sessionId].slice(-MAX_PROCESSED_SESSION_IDS)
      )
    );
    return "claimed";
  } catch {
    return "storage-unavailable";
  }
}
