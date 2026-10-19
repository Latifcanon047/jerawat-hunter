"use strict";

async function openPauseWindow(targetUrl) {
  try {
    await self.clients.openWindow(targetUrl);
  } catch {
    // Browsers may block opening a window from a notification click.
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const targetUrl = new URL("/pause", self.location.origin).href;
      let windowClients = [];

      try {
        windowClients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
      } catch {
        await openPauseWindow(targetUrl);
        return;
      }

      const matchingClients = windowClients
        .filter((client) => {
          try {
            return new URL(client.url).origin === self.location.origin;
          } catch {
            return false;
          }
        })
        .sort((a, b) => {
          if (a.focused !== b.focused) return a.focused ? -1 : 1;
          const aVisible = a.visibilityState === "visible";
          const bVisible = b.visibilityState === "visible";
          if (aVisible !== bVisible) return aVisible ? -1 : 1;
          if (a.url !== b.url) return a.url < b.url ? -1 : 1;
          return (a.id || "") < (b.id || "")
            ? -1
            : (a.id || "") > (b.id || "")
              ? 1
              : 0;
        });
      const sourceClientId = event.notification.data?.sourceClientId;
      const sourceClient = matchingClients.find(
        (client) =>
          typeof sourceClientId === "string" && client.id === sourceClientId
      );
      const candidates = sourceClient
        ? [
            sourceClient,
            ...matchingClients.filter((client) => client.id !== sourceClient.id),
          ]
        : matchingClients;

      for (const client of candidates) {
        try {
          if (typeof client.navigate !== "function") continue;
          const navigatedClient = await client.navigate(targetUrl);
          if (!navigatedClient || typeof navigatedClient.focus !== "function") {
            continue;
          }
          await navigatedClient.focus();
          return;
        } catch {
          // Try another matching client before opening a new window.
        }
      }

      await openPauseWindow(targetUrl);
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "GET_NOTIFICATION_CLIENT_ID") return;
  const replyPort = event.ports?.[0];
  const sourceClientId = event.source?.id;
  if (!replyPort || typeof sourceClientId !== "string") return;

  replyPort.postMessage({ clientId: sourceClientId });
});
