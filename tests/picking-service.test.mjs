import assert from "node:assert/strict";
import test from "node:test";
import {
  createPickingFollowUp,
  createStandalonePickingEvent,
  deleteOwnedPickingEvent,
  PickingActionError,
  PickingRecordError,
  pickingHistoryFilter,
  updateOwnedPickingEvent,
} from "../src/lib/picking-service.ts";

function createFakeRepository({ sessionState = "PICKED", existing = null } = {}) {
  const state = {
    sessionState,
    event: existing,
    creates: 0,
    resistanceRecords: 1,
    followUpCompleted: false,
    completionUpdates: 0,
  };

  const repository = {
    async lockOwnedSession() {
      return state.sessionState;
    },
    async findEventForSession() {
      return state.event;
    },
    async createEvent(userId, input) {
      state.creates += 1;
      state.event = {
        id: "event-1",
        userId,
        recordedAt: new Date("2026-10-14T00:00:00.000Z"),
        occurredAt: input.occurredAt,
        createdAt: new Date("2026-10-14T00:00:00.000Z"),
        pickingType: input.pickingType,
        triggers: input.triggers,
        emotions: input.emotions,
        urgeStrength: input.urgeStrength ?? null,
        durationRange: input.durationRange ?? null,
        reasons: input.reasons,
        impacts: input.impacts,
        context: input.context ?? null,
        pauseSessionId: input.pauseSessionId,
      };
      return state.event;
    },
    async markFollowUpCompleted() {
      state.completionUpdates += 1;
      state.followUpCompleted = true;
    },
  };
  return { repository, state };
}

const input = {
  pickingType: "PEEL",
  triggers: [],
  emotions: [],
  reasons: [],
  impacts: [],
  pauseSessionId: "pause-1",
  occurredAt: new Date("2026-10-16T02:30:00.000Z"),
  idempotencyKey: "b2e78b90-6ca7-4a80-bfd6-1a0f67ee5eb8",
};

test("creates standalone picking for the authenticated owner without Pause or Resistance", async () => {
  const occurredAt = new Date("2026-10-16T02:30:00.000Z");
  const state = { event: null, resistanceWrites: 0, pauseWrites: 0 };
  const repository = {
    async createEvent(userId, eventInput) {
      assert.equal(userId, "session-user");
      assert.equal("pauseSessionId" in eventInput, false);
      assert.equal(
        eventInput.idempotencyKey,
        "b2e78b90-6ca7-4a80-bfd6-1a0f67ee5eb8"
      );
      state.event = {
        id: eventInput.idempotencyKey,
        userId,
        recordedAt: new Date("2026-10-16T02:31:00.000Z"),
        occurredAt: eventInput.occurredAt,
        createdAt: new Date("2026-10-16T02:31:00.000Z"),
        pickingType: eventInput.pickingType,
        triggers: eventInput.triggers,
        emotions: eventInput.emotions,
        urgeStrength: eventInput.urgeStrength ?? null,
        durationRange: eventInput.durationRange ?? null,
        reasons: eventInput.reasons,
        impacts: eventInput.impacts,
        context: eventInput.context ?? null,
        pauseSessionId: null,
      };
      return state.event;
    },
    async findOwnedEvent() {
      return state.event;
    },
  };

  const result = await createStandalonePickingEvent(repository, "session-user", {
    ...input,
    occurredAt,
    pauseSessionId: "untrusted-pause-id",
  });

  const event = result.event;
  assert.equal(result.alreadyRecorded, false);
  assert.equal(event.userId, "session-user");
  assert.equal(event.occurredAt, occurredAt);
  assert.notEqual(event.recordedAt, event.occurredAt);
  assert.equal(event.pauseSessionId, null);
  assert.equal(state.resistanceWrites, 0);
  assert.equal(state.pauseWrites, 0);
});

