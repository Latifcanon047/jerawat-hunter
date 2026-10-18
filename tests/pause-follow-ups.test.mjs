import assert from "node:assert/strict";
import test from "node:test";
import {
  isPickingDetailsPending,
  selectPendingPickingFollowUps,
} from "../src/lib/pause-follow-ups.ts";

const session = (id, overrides = {}) => ({
  id,
  userId: "user-a",
  outcome: "PICKED",
  pickingFollowUpCompleted: false,
  ...overrides,
});

test("includes a PICKED session whose follow-up is not completed", () => {
  const picked = session("pause-1");

  assert.deepEqual(selectPendingPickingFollowUps("user-a", [picked]), [picked]);
});

test("excludes a completed PICKED follow-up even when its picking record is absent", () => {
  assert.deepEqual(
    selectPendingPickingFollowUps("user-a", [
      session("pause-1", { pickingFollowUpCompleted: true }),
    ]),
    []
  );
});

test("excludes sessions whose outcome is not PICKED", () => {
  assert.deepEqual(
    selectPendingPickingFollowUps("user-a", [
      session("pause-1", { outcome: "SUCCEEDED" }),
      session("pause-2", { outcome: "STILL_RESISTING" }),
      session("pause-3", { outcome: null }),
    ]),
    []
  );
});

test("does not expose another user's follow-up", () => {
  assert.deepEqual(
    selectPendingPickingFollowUps("user-a", [
      session("pause-foreign", { userId: "user-b" }),
    ]),
    []
  );
});

test("returns only unrecorded sessions when another session is complete", () => {
  const pending = session("pause-pending");
  const completed = session("pause-complete", {
    pickingFollowUpCompleted: true,
  });

  assert.deepEqual(
    selectPendingPickingFollowUps("user-a", [completed, pending]),
    [pending]
  );
});

test("restored PICKED sessions request details only when follow-up is incomplete", () => {
  const completedSession = session("pause-complete", {
    pickingFollowUpCompleted: true,
  });
  const pendingSession = session("pause-pending", {
    pickingFollowUpCompleted: false,
  });

  assert.equal(
    isPickingDetailsPending(
      completedSession.outcome,
      completedSession.pickingFollowUpCompleted
    ),
    false
  );
  assert.equal(
    isPickingDetailsPending(
      pendingSession.outcome,
      pendingSession.pickingFollowUpCompleted
    ),
    true
  );
  assert.equal(isPickingDetailsPending("SUCCEEDED", false), false);
  assert.equal(isPickingDetailsPending(null, false), false);
});
