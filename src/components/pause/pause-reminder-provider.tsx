"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  endPauseEarly,
  getPauseState,
  type PauseSessionData,
} from "@/actions/pause";
import {
  getPauseDeadlineMs,
  shouldSyncPauseDeadline,
} from "@/lib/pause-clock";
import {
  claimPauseReminder,
  DEFAULT_PAUSE_REMINDER_PREFERENCES,
  PAUSE_REMINDER_AUDIOS,
  readPauseReminderPreferences,
  shouldTriggerPauseReminder,
  writePauseReminderPreferences,
  type PauseReminderAudioId,
  type PauseReminderPreferences,
} from "@/lib/pause-reminder-preferences";
import {
  detectPauseNotificationPlatform,
  requestPauseNotificationPermission,
  resolvePauseNotificationPermissionState,
  type PauseNotificationPermissionState,
} from "@/lib/pause-notification-permission";

type AudioStatus =
  | "idle"
  | "disabled"
  | "playing"
  | "failed"
  | "completed"
  | "stopped";
type NotificationStatus =
  | "idle"
  | "permission-required"
  | "denied"
  | "unsupported"
  | "shown"
  | "failed"
  | "already-processed";
interface PauseReminderContextValue {
  preferences: PauseReminderPreferences;
  preferencesReady: boolean;
  storageAvailable: boolean;
  notificationPermission: PauseNotificationPermissionState;
  audioStatus: AudioStatus;
  notificationStatus: NotificationStatus;
  monitorError: string;
  reminderSessionId: string | null;
  setSession: (session: PauseSessionData | null) => void;
  savePreferences: (preferences: PauseReminderPreferences) => void;
  requestNotificationPermission: () => Promise<void>;
  stopAudio: () => void;
  playManualAudio: () => void;
}

const PauseReminderContext = createContext<PauseReminderContextValue | null>(
  null
);

const AUTH_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
];

function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

function readNotificationPermissionState(): PauseNotificationPermissionState {
  const notificationApiAvailable = typeof Notification !== "undefined";
  const serviceWorkerApiAvailable =
    typeof navigator !== "undefined" && "serviceWorker" in navigator;
  const platform =
    typeof navigator === "undefined"
      ? "other"
      : detectPauseNotificationPlatform(
          navigator.userAgent,
          navigator.platform,
          navigator.maxTouchPoints
        );
  let permission: NotificationPermission | undefined;

  if (notificationApiAvailable) {
    try {
      permission = Notification.permission;
    } catch {
      return "error";
    }
  }

  return resolvePauseNotificationPermissionState(
    {
      notificationApiAvailable,
      serviceWorkerApiAvailable,
      isIos: platform === "ios-safari" || platform === "ios-other",
    },
    permission
  );
}

function updateNotificationStatusForPermission(
  permission: PauseNotificationPermissionState,
  setPermission: (permission: PauseNotificationPermissionState) => void,
  setStatus: (status: NotificationStatus) => void
): void {
  setPermission(permission);
  switch (permission) {
    case "default":
      setStatus("permission-required");
      break;
    case "denied":
      setStatus("denied");
      break;
    case "granted":
      setStatus("idle");
      break;
    case "notification-unsupported":
    case "service-worker-unsupported":
    case "ios-unsupported":
      setStatus("unsupported");
      break;
    case "checking":
      break;
    case "error":
      setStatus("failed");
      break;
  }
}