test("rejects standalone picking without an authenticated user", async () => {
  let creates = 0;
  await assert.rejects(
    createStandalonePickingEvent(
      {
        async createEvent() {
          creates += 1;
          throw new Error("should not be called");
        },
        async findOwnedEvent() {
          return null;
        },
      },
      null,
      input
    ),
    (error) =>
      error instanceof PickingActionError && error.code === "UNAUTHENTICATED"
  );
  assert.equal(creates, 0);
});

test("rejects standalone Picking without a valid occurrence time before writing", async () => {
  let creates = 0;
  await assert.rejects(
    createStandalonePickingEvent(
      {
        async createEvent() {
          creates += 1;
          throw new Error("should not be called");
        },
        async findOwnedEvent() {
          return null;
        },
      },
      "session-user",
      { ...input, occurredAt: new Date(Number.NaN) }
    ),
    (error) =>
      error instanceof PickingActionError && error.code === "INVALID_INPUT"
  );
  assert.equal(creates, 0);
});

test("a retry with the same standalone key returns the existing event without creating a duplicate", async () => {
  const existing = {
    id: input.idempotencyKey,
    userId: "session-user",
    recordedAt: new Date("2026-10-16T02:31:00.000Z"),
    occurredAt: input.occurredAt,
    createdAt: new Date("2026-10-16T02:31:00.000Z"),
    pickingType: input.pickingType,
    triggers: input.triggers,
    emotions: input.emotions,
    urgeStrength: null,
    durationRange: null,
    reasons: input.reasons,
    impacts: input.impacts,
    context: null,
    pauseSessionId: null,
  };
  let creates = 0;
  const result = await createStandalonePickingEvent(
    {
      async createEvent() {
        creates += 1;
        throw { code: "P2002" };
      },
      async findOwnedEvent(eventId, userId) {
        assert.equal(eventId, input.idempotencyKey);
        assert.equal(userId, "session-user");
        return existing;
      },
    },
    "session-user",
    input
  );

  assert.equal(result.alreadyRecorded, true);
  assert.equal(result.event.id, existing.id);
  assert.equal(creates, 1);
});

test("deletes only the selected owned PickingEvent and preserves related state", async () => {
  const state = {
    events: [
      { id: "event-1", userId: "user-a" },
      { id: "event-2", userId: "user-a" },
    ],
    pauseSession: {
      id: "pause-1",
      outcome: "PICKED",
      pickingFollowUpCompleted: true,
    },
    resistance: { id: "resistance-1", pauseSessionId: "pause-1" },
  };
  const repository = {
    async deleteOwnedEvent(eventId, userId) {
      const index = state.events.findIndex(
        (event) => event.id === eventId && event.userId === userId
      );
      if (index === -1) return 0;
      state.events.splice(index, 1);
      return 1;
    },
  };

  await deleteOwnedPickingEvent(repository, "user-a", "event-1");

  assert.deepEqual(state.events, [{ id: "event-2", userId: "user-a" }]);
  assert.deepEqual(state.pauseSession, {
    id: "pause-1",
    outcome: "PICKED",
    pickingFollowUpCompleted: true,
  });
  assert.deepEqual(state.resistance, {
    id: "resistance-1",
    pauseSessionId: "pause-1",
  });
});

test("deleting a missing or unowned PickingEvent fails without deleting another record", async () => {
  const repository = {
    async deleteOwnedEvent(eventId, userId) {
      assert.equal(eventId, "event-foreign");
      assert.equal(userId, "user-a");
      return 0;
    },
  };

  await assert.rejects(
    deleteOwnedPickingEvent(repository, "user-a", "event-foreign"),
    (error) =>
      error instanceof PickingRecordError && error.code === "EVENT_NOT_FOUND"
  );
});

test("does not allow a Pause session owned by another user", async () => {
  const { repository, state } = createFakeRepository({
    sessionState: "NOT_FOUND",
  });

  await assert.rejects(
    createPickingFollowUp(repository, "user-a", input),
    (error) => error instanceof PickingRecordError && error.code === "SESSION_NOT_FOUND"
  );
  assert.equal(state.creates, 0);
});

