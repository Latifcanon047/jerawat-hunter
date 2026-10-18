import assert from "node:assert/strict";
import test from "node:test";
import {
  createSubmissionLock,
  deleteOwnedResistance,
  getOwnedResistanceHistory,
  recordStandaloneResistance,
  ResistanceHistoryError,
  ResistanceRecordError,
  savePauseResistanceOutcome,
  shouldCreatePauseResistance,
  updateOwnedResistance,
} from "../src/lib/resistance-service.ts";
import {
  getPauseResistanceDefaults,
  parseJakartaDateTimeInput,
  toJakartaDateTimeInput,
} from "../src/lib/resistance-form-values.ts";
import { hasVisibleResistanceNote } from "../src/lib/resistance-history-utils.ts";

test("Resistance note label is shown only for non-whitespace notes", () => {
  assert.equal(hasVisibleResistanceNote("Catatan tersimpan"), true);
  assert.equal(hasVisibleResistanceNote("   \n\t"), false);
  assert.equal(hasVisibleResistanceNote(null), false);
});

const resistanceInput = {
  occurredAt: new Date("2026-10-15T10:00:00.000Z"),
  durationSecs: undefined,
  note: undefined,
};

function historyRecord(id, {
  userId = "authenticated-user",
  recordedAt = "2026-10-15T10:00:00.000Z",
  occurredAt = "2026-10-15T10:00:00.000Z",
  pauseSessionId = null,
} = {}) {
  return {
    id,
    userId,
    recordedAt: new Date(recordedAt),
    occurredAt: occurredAt ? new Date(occurredAt) : null,
    durationSecs: 30,
    note: "catatan",
    pauseSessionId,
    createdAt: new Date("2026-10-15T10:01:00.000Z"),
    pauseSession: pauseSessionId
      ? {
          outcome: "SUCCEEDED",
          startedAt: new Date("2026-10-15T09:59:00.000Z"),
        }
      : null,
  };
}

function createHistoryRepository(records, { failDelete = false } = {}) {
  const pauseSession = {
    outcome: "SUCCEEDED",
    endedAt: new Date("2026-10-15T10:01:00.000Z"),
    pickingEvent: null,
    pickingFollowUpCompleted: false,
  };
  let deleteCalls = 0;
  return {
    records,
    pauseSession,
    get deleteCalls() {
      return deleteCalls;
    },
    async findManyOwned(userId) {
      return records.filter((record) => record.userId === userId);
    },
    async findOwned(id, userId) {
      return records.find(
        (record) => record.id === id && record.userId === userId
      ) ?? null;
    },
    async updateOwned(id, userId, fields) {
      const record = records.find(
        (candidate) => candidate.id === id && candidate.userId === userId
      );
      if (!record) return null;
      Object.assign(record, fields);
      return record;
    },
    async deleteOwned(id, userId) {
      const index = records.findIndex(
        (record) => record.id === id && record.userId === userId
      );
      if (index === -1) return "NOT_FOUND";
      deleteCalls += 1;
      const record = records[index];
      if (record.pauseSessionId === null) {
        records.splice(index, 1);
        return "DELETED";
      }
      if (pauseSession.pickingEvent) return "INTEGRITY_ERROR";
      if (pauseSession.outcome !== "SUCCEEDED") return "INVALID_PAUSE_STATE";

      const [deleted] = records.splice(index, 1);
      if (failDelete) {
        records.splice(index, 0, deleted);
        throw new Error("delete failure");
      }
      return "DELETED";
    },
  };
}

test("history returns only the authenticated user's manual and Pause Resistance sorted by occurrence fallback", async () => {
  const manualEarlier = historyRecord("manual-earlier", {
    occurredAt: "2026-10-14T09:00:00.000Z",
    recordedAt: "2026-10-16T09:00:00.000Z",
  });
  const legacy = historyRecord("legacy", {
    occurredAt: null,
    recordedAt: "2026-10-15T09:00:00.000Z",
  });
  const pauseLater = historyRecord("pause-later", {
    occurredAt: "2026-10-16T10:00:00.000Z",
    pauseSessionId: "pause-1",
  });
  const foreign = historyRecord("foreign", {
    userId: "another-user",
    occurredAt: "2026-10-17T10:00:00.000Z",
  });
  const repository = createHistoryRepository([
    manualEarlier,
    legacy,
    pauseLater,
    foreign,
  ]);

  const records = await getOwnedResistanceHistory(
    repository,
    "authenticated-user"
  );

  assert.deepEqual(
    records.map((record) => record.id),
    ["pause-later", "legacy", "manual-earlier"]
  );
  assert.ok(records.every((record) => record.userId === "authenticated-user"));
});