async function getNotificationClientId(
  registration: ServiceWorkerRegistration
): Promise<string | null> {
  if (typeof MessageChannel === "undefined") return null;

  try {
    const worker = registration.active ?? navigator.serviceWorker.controller;
    if (!worker) return null;

    return await new Promise((resolve) => {
      const channel = new MessageChannel();
      const timeout = window.setTimeout(() => {
        channel.port1.close();
        channel.port2.close();
        resolve(null);
      }, 1000);
      channel.port1.onmessage = (event: MessageEvent<{ clientId?: unknown }>) => {
        window.clearTimeout(timeout);
        channel.port1.close();
        channel.port2.close();
        resolve(
          typeof event.data?.clientId === "string" ? event.data.clientId : null
        );
      };
      channel.port1.onmessageerror = () => {
        window.clearTimeout(timeout);
        channel.port1.close();
        channel.port2.close();
        resolve(null);
      };

      try {
        worker.postMessage({ type: "GET_NOTIFICATION_CLIENT_ID" }, [
          channel.port2,
        ]);
      } catch {
        window.clearTimeout(timeout);
        channel.port1.close();
        channel.port2.close();
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

export function PauseReminderProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [preferences, setPreferences] = useState<PauseReminderPreferences>(
    DEFAULT_PAUSE_REMINDER_PREFERENCES
  );
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [notificationPermission, setNotificationPermission] =
    useState<PauseNotificationPermissionState>("checking");
  const [audioStatus, setAudioStatus] = useState<AudioStatus>("idle");
  const [notificationStatus, setNotificationStatus] =
    useState<NotificationStatus>("idle");
  const [monitorError, setMonitorError] = useState("");
  const [reminderSessionId, setReminderSessionId] = useState<string | null>(
    null
  );
  const trackedSessionRef = useRef<PauseSessionData | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const notificationRegistrationRef =
    useRef<Promise<ServiceWorkerRegistration> | null>(null);
  const attemptedSessionsRef = useRef(new Set<string>());
  const syncAttemptedRef = useRef(new Set<string>());
  const refreshGenerationRef = useRef(0);

  const setSession = useCallback((session: PauseSessionData | null) => {
    trackedSessionRef.current = session;
  }, []);

  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audioRef.current = null;
    }
    setAudioStatus("stopped");
  }, []);

  const playAudio = useCallback(async (audioId: PauseReminderAudioId) => {
    const selectedAudio = PAUSE_REMINDER_AUDIOS.find(
      (audio) => audio.id === audioId
    );
    if (!selectedAudio) {
      setAudioStatus("failed");
      return;
    }

    const previousAudio = audioRef.current;
    if (previousAudio) {
      previousAudio.onended = null;
      previousAudio.onerror = null;
      previousAudio.pause();
    }

    let audio: HTMLAudioElement | null = null;
    try {
      audio = new Audio(selectedAudio.src);
      audio.loop = false;
      audio.volume = 0.9;
      audio.onended = () => {
        if (audioRef.current === audio) audioRef.current = null;
        setAudioStatus("completed");
      };
      audio.onerror = () => {
        if (audioRef.current === audio) audioRef.current = null;
        setAudioStatus("failed");
      };
      audioRef.current = audio;
      setAudioStatus("playing");
      await audio.play();
    } catch {
      if (audioRef.current === audio) audioRef.current = null;
      setAudioStatus("failed");
    }
  }, []);

  const stopAudioForDisable = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audioRef.current = null;
      setAudioStatus("stopped");
    }
  }, []);

  const savePreferences = useCallback(
    (nextPreferences: PauseReminderPreferences) => {
      setPreferences(nextPreferences);
      setStorageAvailable(writePauseReminderPreferences(nextPreferences));
      if (!nextPreferences.audioEnabled) stopAudioForDisable();
    },
    [stopAudioForDisable]
  );

  const refreshNotificationPermission = useCallback(() => {
    const permission = readNotificationPermissionState();
    updateNotificationStatusForPermission(
      permission,
      setNotificationPermission,
      setNotificationStatus
    );
    return permission;
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    const currentPermission = readNotificationPermissionState();
    setNotificationPermission(currentPermission);
    if (currentPermission !== "default" || typeof Notification === "undefined") {
      updateNotificationStatusForPermission(
        currentPermission,
        setNotificationPermission,
        setNotificationStatus
      );
      return;
    }

    try {
      const permission = await requestPauseNotificationPermission(
        currentPermission,
        () => Notification.requestPermission()
      );
      setNotificationPermission(permission);
      setNotificationStatus(
        permission === "granted"
          ? "idle"
          : permission === "denied"
            ? "denied"
            : permission === "default"
              ? "permission-required"
              : "failed"
      );
    } catch {
      setNotificationPermission("error");
      setNotificationStatus("failed");
    }
  }, []);

  const showNotification = useCallback(async () => {
    if (typeof Notification === "undefined") {
      setNotificationPermission("notification-unsupported");
      setNotificationStatus("unsupported");
      return;
    }
    if (
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      setNotificationPermission("service-worker-unsupported");
      setNotificationStatus("unsupported");
      return;
    }

    try {
      const permission = Notification.permission;
      if (permission !== "granted") {
        setNotificationPermission(permission);
        setNotificationStatus(
          permission === "denied" ? "denied" : "permission-required"
        );
        return;
      }
      let registrationPromise = notificationRegistrationRef.current;
      if (!registrationPromise) {
        registrationPromise = navigator.serviceWorker.register(
          "/pause-reminder-sw.js",
          { scope: "/" }
        );
        notificationRegistrationRef.current = registrationPromise;
      }
      let registration: ServiceWorkerRegistration;
      try {
        registration = await registrationPromise;
      } catch (error) {
        if (notificationRegistrationRef.current === registrationPromise) {
          notificationRegistrationRef.current = null;
        }
        throw error;
      }
      const sourceClientId = await getNotificationClientId(registration);
      await registration.showNotification("Waktu Pause selesai", {
        body: "Waktunya berhenti sejenak dan memilih langkah berikutnya.",
        data: { url: "/pause", sourceClientId },
      });
      setNotificationStatus("shown");
    } catch {
      setNotificationStatus("failed");
    }
  }, []);

  const processConfirmedReminder = useCallback(
    (session: PauseSessionData) => {
      if (
        !preferencesReady ||
        !shouldTriggerPauseReminder(session) ||
        trackedSessionRef.current?.id !== session.id ||
        !shouldTriggerPauseReminder(trackedSessionRef.current)
      ) {
        return;
      }
      if (attemptedSessionsRef.current.has(session.id)) return;

      attemptedSessionsRef.current.add(session.id);
      setReminderSessionId(session.id);
      const claim = claimPauseReminder(session.id);
      if (claim === "already-claimed") {
        setNotificationStatus("already-processed");
        return;
      }
      if (claim === "storage-unavailable") setStorageAvailable(false);

      if (preferences.audioEnabled) {
        void playAudio(preferences.selectedAudio);
      } else {
        setAudioStatus("disabled");
      }
      showNotification();
    },
    [playAudio, preferences, preferencesReady, showNotification]
  );

  const refreshSession = useCallback(async () => {
    const generation = ++refreshGenerationRef.current;
    try {
      const result = await getPauseState();
      if (generation !== refreshGenerationRef.current) return;
      if (!result.success) {
        setMonitorError(result.error);
        return;
      }
      setMonitorError("");
      setSession(result.data.session);
      const session = result.data.session;
      if (
        session &&
        !session.endedAt &&
        getPauseDeadlineMs(session.startedAt, session.durationSecs) !== null
      ) {
        syncAttemptedRef.current.delete(session.id);
      }
      if (
        session?.endedAt &&
        getPauseDeadlineMs(session.startedAt, session.durationSecs) !== null
      ) {
        processConfirmedReminder(session);
      }
    } catch {
      if (generation === refreshGenerationRef.current) {
        setMonitorError(
          "Status Pause belum dapat diperiksa. Pengingat menunggu konfirmasi server."
        );
      }
    }
  }, [processConfirmedReminder, setSession]);

  const syncExpiredSession = useCallback(
    async (session: PauseSessionData) => {
      const deadline = getPauseDeadlineMs(
        session.startedAt,
        session.durationSecs
      );
      if (
        deadline === null ||
        !shouldSyncPauseDeadline(session, trackedSessionRef.current) ||
        syncAttemptedRef.current.has(session.id)
      ) {
        return;
      }

      syncAttemptedRef.current.add(session.id);
      try {
        const result = await endPauseEarly({ sessionId: session.id });
        if (!result.success) {
          setMonitorError(result.error);
          return;
        }
        if (!result.data.session.endedAt) {
          setMonitorError("Sesi Pause belum dikonfirmasi selesai oleh server.");
          return;
        }
        setMonitorError("");
        setSession(result.data.session);
        processConfirmedReminder(result.data.session);
      } catch {
        setMonitorError(
          "Status Pause belum dapat disinkronkan. Coba kembali ke halaman Pause."
        );
      }
    },
    [processConfirmedReminder, setSession]
  );

  const checkDeadline = useCallback(() => {
    const session = trackedSessionRef.current;
    if (!session) return;

    if (session.endedAt) {
      processConfirmedReminder(session);
      return;
    }

    const deadline = getPauseDeadlineMs(
      session.startedAt,
      session.durationSecs
    );
    if (deadline !== null && Date.now() >= deadline) {
      void syncExpiredSession(session);
    }
  }, [processConfirmedReminder, syncExpiredSession]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const stored = readPauseReminderPreferences();
      setPreferences(stored.preferences);
      setStorageAvailable(stored.storageAvailable);
      setPreferencesReady(true);

      refreshNotificationPermission();
    });
    return () => {
      active = false;
    };
  }, [refreshNotificationPermission]);

  useEffect(() => {
    const refreshWhenActive = () => {
      if (document.visibilityState === "visible") {
        refreshNotificationPermission();
      }
    };

    document.addEventListener("visibilitychange", refreshWhenActive);
    window.addEventListener("pageshow", refreshWhenActive);
    window.addEventListener("focus", refreshWhenActive);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenActive);
      window.removeEventListener("pageshow", refreshWhenActive);
      window.removeEventListener("focus", refreshWhenActive);
    };
  }, [refreshNotificationPermission]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      syncAttemptedRef.current.clear();
      void refreshSession();
      checkDeadline();
    };
    const interval = window.setInterval(checkDeadline, 1000);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pageshow", handleVisibility);
    checkDeadline();

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pageshow", handleVisibility);
    };
  }, [checkDeadline, refreshSession]);

  useEffect(() => {
    if (isAuthPath(pathname)) {
      refreshGenerationRef.current += 1;
      setSession(null);
      stopAudioForDisable();
      return;
    }
    const refreshTimeout = window.setTimeout(() => {
      void refreshSession();
    }, 0);
    return () => window.clearTimeout(refreshTimeout);
  }, [pathname, refreshSession, setSession, stopAudioForDisable]);

  useEffect(
    () => () => {
      refreshGenerationRef.current += 1;
      const audio = audioRef.current;
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
        audioRef.current = null;
      }
    },
    []
  );

  const playManualAudio = useCallback(() => {
    if (preferences.audioEnabled) void playAudio(preferences.selectedAudio);
  }, [playAudio, preferences]);

  const value = useMemo<PauseReminderContextValue>(
    () => ({
      preferences,
      preferencesReady,
      storageAvailable,
      notificationPermission,
      audioStatus,
      notificationStatus,
      monitorError,
      reminderSessionId,
      setSession,
      savePreferences,
      requestNotificationPermission,
      stopAudio,
      playManualAudio,
    }),
    [
      audioStatus,
      notificationPermission,
      notificationStatus,
      monitorError,
      playManualAudio,
      preferences,
      preferencesReady,
      reminderSessionId,
      requestNotificationPermission,
      savePreferences,
      setSession,
      storageAvailable,
      stopAudio,
    ]
  );

  return (
    <PauseReminderContext.Provider value={value}>
      {children}
      {audioStatus === "playing" && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-lg">
          <span role="status" className="text-sm text-neutral-700">
            Audio pengingat sedang diputar.
          </span>
          <button
            type="button"
            onClick={stopAudio}
            className="min-h-11 rounded-lg border border-rose-300 px-4 font-semibold text-rose-900 hover:bg-rose-50"
          >
            Matikan Suara
          </button>
        </div>
      )}
    </PauseReminderContext.Provider>
  );
}

export function usePauseReminder(): PauseReminderContextValue {
  const context = useContext(PauseReminderContext);
  if (!context) {
    throw new Error(
      "usePauseReminder must be used within PauseReminderProvider."
    );
  }
  return context;
}