test("does not allow a session whose outcome is not PICKED", async () => {
  const { repository, state } = createFakeRepository({
    sessionState: "NOT_PICKED",
  });

  await assert.rejects(
    createPickingFollowUp(repository, "user-a", input),
    (error) => error instanceof PickingRecordError && error.code === "SESSION_NOT_PICKED"
  );
  assert.equal(state.creates, 0);
});

test("retries for a Pause session return its existing event without creating another", async () => {
  const existing = {
    id: "event-existing",
    userId: "user-a",
    recordedAt: new Date("2026-10-14T00:00:00.000Z"),
    occurredAt: input.occurredAt,
    createdAt: new Date("2026-10-14T00:00:00.000Z"),
    pickingType: "PEEL",
    triggers: [],
    emotions: [],
    urgeStrength: null,
    durationRange: null,
    reasons: [],
    impacts: [],
    context: null,
    pauseSessionId: "pause-1",
  };
  const { repository, state } = createFakeRepository({ existing });

  const result = await createPickingFollowUp(repository, "user-a", input);
  assert.equal(result.alreadyRecorded, true);
  assert.equal(result.event.id, "event-existing");
  assert.equal(state.creates, 0);
  assert.equal(state.followUpCompleted, true);
  assert.equal(state.completionUpdates, 1);
});

test("creating the event marks its follow-up completed without modifying Resistance", async () => {
  const { repository, state } = createFakeRepository();

  const result = await createPickingFollowUp(repository, "user-a", input);
  assert.equal(result.alreadyRecorded, false);
  assert.equal(result.event.pauseSessionId, "pause-1");
  assert.equal(result.event.occurredAt, input.occurredAt);
  assert.equal(state.event.id, "event-1");
  assert.equal(state.creates, 1);
  assert.equal(state.followUpCompleted, true);
  assert.equal(state.completionUpdates, 1);
  assert.equal(state.resistanceRecords, 1);

  const retry = await createPickingFollowUp(repository, "user-a", input);
  assert.equal(retry.alreadyRecorded, true);
  assert.equal(state.creates, 1);
  assert.equal(state.completionUpdates, 2);
  assert.equal(state.resistanceRecords, 1);
});

test("a completion failure rejects the follow-up operation", async () => {
  const persisted = { event: null, followUpCompleted: false };

  await assert.rejects(
    async () => {
      const staged = { ...persisted };
      const repository = {
        async lockOwnedSession() {
          return "PICKED";
        },
        async findEventForSession() {
          return staged.event;
        },
        async createEvent(userId, eventInput) {
          staged.event = {
            id: "event-1",
            userId,
            recordedAt: new Date("2026-10-14T00:00:00.000Z"),
            occurredAt: eventInput.occurredAt,
            createdAt: new Date("2026-10-14T00:00:00.000Z"),
            pickingType: eventInput.pickingType,
            triggers: eventInput.triggers,
            emotions: eventInput.emotions,
            urgeStrength: eventInput.urgeStrength ?? null,
            durationRange: eventInput.durationRange ?? null,
            reasons: eventInput.reasons,
            impacts: eventInput.impacts,
            context: eventInput.context ?? null,
            pauseSessionId: eventInput.pauseSessionId,
          };
          return staged.event;
        },
        async markFollowUpCompleted() {
          throw new Error("completion update failed");
        },
      };

      const result = await createPickingFollowUp(
        repository,
        "user-a",
        input
      );
      Object.assign(persisted, staged);
      return result;
    },
    /completion update failed/
  );
  assert.deepEqual(persisted, { event: null, followUpCompleted: false });
});

