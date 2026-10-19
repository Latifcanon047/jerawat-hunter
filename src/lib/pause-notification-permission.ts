export type PauseNotificationPermissionState =
  | NotificationPermission
  | "checking"
  | "notification-unsupported"
  | "service-worker-unsupported"
  | "ios-unsupported"
  | "error";

export type PauseNotificationPlatform =
  | "android-chrome"
  | "android-other"
  | "ios-safari"
  | "ios-other"
  | "other";

export interface PauseNotificationCapabilities {
  notificationApiAvailable: boolean;
  serviceWorkerApiAvailable: boolean;
  isIos: boolean;
}

export function resolvePauseNotificationPermissionState(
  capabilities: PauseNotificationCapabilities,
  permission?: unknown
): PauseNotificationPermissionState {
  if (!capabilities.notificationApiAvailable) {
    return "notification-unsupported";
  }
  if (!capabilities.serviceWorkerApiAvailable) {
    return "service-worker-unsupported";
  }
  if (capabilities.isIos) return "ios-unsupported";
  return normalizePauseNotificationPermission(permission);
}

export function normalizePauseNotificationPermission(
  permission: unknown
): PauseNotificationPermissionState {
  if (
    permission === "default" ||
    permission === "granted" ||
    permission === "denied"
  ) {
    return permission;
  }
  return "error";
}

export async function requestPauseNotificationPermission(
  currentPermission: PauseNotificationPermissionState,
  requestPermission: () => Promise<unknown>
): Promise<PauseNotificationPermissionState> {
  if (currentPermission !== "default") return currentPermission;
  return normalizePauseNotificationPermission(await requestPermission());
}

export function detectPauseNotificationPlatform(
  userAgent: string,
  platform = "",
  maxTouchPoints = 0
): PauseNotificationPlatform {
  const isIos =
    /iPhone|iPad|iPod/i.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1);
  if (isIos) {
    return /Safari/i.test(userAgent) && !/(CriOS|FxiOS|EdgiOS|OPiOS)/i.test(userAgent)
      ? "ios-safari"
      : "ios-other";
  }

  if (/Android/i.test(userAgent)) {
    return /Chrome\//i.test(userAgent) &&
      !/(EdgA|OPR|SamsungBrowser|YaBrowser)\//i.test(userAgent)
      ? "android-chrome"
      : "android-other";
  }

  return "other";
}

export function getPauseNotificationSettingsGuide(
  platform: PauseNotificationPlatform
): string[] {
  switch (platform) {
    case "android-chrome":
      return [
        "Di Chrome, ketuk menu ⋮ lalu Setelan.",
        "Buka Setelan situs > Notifikasi.",
        "Pilih situs Jerawat Hunter, lalu ubah izinnya menjadi Izinkan.",
        "Kembali ke halaman ini; status izin akan diperiksa kembali otomatis.",
      ];
    case "android-other":
      return [
        "Buka pengaturan browser yang sedang digunakan.",
        "Cari Izin situs atau Notifikasi, lalu pilih situs Jerawat Hunter dan izinkan notifikasi.",
        "Nama menu berbeda antar-browser. Jika tidak menemukannya, coba buka situs ini di Chrome.",
        "Kembali ke halaman ini; status izin akan diperiksa kembali otomatis.",
      ];
    case "ios-safari":
    case "ios-other":
      return [
        "Web Push di iPhone/iPad memerlukan web app yang ditambahkan ke Home Screen dan dukungan web app yang sesuai.",
        "Jerawat Hunter saat ini belum memiliki konfigurasi web app/manifest untuk dukungan tersebut, jadi notifikasi Pause belum tersedia di iPhone/iPad.",
        "Pengaturan notifikasi web app yang didukung dapat dikelola di Pengaturan iOS/iPadOS > Notifikasi setelah web app yang memenuhi syarat dipasang.",
      ];
    default:
      return [
        "Buka pengaturan browser, cari Izin situs atau Notifikasi, lalu pilih situs Jerawat Hunter dan izinkan notifikasi.",
        "Nama dan lokasi menu bergantung pada browser. Status izin akan diperiksa kembali otomatis saat kembali ke halaman ini.",
      ];
  }
}