test("history includes newly persisted manual and succeeded Pause records", async () => {
  const manual = historyRecord("new-manual");
  const fromPause = historyRecord("new-pause", {
    pauseSessionId: "pause-new",
  });
  const repository = createHistoryRepository([manual, fromPause]);

  const records = await getOwnedResistanceHistory(
    repository,
    "authenticated-user"
  );

  assert.deepEqual(
    records.map((record) => record.id),
    ["new-manual", "new-pause"]
  );
});

test("history rejects a missing authenticated user before querying", async () => {
  let queries = 0;
  await assert.rejects(
    getOwnedResistanceHistory(
      {
        async findManyOwned() {
          queries += 1;
          return [];
        },
      },
      null
    ),
    (error) =>
      error instanceof ResistanceHistoryError &&
      error.code === "UNAUTHENTICATED"
  );
  assert.equal(queries, 0);
});

test("edits update only occurrence metadata and preserve owner, timestamps and Pause outcome", async () => {
  const pauseRecord = historyRecord("pause-record", {
    pauseSessionId: "pause-1",
  });
  const repository = createHistoryRepository([pauseRecord]);
  const immutableBefore = {
    id: pauseRecord.id,
    userId: pauseRecord.userId,
    recordedAt: pauseRecord.recordedAt,
    createdAt: pauseRecord.createdAt,
    pauseSessionId: pauseRecord.pauseSessionId,
    pauseOutcome: repository.pauseSession.outcome,
    pauseEndedAt: repository.pauseSession.endedAt,
  };
  const fields = {
    occurredAt: new Date("2026-10-16T10:00:00.000Z"),
    durationSecs: 75,
    note: "diperbarui",
  };

  const updated = await updateOwnedResistance(
    repository,
    "authenticated-user",
    "pause-record",
    fields
  );

  assert.deepEqual(
    {
      id: updated.id,
      userId: updated.userId,
      recordedAt: updated.recordedAt,
      createdAt: updated.createdAt,
      pauseSessionId: updated.pauseSessionId,
      pauseOutcome: repository.pauseSession.outcome,
      pauseEndedAt: repository.pauseSession.endedAt,
    },
    immutableBefore
  );
  assert.deepEqual(
    {
      occurredAt: updated.occurredAt,
      durationSecs: updated.durationSecs,
      note: updated.note,
    },
    fields
  );
});

test("editing another user's Resistance is rejected and does not modify it", async () => {
  const foreignRecord = historyRecord("foreign", { userId: "another-user" });
  const repository = createHistoryRepository([foreignRecord]);
  const originalNote = foreignRecord.note;

  await assert.rejects(
    updateOwnedResistance(repository, "authenticated-user", "foreign", {
      occurredAt: new Date("2026-10-16T10:00:00.000Z"),
      durationSecs: 100,
      note: "forged",
    }),
    (error) =>
      error instanceof ResistanceHistoryError && error.code === "NOT_FOUND"
  );
  assert.equal(foreignRecord.note, originalNote);
});

test("manual Resistance can be deleted without changing Pause state", async () => {
  const manual = historyRecord("manual");
  const repository = createHistoryRepository([manual]);
  const outcome = repository.pauseSession.outcome;
  const endedAt = repository.pauseSession.endedAt;

  await deleteOwnedResistance(repository, "authenticated-user", "manual");

  assert.deepEqual(repository.records, []);
  assert.equal(repository.deleteCalls, 1);
  assert.equal(repository.pauseSession.outcome, outcome);
  assert.equal(repository.pauseSession.endedAt, endedAt);
});