test("an existing event owned by another user is not marked completed", async () => {
  const foreignEvent = {
    id: "event-foreign",
    userId: "user-b",
    recordedAt: new Date("2026-10-14T00:00:00.000Z"),
    occurredAt: input.occurredAt,
    createdAt: new Date("2026-10-14T00:00:00.000Z"),
    pickingType: "PEEL",
    triggers: [],
    emotions: [],
    urgeStrength: null,
    durationRange: null,
    reasons: [],
    impacts: [],
    context: null,
    pauseSessionId: "pause-1",
  };
  const { repository, state } = createFakeRepository({ existing: foreignEvent });

  await assert.rejects(
    createPickingFollowUp(repository, "user-a", input),
    (error) =>
      error instanceof PickingRecordError && error.code === "INTEGRITY_ERROR"
  );
  assert.equal(state.followUpCompleted, false);
  assert.equal(state.completionUpdates, 0);
});

test("history query filter is always scoped to the authenticated user ID", () => {
  assert.deepEqual(pickingHistoryFilter("user-a"), { userId: "user-a" });
});

test("editing updates the same owned event and preserves creation time and Pause relation", async () => {
  const original = {
    id: "event-existing",
    userId: "user-a",
    recordedAt: new Date("2026-10-12T10:00:00.000Z"),
    occurredAt: new Date("2026-10-12T09:00:00.000Z"),
    createdAt: new Date("2026-10-12T10:01:00.000Z"),
    pickingType: "PEEL",
    triggers: ["MIRROR"],
    emotions: ["ANXIOUS"],
    urgeStrength: 2,
    durationRange: "UNDER_1_MIN",
    reasons: ["PEEL_DRY_SKIN"],
    impacts: [],
    context: "IN_FRONT_OF_MIRROR",
    pauseSessionId: "pause-1",
  };
  const state = { event: original, updates: 0, creates: 0 };
  const repository = {
    async findOwnedEvent(eventId, userId) {
      return eventId === state.event.id && userId === state.event.userId
        ? state.event
        : null;
    },
    async updateOwnedEvent(eventId, userId, changes) {
      assert.equal(eventId, original.id);
      assert.equal(userId, original.userId);
      assert.equal("pauseSessionId" in changes, false);
      state.updates += 1;
      state.event = { ...state.event, ...changes };
      return state.event;
    },
  };

  const updated = await updateOwnedPickingEvent(repository, "user-a", {
    eventId: "event-existing",
    occurredAt: new Date("2026-10-13T09:00:00.000Z"),
    pickingType: "SQUEEZE",
    triggers: [],
    emotions: [],
    urgeStrength: undefined,
    durationRange: undefined,
    reasons: [],
    impacts: [],
    context: undefined,
  });

  assert.equal(updated.id, original.id);
  assert.equal(updated.pickingType, "SQUEEZE");
  assert.equal(updated.createdAt.getTime(), original.createdAt.getTime());
  assert.equal(updated.recordedAt.getTime(), original.recordedAt.getTime());
  assert.equal(updated.occurredAt.toISOString(), "2026-10-13T09:00:00.000Z");
  assert.equal(updated.pauseSessionId, "pause-1");
  assert.equal(state.updates, 1);
  assert.equal(state.creates, 0);
});

test("editing a record not owned by the authenticated user is rejected", async () => {
  const repository = {
    async findOwnedEvent() {
      return null;
    },
    async updateOwnedEvent() {
      assert.fail("A foreign record must not be updated");
    },
  };

  await assert.rejects(
    updateOwnedPickingEvent(repository, "user-a", {
      eventId: "event-user-b",
      occurredAt: new Date("2026-10-13T09:00:00.000Z"),
      pickingType: "SQUEEZE",
      triggers: [],
      emotions: [],
      urgeStrength: undefined,
      durationRange: undefined,
      reasons: [],
      impacts: [],
      context: undefined,
    }),
    (error) => error instanceof PickingRecordError && error.code === "EVENT_NOT_FOUND"
  );
});
