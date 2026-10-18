import assert from "node:assert/strict";
import test from "node:test";
import { createLatestRequestGuard } from "../src/lib/latest-request.ts";
import {
  getVisibleCompletedPauseResult,
  shouldClearCompletedPauseResultOnEntry,
  shouldClearCompletedPickingResult,
} from "../src/lib/pause-ui-state.ts";
import { createPauseStartRequest } from "../src/lib/pause-start-request.ts";

test("ignores an older refresh response that resolves after the newest one", async () => {
  const guard = createLatestRequestGuard();
  let state = "initial";
  let resolveOlder;
  let resolveNewer;

  const olderRequest = new Promise((resolve) => {
    resolveOlder = resolve;
  });
  const newerRequest = new Promise((resolve) => {
    resolveNewer = resolve;
  });
  const olderId = guard.begin();
  const olderApply = olderRequest.then((value) => {
    if (guard.isCurrent(olderId)) state = value;
  });
  const newerId = guard.begin();
  const newerApply = newerRequest.then((value) => {
    if (guard.isCurrent(newerId)) state = value;
  });

  resolveNewer("latest server state");
  await newerApply;
  resolveOlder("stale server state");
  await olderApply;

  assert.equal(state, "latest server state");
});

test("invalidating refresh requests prevents updates from a hidden or unmounted page", async () => {
  const guard = createLatestRequestGuard();
  let state = "initial";
  const requestId = guard.begin();
  const response = Promise.resolve("response after deactivation").then(
    (value) => {
      if (guard.isCurrent(requestId)) state = value;
    }
  );

  guard.invalidate();
  await response;

  assert.equal(state, "initial");
});

test("clears a stale PICKED result after server confirms its picking follow-up is complete", () => {
  const completed = {
    session: { id: "pause-1" },
    outcome: "PICKED",
    needsPickingDetails: true,
  };

  assert.equal(
    shouldClearCompletedPickingResult(completed, {
      session: null,
      pickingFollowUps: [],
    }),
    true
  );
});

test("keeps the PICKED result while its follow-up is still pending", () => {
  const completed = {
    session: { id: "pause-1" },
    outcome: "PICKED",
    needsPickingDetails: true,
  };

  assert.equal(
    shouldClearCompletedPickingResult(completed, {
      session: null,
      pickingFollowUps: [{ id: "pause-1" }],
    }),
    false
  );
});

test("an explicit retry reuses the uncertain request ID", () => {
  const pending = { durationSecs: 60, requestId: "original-request" };
  let generated = 0;

  const retry = createPauseStartRequest(60, true, pending, () => {
    generated += 1;
    return "new-request";
  });

  assert.equal(retry, pending);
  assert.equal(generated, 0);
});

test("a new Pause intent always gets a fresh request ID", () => {
  const pending = { durationSecs: 60, requestId: "old-request" };

  const request = createPauseStartRequest(60, false, pending, () => "new-request");

  assert.deepEqual(request, {
    durationSecs: 60,
    requestId: "new-request",
  });
});

test("completed result remains visible after normal refresh but not over an active session", () => {
  const completed = {
    session: { id: "pause-old" },
    outcome: "SUCCEEDED",
    needsPickingDetails: false,
  };

  assert.equal(getVisibleCompletedPauseResult(true, null, completed), completed);
  assert.equal(
    getVisibleCompletedPauseResult(true, { id: "pause-new" }, completed),
    null
  );
  assert.equal(getVisibleCompletedPauseResult(false, null, completed), null);
});

test("clears an old success result on Pause entry when no unresolved session exists", () => {
  const completed = {
    session: { id: "pause-old" },
    outcome: "SUCCEEDED",
  };
  const serverState = { session: null, pickingFollowUps: [] };

  assert.equal(
    shouldClearCompletedPauseResultOnEntry(completed, serverState),
    true
  );
  assert.equal(shouldClearCompletedPauseResultOnEntry(null, serverState), false);
});

test("Pause entry keeps unresolved server session authoritative over stale result", () => {
  const completed = {
    session: { id: "pause-old" },
    outcome: "SUCCEEDED",
  };
  const serverState = {
    session: { id: "pause-unresolved" },
    pickingFollowUps: [],
  };

  assert.equal(
    shouldClearCompletedPauseResultOnEntry(completed, serverState),
    true
  );
  assert.equal(
    getVisibleCompletedPauseResult(true, serverState.session, completed),
    null
  );
});

test("normal refresh does not clear a newly completed success result", () => {
  const completed = {
    session: { id: "pause-new" },
    outcome: "SUCCEEDED",
  };
  const serverState = { session: null, pickingFollowUps: [] };

  assert.equal(
    shouldClearCompletedPauseResultOnEntry(null, serverState),
    false
  );
  assert.equal(getVisibleCompletedPauseResult(true, null, completed), completed);
});

test("Pause entry keeps a PICKED result while its follow-up remains pending", () => {
  const completed = {
    session: { id: "pause-picked" },
    outcome: "PICKED",
  };
  const serverState = {
    session: null,
    pickingFollowUps: [{ id: "pause-picked" }],
  };

  assert.equal(
    shouldClearCompletedPauseResultOnEntry(completed, serverState),
    false
  );
});