test("Pause-linked Resistance deletion preserves the completed Pause outcome", async () => {
  const linked = historyRecord("pause-record", { pauseSessionId: "pause-1" });
  const repository = createHistoryRepository([linked]);
  const endedAt = repository.pauseSession.endedAt;

  await deleteOwnedResistance(repository, "authenticated-user", "pause-record");

  assert.equal(repository.records.length, 0);
  assert.equal(repository.deleteCalls, 1);
  assert.equal(repository.pauseSession.outcome, "SUCCEEDED");
  assert.equal(repository.pauseSession.endedAt, endedAt);
  assert.equal(repository.pauseSession.pickingEvent, null);
  assert.equal(repository.pauseSession.pickingFollowUpCompleted, false);
});

test("Pause-linked deletion preserves other Resistance records and Picking follow-up state", async () => {
  const linked = historyRecord("pause-record", { pauseSessionId: "pause-1" });
  const otherResistance = historyRecord("manual-record");
  const repository = createHistoryRepository([linked, otherResistance]);
  repository.pauseSession.pickingFollowUpCompleted = true;
  const pickingFollowUpCompleted =
    repository.pauseSession.pickingFollowUpCompleted;

  await deleteOwnedResistance(repository, "authenticated-user", "pause-record");

  assert.deepEqual(repository.records, [otherResistance]);
  assert.equal(repository.pauseSession.outcome, "SUCCEEDED");
  assert.equal(
    repository.pauseSession.pickingFollowUpCompleted,
    pickingFollowUpCompleted
  );
  assert.equal(repository.pauseSession.pickingEvent, null);
});

test("deleting another user's Resistance is rejected without calling delete", async () => {
  const foreignRecord = historyRecord("foreign", { userId: "another-user" });
  const repository = createHistoryRepository([foreignRecord]);

  await assert.rejects(
    deleteOwnedResistance(repository, "authenticated-user", "foreign"),
    (error) =>
      error instanceof ResistanceHistoryError && error.code === "NOT_FOUND"
  );
  assert.equal(repository.records.length, 1);
  assert.equal(repository.deleteCalls, 0);
});

test("failed Resistance update or delete leaves stored records unchanged", async () => {
  const manual = historyRecord("manual");
  const repository = createHistoryRepository([manual]);
  const initialNote = manual.note;
  const failingRepository = {
    ...repository,
    async updateOwned() {
      throw new Error("write failure");
    },
    async deleteOwned() {
      throw new Error("delete failure");
    },
  };

  await assert.rejects(
    updateOwnedResistance(
      failingRepository,
      "authenticated-user",
      "manual",
      {
        occurredAt: new Date("2026-10-16T10:00:00.000Z"),
        durationSecs: 80,
        note: "partial",
      }
    ),
    /write failure/
  );
  await assert.rejects(
    deleteOwnedResistance(
      failingRepository,
      "authenticated-user",
      "manual"
    ),
    /delete failure/
  );
  assert.equal(repository.records.length, 1);
  assert.equal(manual.note, initialNote);
});

test("failed Pause-linked deletion leaves the Resistance and Pause state unchanged", async () => {
  const linked = historyRecord("pause-record", { pauseSessionId: "pause-1" });
  const repository = createHistoryRepository([linked], {
    failDelete: true,
  });

  await assert.rejects(
    deleteOwnedResistance(repository, "authenticated-user", "pause-record"),
    /delete failure/
  );

  assert.deepEqual(repository.records, [linked]);
  assert.equal(repository.pauseSession.outcome, "SUCCEEDED");
  assert.equal(repository.pauseSession.pickingFollowUpCompleted, false);
});

test("Pause-linked deletion refuses a session that has a Picking follow-up", async () => {
  const linked = historyRecord("pause-record", { pauseSessionId: "pause-1" });
  const repository = createHistoryRepository([linked]);
  repository.pauseSession.pickingEvent = { id: "picking-1" };

  await assert.rejects(
    deleteOwnedResistance(repository, "authenticated-user", "pause-record"),
    (error) =>
      error instanceof ResistanceHistoryError && error.code === "INTEGRITY_ERROR"
  );

  assert.deepEqual(repository.records, [linked]);
  assert.equal(repository.pauseSession.outcome, "SUCCEEDED");
  assert.deepEqual(repository.pauseSession.pickingEvent, { id: "picking-1" });
});

