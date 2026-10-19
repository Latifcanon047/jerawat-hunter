import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const workerSource = await readFile(
  new URL("../public/pause-reminder-sw.js", import.meta.url),
  "utf8"
);
const origin = "https://jerawat-hunter.example";
const pauseUrl = `${origin}/pause`;

function createWorker(windowClients, { matchAllError = false } = {}) {
  let notificationClickHandler;
  let messageHandler;
  const openedUrls = [];
  let notificationClosed = false;
  const self = {
    location: { origin },
    clients: {
      async matchAll() {
        if (matchAllError) throw new Error("matchAll failed");
        return windowClients;
      },
      async openWindow(url) {
        openedUrls.push(url);
        return {};
      },
    },
    addEventListener(type, handler) {
      if (type === "notificationclick") notificationClickHandler = handler;
      if (type === "message") messageHandler = handler;
    },
  };
  vm.runInNewContext(workerSource, { self, URL });

  return {
    openedUrls,
    requestClientId(source) {
      assert.equal(typeof messageHandler, "function");
      let response;
      messageHandler({
        data: { type: "GET_NOTIFICATION_CLIENT_ID" },
        source,
        ports: [
          {
            postMessage(message) {
              response = message;
            },
          },
        ],
      });
      return response?.clientId ?? null;
    },
    async click(sourceClientId = null) {
      assert.equal(typeof notificationClickHandler, "function");
      let pending;
      notificationClickHandler({
        notification: {
          data: { sourceClientId },
          close() {
            notificationClosed = true;
          },
        },
        waitUntil(promise) {
          pending = promise;
        },
      });
      await pending;
      assert.equal(notificationClosed, true);
    },
  };
}

test("returns the requesting page client ID through the message port", () => {
  const sourceClient = createClient({
    url: `${origin}/dashboard`,
    id: "trigger",
  });
  const worker = createWorker([sourceClient]);

  assert.equal(worker.requestClientId(sourceClient), "trigger");
});

function createClient({
  url,
  id,
  focused = false,
  visibilityState = "hidden",
  navigate = async function (target) {
    this.navigatedTo = target;
    return this;
  },
  focus = async function () {
    this.focusedByClick = true;
  },
} = {}) {
  return {
    url,
    id,
    focused,
    visibilityState,
    navigatedTo: null,
    focusedByClick: false,
    navigate,
    focus,
  };
}

test("focuses and navigates the focused same-origin app tab without opening another", async () => {
  const focusedClient = createClient({
    url: `${origin}/dashboard`,
    id: "focused",
    focused: true,
    visibilityState: "visible",
  });
  const otherClient = createClient({
    url: `${origin}/settings`,
    id: "other",
    visibilityState: "visible",
  });
  const foreignClient = createClient({
    url: "https://other.example/",
    id: "foreign",
  });
  const worker = createWorker([otherClient, foreignClient, focusedClient]);

  await worker.click();

  assert.equal(focusedClient.navigatedTo, pauseUrl);
  assert.equal(focusedClient.focusedByClick, true);
  assert.equal(otherClient.navigatedTo, null);
  assert.deepEqual(worker.openedUrls, []);
});

test("prioritizes the client that triggered the notification", async () => {
  const triggeringClient = createClient({
    url: `${origin}/dashboard`,
    id: "triggering",
  });
  const focusedOtherClient = createClient({
    url: `${origin}/settings`,
    id: "focused-other",
    focused: true,
    visibilityState: "visible",
  });
  const worker = createWorker([focusedOtherClient, triggeringClient]);
  const sourceClientId = worker.requestClientId(triggeringClient);

  await worker.click(sourceClientId);

  assert.equal(triggeringClient.navigatedTo, pauseUrl);
  assert.equal(triggeringClient.focusedByClick, true);
  assert.equal(focusedOtherClient.navigatedTo, null);
  assert.deepEqual(worker.openedUrls, []);
});

test("falls back to another app client when the triggering client is gone", async () => {
  const remainingClient = createClient({
    url: `${origin}/dashboard`,
    id: "remaining",
    visibilityState: "visible",
  });
  const worker = createWorker([remainingClient]);

  await worker.click("closed-trigger");

  assert.equal(remainingClient.navigatedTo, pauseUrl);
  assert.equal(remainingClient.focusedByClick, true);
  assert.deepEqual(worker.openedUrls, []);
});

test("tries another app client when the triggering client cannot be used", async () => {
  const unusableTrigger = createClient({
    url: `${origin}/dashboard`,
    id: "trigger",
    navigate: async () => {
      throw new Error("navigation failed");
    },
  });
  const fallbackClient = createClient({
    url: `${origin}/settings`,
    id: "fallback",
    visibilityState: "visible",
  });
  const worker = createWorker([fallbackClient, unusableTrigger]);

  await worker.click(unusableTrigger.id);

  assert.equal(unusableTrigger.navigatedTo, null);
  assert.equal(fallbackClient.navigatedTo, pauseUrl);
  assert.equal(fallbackClient.focusedByClick, true);
  assert.deepEqual(worker.openedUrls, []);
});

test("uses visibility and URL ordering to choose a client deterministically", async () => {
  const hiddenClient = createClient({
    url: `${origin}/a`,
    id: "hidden",
  });
  const laterUrlClient = createClient({
    url: `${origin}/z`,
    id: "later",
    visibilityState: "visible",
  });
  const selectedClient = createClient({
    url: `${origin}/a`,
    id: "selected",
    visibilityState: "visible",
  });
  const worker = createWorker([
    laterUrlClient,
    hiddenClient,
    selectedClient,
  ]);

  await worker.click();

  assert.equal(selectedClient.navigatedTo, pauseUrl);
  assert.equal(selectedClient.focusedByClick, true);
  assert.equal(laterUrlClient.navigatedTo, null);
  assert.equal(hiddenClient.navigatedTo, null);
  assert.deepEqual(worker.openedUrls, []);
});

test("opens the Pause route when there is no usable matching client", async () => {
  const worker = createWorker([
    createClient({
      url: "https://other.example/",
      id: "foreign",
    }),
    createClient({
      url: `${origin}/dashboard`,
      id: "cannot-navigate",
      navigate: null,
    }),
  ]);

  await worker.click();

  assert.deepEqual(worker.openedUrls, [pauseUrl]);
});

test("falls back to opening Pause when a client cannot be focused", async () => {
  const client = createClient({
    url: `${origin}/dashboard`,
    id: "unfocusable",
    focus: async () => {
      throw new Error("focus failed");
    },
  });
  const worker = createWorker([client]);

  await worker.click();

  assert.equal(client.navigatedTo, pauseUrl);
  assert.deepEqual(worker.openedUrls, [pauseUrl]);
});

test("falls back to opening Pause when client enumeration fails", async () => {
  const worker = createWorker([], { matchAllError: true });

  await worker.click();

  assert.deepEqual(worker.openedUrls, [pauseUrl]);
});
