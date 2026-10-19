import assert from "node:assert/strict";
import test from "node:test";
import {
  detectPauseNotificationPlatform,
  getPauseNotificationSettingsGuide,
  normalizePauseNotificationPermission,
  requestPauseNotificationPermission,
  resolvePauseNotificationPermissionState,
} from "../src/lib/pause-notification-permission.ts";

const supportedDesktop = {
  notificationApiAvailable: true,
  serviceWorkerApiAvailable: true,
  isIos: false,
};

test("preserves default, denied, and granted permission states", () => {
  for (const permission of ["default", "denied", "granted"]) {
    assert.equal(normalizePauseNotificationPermission(permission), permission);
    assert.equal(
      resolvePauseNotificationPermissionState(
        supportedDesktop,
        permission
      ),
      permission
    );
  }
});

test("distinguishes unavailable Notification and Service Worker APIs", () => {
  assert.equal(
    resolvePauseNotificationPermissionState(
      {
        notificationApiAvailable: false,
        serviceWorkerApiAvailable: true,
        isIos: false,
      },
      "default"
    ),
    "notification-unsupported"
  );
  assert.equal(
    resolvePauseNotificationPermissionState(
      {
        notificationApiAvailable: true,
        serviceWorkerApiAvailable: false,
        isIos: false,
      },
      "default"
    ),
    "service-worker-unsupported"
  );
});

test("reports current iOS notification limitation separately from permission", () => {
  assert.equal(
    resolvePauseNotificationPermissionState(
      {
        notificationApiAvailable: true,
        serviceWorkerApiAvailable: true,
        isIos: true,
      },
      "default"
    ),
    "ios-unsupported"
  );
});

test("normalizes unknown permission results as errors", () => {
  assert.equal(normalizePauseNotificationPermission("prompt"), "error");
  assert.equal(normalizePauseNotificationPermission(null), "error");
});

test("requests permission only when the current state is default", async () => {
  let requestCount = 0;
  const requestPermission = async () => {
    requestCount += 1;
    return "granted";
  };

  assert.equal(
    await requestPauseNotificationPermission("default", requestPermission),
    "granted"
  );
  assert.equal(
    await requestPauseNotificationPermission("denied", requestPermission),
    "denied"
  );
  assert.equal(
    await requestPauseNotificationPermission("granted", requestPermission),
    "granted"
  );
  assert.equal(requestCount, 1);
});

test("a dismissed prompt that leaves permission default can be retried", async () => {
  let requestCount = 0;
  const requestPermission = async () => {
    requestCount += 1;
    return "default";
  };

  assert.equal(
    await requestPauseNotificationPermission("default", requestPermission),
    "default"
  );
  assert.equal(
    await requestPauseNotificationPermission("default", requestPermission),
    "default"
  );
  assert.equal(requestCount, 2);
});

test("recognizes Android Chrome, iPhone Safari, iOS other browsers, and iPadOS desktop mode", () => {
  assert.equal(
    detectPauseNotificationPlatform(
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36"
    ),
    "android-chrome"
  );
  assert.equal(
    detectPauseNotificationPlatform(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
    ),
    "ios-safari"
  );
  assert.equal(
    detectPauseNotificationPlatform(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1"
    ),
    "ios-other"
  );
  assert.equal(
    detectPauseNotificationPlatform("Mozilla/5.0 (Macintosh)", "MacIntel", 5),
    "ios-other"
  );
});

test("a permission recheck reflects changes without requesting a new permission", () => {
  assert.equal(
    resolvePauseNotificationPermissionState(supportedDesktop, "denied"),
    "denied"
  );
  assert.equal(
    resolvePauseNotificationPermissionState(supportedDesktop, "granted"),
    "granted"
  );
});

test("uses a short generic guide with automatic permission refresh", () => {
  const guide = getPauseNotificationSettingsGuide("other");
  assert.ok(guide.length > 0);
  assert.ok(guide.some((step) => step.includes("pengaturan browser")));
  assert.ok(guide.some((step) => step.includes("diperiksa kembali otomatis")));
  assert.ok(guide.every((step) => !step.includes("Periksa izin lagi")));
});

test("provides Android Chrome and iPhone guidance without unsupported settings links", () => {
  const androidGuide = getPauseNotificationSettingsGuide("android-chrome");
  assert.ok(androidGuide.some((step) => step.includes("Setelan situs")));
  assert.ok(androidGuide.some((step) => step.includes("Izinkan")));
  assert.ok(androidGuide.every((step) => !step.includes("Periksa izin lagi")));

  const iosGuide = getPauseNotificationSettingsGuide("ios-safari");
  assert.ok(iosGuide.some((step) => step.includes("Home Screen")));
  assert.ok(iosGuide.some((step) => step.includes("belum memiliki konfigurasi")));
  assert.ok(iosGuide.every((step) => !/https?:|chrome:\/\/|safari:\/\/|settings:\/\//i.test(step)));
});