test("retry after deleting a Pause success does not recreate its Resistance", async () => {
  const linked = historyRecord("pause-record", { pauseSessionId: "pause-1" });
  const historyRepository = createHistoryRepository([linked]);
  const endedAt = historyRepository.pauseSession.endedAt;

  await deleteOwnedResistance(
    historyRepository,
    "authenticated-user",
    "pause-record"
  );

  const pauseRepository = createPauseRepository({
    outcome: historyRepository.pauseSession.outcome,
    endedAt,
  });
  const saved = await savePauseResistanceOutcome(
    pauseRepository,
    "authenticated-user",
    "pause-1",
    resistanceInput
  );

  assert.equal(saved.outcome, "SUCCEEDED");
  assert.equal(saved.endedAt, endedAt);
  assert.equal(pauseRepository.resistances.length, 0);
});

test("rejects an unauthenticated standalone resistance without writing", async () => {
  let writes = 0;
  const repository = {
    async create() {
      writes += 1;
    },
  };

  await assert.rejects(
    recordStandaloneResistance(repository, null, resistanceInput),
    ResistanceRecordError
  );
  assert.equal(writes, 0);
});

test("creates one standalone Resistance owned by the authenticated user with no Pause", async () => {
  const writes = [];
  const repository = {
    async create(data) {
      writes.push(data);
    },
  };

  await recordStandaloneResistance(
    repository,
    "authenticated-user",
    resistanceInput
  );

  assert.deepEqual(writes, [
    {
      userId: "authenticated-user",
      pauseSessionId: null,
      occurredAt: resistanceInput.occurredAt,
      durationSecs: null,
      note: null,
    },
  ]);
});

test("propagates persistence failures instead of reporting a successful write", async () => {
  const repository = {
    async create() {
      throw new Error("database unavailable");
    },
  };

  await assert.rejects(
    recordStandaloneResistance(
      repository,
      "authenticated-user",
      resistanceInput
    ),
    /database unavailable/
  );
});

test("allows only the SUCCEEDED Pause outcome to create a Resistance", () => {
  assert.equal(shouldCreatePauseResistance("SUCCEEDED"), true);
  assert.equal(shouldCreatePauseResistance("PICKED"), false);
  assert.equal(shouldCreatePauseResistance("STILL_RESISTING"), false);
});

test("submission lock prevents a second request while the first is active", () => {
  const lock = createSubmissionLock();

  assert.equal(lock.tryAcquire(), true);
  assert.equal(lock.tryAcquire(), false);
  lock.release();
  assert.equal(lock.tryAcquire(), true);
  lock.release();
});

test("Pause form defaults to its opening time and calculates actual elapsed seconds", () => {
  assert.deepEqual(
    getPauseResistanceDefaults(
      "2026-10-15T10:00:00.000Z",
      "2026-10-15T10:01:42.900Z",
      new Date("2026-10-15T10:02:03.000Z")
    ),
    {
      occurredAt: toJakartaDateTimeInput(
        new Date("2026-10-15T10:02:03.000Z")
      ),
      durationSecs: "102",
    }
  );
});

test("Jakarta form time round-trips an instant using the product timezone", () => {
  const instant = new Date("2026-10-16T17:15:00.000Z");
  const calendarInput = toJakartaDateTimeInput(instant);

  assert.equal(calendarInput, "2026-10-17T00:15:00");
  assert.equal(
    parseJakartaDateTimeInput(calendarInput)?.toISOString(),
    instant.toISOString()
  );
});

test("Jakarta input parsing rejects invalid calendar dates", () => {
  assert.equal(parseJakartaDateTimeInput("2026-02-29T12:00:00"), null);
  assert.equal(parseJakartaDateTimeInput("2026-10-17T24:00:00"), null);
});

