import assert from "node:assert/strict";
import test from "node:test";
import {
  canResumePauseStartRequest,
  selectPauseSessionToResume,
} from "../src/lib/pause-recovery.ts";

function session(id, {
  startedAt,
  endedAt = null,
  outcome = null,
} = {}) {
  return {
    id,
    startedAt: new Date(startedAt),
    endedAt: endedAt ? new Date(endedAt) : null,
    outcome,
  };
}

test("selects an ended unresolved session for outcome selection", () => {
  const ended = session("ended", {
    startedAt: "2026-10-16T10:00:00.000Z",
    endedAt: "2026-10-16T10:01:00.000Z",
  });

  assert.equal(selectPauseSessionToResume([ended]), ended);
});

test("prioritizes a running session over an ended session awaiting outcome", () => {
  const ended = session("ended", {
    startedAt: "2026-10-16T09:00:00.000Z",
    endedAt: "2026-10-16T09:01:00.000Z",
  });
  const running = session("running", {
    startedAt: "2026-10-16T10:00:00.000Z",
  });

  assert.equal(selectPauseSessionToResume([ended, running]), running);
  assert.equal(
    selectPauseSessionToResume([
      { ...ended, outcome: "STILL_RESISTING" },
      running,
    ]),
    running
  );
});

test("processes multiple ended unresolved sessions oldest first, one at a time", () => {
  const newest = session("newest", {
    startedAt: "2026-10-16T12:00:00.000Z",
    endedAt: "2026-10-16T12:01:00.000Z",
  });
  const oldest = session("oldest", {
    startedAt: "2026-10-16T08:00:00.000Z",
    endedAt: "2026-10-16T08:01:00.000Z",
  });
  const middle = session("middle", {
    startedAt: "2026-10-16T10:00:00.000Z",
    endedAt: "2026-10-16T10:01:00.000Z",
  });

  assert.equal(
    selectPauseSessionToResume([newest, middle, oldest]),
    oldest
  );
  assert.equal(
    selectPauseSessionToResume([newest, middle]),
    middle
  );
  assert.equal(selectPauseSessionToResume([newest]), newest);
});

test("breaks identical start times deterministically and ignores completed sessions", () => {
  const laterId = session("pause-b", {
    startedAt: "2026-10-16T10:00:00.000Z",
  });
  const earlierId = session("pause-a", {
    startedAt: "2026-10-16T10:00:00.000Z",
  });
  const completed = session("completed", {
    startedAt: "2026-10-16T08:00:00.000Z",
    endedAt: "2026-10-16T08:01:00.000Z",
    outcome: "SUCCEEDED",
  });
  const pickedFollowUp = session("picked", {
    startedAt: "2026-10-16T07:00:00.000Z",
    endedAt: "2026-10-16T07:01:00.000Z",
    outcome: "PICKED",
  });

  assert.equal(
    selectPauseSessionToResume([laterId, completed, pickedFollowUp, earlierId]),
    earlierId
  );
  assert.equal(selectPauseSessionToResume([completed, pickedFollowUp]), null);
});

test("a deleted success remains completed and is not selected for recovery", () => {
  const deletedSuccess = session("deleted-success", {
    startedAt: "2026-10-16T08:00:00.000Z",
    endedAt: "2026-10-16T08:01:00.000Z",
    outcome: "SUCCEEDED",
  });
  const unresolved = session("unresolved", {
    startedAt: "2026-10-16T09:00:00.000Z",
  });

  assert.equal(selectPauseSessionToResume([deletedSuccess]), null);
  assert.equal(
    selectPauseSessionToResume([deletedSuccess, unresolved]),
    unresolved
  );
});

test("start request retries only resume sessions that have no outcome", () => {
  assert.equal(canResumePauseStartRequest({ outcome: null }), true);
  for (const outcome of ["SUCCEEDED", "STILL_RESISTING", "PICKED"]) {
    assert.equal(canResumePauseStartRequest({ outcome }), false);
  }
});
