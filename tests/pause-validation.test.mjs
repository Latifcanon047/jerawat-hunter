import assert from "node:assert/strict";
import test from "node:test";
import {
  finishPauseSchema,
  pauseDurationSchema,
  startPauseSchema,
} from "../src/lib/validations/pause.ts";
import {
  getPauseDeadlineMs,
  getPauseRemainingSeconds,
  shouldSyncPauseDeadline,
} from "../src/lib/pause-clock.ts";

test("accepts preset and custom durations within 30 to 600 seconds", () => {
  for (const durationSecs of [30, 60, 180, 300, 31, 600]) {
    assert.equal(pauseDurationSchema.safeParse(durationSecs).success, true);
  }
});

test("rejects durations outside the configured range or not in whole seconds", () => {
  for (const durationSecs of [0, 29, 601, 30.5, NaN]) {
    assert.equal(pauseDurationSchema.safeParse(durationSecs).success, false);
  }
});

test("requires a UUID request ID and a valid duration to start a session", () => {
  assert.equal(
    startPauseSchema.safeParse({
      durationSecs: 60,
      requestId: "8b248456-f360-46e0-9478-b69d817067cb",
    }).success,
    true
  );
  assert.equal(
    startPauseSchema.safeParse({ durationSecs: 60, requestId: "not-a-uuid" })
      .success,
    false
  );
});

test("accepts only the three persisted Pause outcomes", () => {
  for (const outcome of ["SUCCEEDED", "STILL_RESISTING", "PICKED"]) {
    assert.equal(
      finishPauseSchema.safeParse({
        sessionId: "session-id",
        outcome,
      }).success,
      true
    );
  }
  assert.equal(
    finishPauseSchema.safeParse({
      sessionId: "session-id",
      outcome: "CANCELLED",
    }).success,
    false
  );
});

test("calculates remaining time from the stored start timestamp", () => {
  const startedAt = "2026-10-14T08:00:00.000Z";
  const startMs = Date.parse(startedAt);

  assert.equal(getPauseRemainingSeconds(startedAt, 60, startMs), 60);
  assert.equal(getPauseRemainingSeconds(startedAt, 60, startMs + 1_001), 59);
  assert.equal(getPauseRemainingSeconds(startedAt, 60, startMs + 60_000), 0);
  assert.equal(getPauseRemainingSeconds(startedAt, 60, startMs + 90_000), 0);
});

test("calculates the 30-second deadline and remaining time from the session timestamp", () => {
  const startedAt = "2026-10-14T08:00:00.000Z";
  const startMs = Date.parse(startedAt);
  const session = { id: "session-1", startedAt, durationSecs: 30 };

  assert.equal(getPauseDeadlineMs(startedAt, 30), startMs + 30_000);
  assert.equal(getPauseRemainingSeconds(startedAt, 30, startMs), 30);
  assert.equal(getPauseRemainingSeconds(startedAt, 30, startMs + 29_001), 1);
  assert.equal(getPauseRemainingSeconds(startedAt, 30, startMs + 30_000), 0);
  assert.equal(
    shouldSyncPauseDeadline(session, session, startMs + 29_999),
    false
  );
  assert.equal(
    shouldSyncPauseDeadline(session, session, startMs + 30_000),
    true
  );
});

test("does not authorize deadline sync for invalid time or a different active session", () => {
  const session = {
    id: "session-1",
    startedAt: "2026-10-14T08:00:00.000Z",
    durationSecs: 30,
  };
  const deadlineMs = Date.parse(session.startedAt) + 30_000;

  assert.equal(getPauseDeadlineMs("not-a-date", 30), null);
  assert.equal(getPauseDeadlineMs(session.startedAt, Number.NaN), null);
  assert.equal(getPauseRemainingSeconds("not-a-date", 30, deadlineMs), null);
  assert.equal(
    shouldSyncPauseDeadline(
      session,
      { ...session, id: "session-2" },
      deadlineMs
    ),
    false
  );
  assert.equal(
    shouldSyncPauseDeadline(
      session,
      { ...session, durationSecs: 60 },
      deadlineMs
    ),
    false
  );
  assert.equal(
    shouldSyncPauseDeadline(session, session, Number.NaN),
    false
  );
});