function createPauseRepository({
  outcome = null,
  endedAt = new Date("2026-10-15T10:01:00.000Z"),
  failCreate = false,
  failUpdate = false,
} = {}) {
  const session = {
    id: "pause-1",
    userId: "authenticated-user",
    durationSecs: 60,
    startedAt: new Date("2026-10-15T10:00:00.000Z"),
    endedAt,
    endedEarly: false,
    outcome,
    pickingFollowUpCompleted: false,
  };
  const resistances = [];

  return {
    session,
    resistances,
    async transaction(callback) {
      const beforeSession = { ...session };
      const beforeResistances = [...resistances];
      try {
        return await callback({
          async lockOwnedSession(sessionId, userId) {
            return session.id === sessionId && session.userId === userId;
          },
          async findSession(sessionId) {
            return session.id === sessionId ? { ...session } : null;
          },
          async findResistanceOwner(sessionId) {
            return (
              resistances.find((record) => record.pauseSessionId === sessionId)
                ?.userId ?? null
            );
          },
          async createResistance(record) {
            if (failCreate) throw new Error("write failure");
            resistances.push(record);
          },
          async updateSession(sessionId, data) {
            if (failUpdate) throw new Error("session update failure");
            Object.assign(session, data);
            return { ...session };
          },
        });
      } catch (error) {
        Object.assign(session, beforeSession);
        resistances.splice(0, resistances.length, ...beforeResistances);
        throw error;
      }
    },
  };
}

test("Pause success creates one Resistance linked to its owned session", async () => {
  const repository = createPauseRepository();
  const saved = await savePauseResistanceOutcome(
    repository,
    "authenticated-user",
    "pause-1",
    {
      occurredAt: new Date("2026-10-15T10:01:00.000Z"),
      durationSecs: 60,
      note: "Berhasil mengambil jeda.",
    }
  );

  assert.equal(saved.outcome, "SUCCEEDED");
  assert.deepEqual(repository.resistances, [
    {
      userId: "authenticated-user",
      pauseSessionId: "pause-1",
      occurredAt: new Date("2026-10-15T10:01:00.000Z"),
      durationSecs: 60,
      note: "Berhasil mengambil jeda.",
    },
  ]);
});

test("Pause resistance save rolls back the Resistance when session update fails", async () => {
  const repository = createPauseRepository({ failUpdate: true });

  await assert.rejects(
    savePauseResistanceOutcome(
      repository,
      "authenticated-user",
      "pause-1",
      resistanceInput
    ),
    /session update failure/
  );
  assert.equal(repository.session.outcome, null);
  assert.equal(repository.resistances.length, 0);
});

test("retries for a completed Pause success do not create a duplicate", async () => {
  const repository = createPauseRepository({ outcome: "SUCCEEDED" });
  repository.resistances.push({
    userId: "authenticated-user",
    pauseSessionId: "pause-1",
  });

  await savePauseResistanceOutcome(
    repository,
    "authenticated-user",
    "pause-1",
    resistanceInput
  );

  assert.equal(repository.resistances.length, 1);
});

test("a succeeded session without endedAt or with a foreign Resistance is an integrity error", async () => {
  const missingEndTime = createPauseRepository({
    outcome: "SUCCEEDED",
    endedAt: null,
  });
  const foreignResistance = createPauseRepository({ outcome: "SUCCEEDED" });
  foreignResistance.resistances.push({
    userId: "another-user",
    pauseSessionId: "pause-1",
  });

  for (const { repository, expectedResistanceCount } of [
    { repository: missingEndTime, expectedResistanceCount: 0 },
    { repository: foreignResistance, expectedResistanceCount: 1 },
  ]) {
    await assert.rejects(
      savePauseResistanceOutcome(
        repository,
        "authenticated-user",
        "pause-1",
        resistanceInput
      ),
      (error) => error.code === "INTEGRITY_ERROR"
    );
    assert.equal(repository.resistances.length, expectedResistanceCount);
  }
});

test("concurrent retries for one Pause success create only one Resistance", async () => {
  const repository = createPauseRepository();
  const runTransaction = repository.transaction.bind(repository);
  let transactionQueue = Promise.resolve();
  repository.transaction = (callback) => {
    const result = transactionQueue.then(() => runTransaction(callback));
    transactionQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };

  await Promise.all([
    savePauseResistanceOutcome(
      repository,
      "authenticated-user",
      "pause-1",
      resistanceInput
    ),
    savePauseResistanceOutcome(
      repository,
      "authenticated-user",
      "pause-1",
      resistanceInput
    ),
  ]);

  assert.equal(repository.resistances.length, 1);
  assert.equal(repository.session.outcome, "SUCCEEDED");
});
