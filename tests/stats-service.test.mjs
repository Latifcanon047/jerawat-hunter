import assert from "node:assert/strict";
import test from "node:test";
import {
  getStats,
  StatsServiceError,
  toJakartaCalendarDate,
} from "../src/lib/stats-service.ts";

function createMockStatsRepository({
  resistances = [],
  pickings = [],
} = {}) {
  const queriedUserIds = [];
  const queryRanges = [];

  return {
    queriedUserIds,
    queryRanges,
    async findResistanceOccurrences(userId, startUtc, endUtc) {
      queriedUserIds.push(userId);
      queryRanges.push({ startUtc, endUtc });
      return resistances
        .filter((r) => r.userId === userId)
        .filter((r) => {
          if (!r.occurredAt) return false;
          return r.occurredAt >= startUtc && r.occurredAt < endUtc;
        })
        .map((r) => ({ occurredAt: r.occurredAt }));
    },
    async findPickingOccurrences(userId, startUtc, endUtc) {
      queriedUserIds.push(userId);
      queryRanges.push({ startUtc, endUtc });
      return pickings
        .filter((p) => p.userId === userId)
        .filter((p) => {
          if (!p.occurredAt) return false;
          return p.occurredAt >= startUtc && p.occurredAt < endUtc;
        })
        .map((p) => ({ occurredAt: p.occurredAt }));
    },
  };
}

test("rejects unauthenticated user before querying repository", async () => {
  const repository = createMockStatsRepository();
  await assert.rejects(
    getStats(repository, null, {
      mode: "monthly",
      year: 2026,
      month: 10,
      startDay: 1,
      endDay: 10,
    }),
    (error) =>
      error instanceof StatsServiceError && error.code === "UNAUTHENTICATED"
  );
  assert.equal(repository.queriedUserIds.length, 0);
});

test("toJakartaCalendarDate accurately converts UTC instant to Jakarta calendar date", () => {
  // 2026-10-01 06:00:00 UTC -> 13:00:00 Jakarta (Day 1)
  const day1 = toJakartaCalendarDate(new Date("2026-10-01T06:00:00.000Z"));
  assert.equal(day1.year, 2026);
  assert.equal(day1.month, 10);
  assert.equal(day1.day, 1);

  // 2026-09-30 17:00:00 UTC -> 2026-10-01 00:00:00 Jakarta (Day 1)
  const boundaryStart = toJakartaCalendarDate(
    new Date("2026-09-30T17:00:00.000Z")
  );
  assert.equal(boundaryStart.year, 2026);
  assert.equal(boundaryStart.month, 10);
  assert.equal(boundaryStart.day, 1);

  // 2026-10-01 16:59:59.999 UTC -> 2026-10-01 23:59:59.999 Jakarta (still Day 1)
  const boundaryEnd = toJakartaCalendarDate(
    new Date("2026-10-01T16:59:59.999Z")
  );
  assert.equal(boundaryEnd.year, 2026);
  assert.equal(boundaryEnd.month, 10);
  assert.equal(boundaryEnd.day, 1);

  // 2026-10-01 17:00:00 UTC -> 2026-10-02 00:00:00 Jakarta (Day 2)
  const boundaryNext = toJakartaCalendarDate(
    new Date("2026-10-01T17:00:00.000Z")
  );
  assert.equal(boundaryNext.year, 2026);
  assert.equal(boundaryNext.month, 10);
  assert.equal(boundaryNext.day, 2);
});

test("monthly mode aggregates Resistance and Picking counts per day and returns zero for inactive days", async () => {
  const fixedNow = new Date("2026-10-17T04:00:00.000Z"); // Day 17 in Jakarta
  const userId = "user-123";

  const resistances = [
    // 2 events on Oct 1 Jakarta (2026-09-30 17:00 UTC and 2026-10-01 02:00 UTC)
    {
      userId,
      occurredAt: new Date("2026-09-30T17:05:00.000Z"),
    },
    {
      userId,
      occurredAt: new Date("2026-10-01T02:00:00.000Z"),
    },
    // 1 event on Oct 3 Jakarta
    {
      userId,
      occurredAt: new Date("2026-10-03T05:00:00.000Z"),
    },
    // Null occurredAt: MUST be ignored
    {
      userId,
      occurredAt: null,
    },
    // Other user event: MUST be ignored
    {
      userId: "user-other",
      occurredAt: new Date("2026-10-01T02:00:00.000Z"),
    },
  ];

  const pickings = [
    // 1 event on Oct 1 Jakarta
    {
      userId,
      occurredAt: new Date("2026-10-01T08:00:00.000Z"),
    },
    // 1 event on Oct 2 Jakarta
    {
      userId,
      occurredAt: new Date("2026-10-02T03:00:00.000Z"),
    },
    // Null occurredAt: MUST be ignored
    {
      userId,
      occurredAt: null,
    },
  ];

  const repository = createMockStatsRepository({ resistances, pickings });

  const result = await getStats(
    repository,
    userId,
    {
      mode: "monthly",
      year: 2026,
      month: 10,
      startDay: 1,
      endDay: 4,
    },
    fixedNow
  );

  assert.equal(result.mode, "monthly");
  assert.equal(result.totalResistance, 3);
  assert.equal(result.totalPicking, 2);
  assert.equal(result.hasActivity, true);
  assert.equal(result.emptyMessage, undefined);
  assert.equal(result.points.length, 4);

  // Day 1
  assert.equal(result.points[0].key, "2026-10-01");
  assert.equal(result.points[0].resistanceCount, 2);
  assert.equal(result.points[0].pickingCount, 1);

  // Day 2
  assert.equal(result.points[1].key, "2026-10-02");
  assert.equal(result.points[1].resistanceCount, 0);
  assert.equal(result.points[1].pickingCount, 1);

  // Day 3
  assert.equal(result.points[2].key, "2026-10-03");
  assert.equal(result.points[2].resistanceCount, 1);
  assert.equal(result.points[2].pickingCount, 0);

  // Day 4 (inactive day has 0)
  assert.equal(result.points[3].key, "2026-10-04");
  assert.equal(result.points[3].resistanceCount, 0);
  assert.equal(result.points[3].pickingCount, 0);
});

test("monthly mode handles period without activity with zero values and short message", async () => {
  const fixedNow = new Date("2026-10-17T04:00:00.000Z");
  const userId = "user-123";
  const repository = createMockStatsRepository({
    resistances: [],
    pickings: [],
  });

  const result = await getStats(
    repository,
    userId,
    {
      mode: "monthly",
      year: 2026,
      month: 10,
      startDay: 5,
      endDay: 7,
    },
    fixedNow
  );

  assert.equal(result.totalResistance, 0);
  assert.equal(result.totalPicking, 0);
  assert.equal(result.hasActivity, false);
  assert.equal(result.emptyMessage, "Belum ada aktivitas pada periode ini.");
  assert.equal(result.points.length, 3);
  assert.ok(
    result.points.every(
      (p) => p.resistanceCount === 0 && p.pickingCount === 0
    )
  );
});

test("yearly mode aggregates across months and caps current year to elapsed months", async () => {
  const fixedNow = new Date("2026-10-17T04:00:00.000Z"); // October 2026 (Month 10)
  const userId = "user-123";

  const resistances = [
    // Month 1 (January)
    {
      userId,
      occurredAt: new Date("2026-01-15T08:00:00.000Z"),
    },
    // Month 10 (October)
    {
      userId,
      occurredAt: new Date("2026-10-10T10:00:00.000Z"),
    },
  ];

  const pickings = [
    // Month 3 (March)
    {
      userId,
      occurredAt: new Date("2026-03-20T12:00:00.000Z"),
    },
  ];

  const repository = createMockStatsRepository({ resistances, pickings });

  const result = await getStats(
    repository,
    userId,
    {
      mode: "yearly",
      year: 2026,
    },
    fixedNow
  );

  assert.equal(result.mode, "yearly");
  assert.equal(result.totalResistance, 2);
  assert.equal(result.totalPicking, 1);
  assert.equal(result.hasActivity, true);
  // Current year only shows up to current month (October = month 10), not 12
  assert.equal(result.points.length, 10);
  assert.equal(result.points[0].label, "Jan");
  assert.equal(result.points[0].resistanceCount, 1);
  assert.equal(result.points[0].pickingCount, 0);

  assert.equal(result.points[2].label, "Mar");
  assert.equal(result.points[2].resistanceCount, 0);
  assert.equal(result.points[2].pickingCount, 1);

  assert.equal(result.points[9].label, "Okt");
  assert.equal(result.points[9].resistanceCount, 1);
  assert.equal(result.points[9].pickingCount, 0);
});

test("yearly mode for past years includes all 12 months", async () => {
  const fixedNow = new Date("2026-10-17T04:00:00.000Z");
  const userId = "user-123";
  const repository = createMockStatsRepository();

  const result = await getStats(
    repository,
    userId,
    {
      mode: "yearly",
      year: 2025,
    },
    fixedNow
  );

  assert.equal(result.points.length, 12);
  assert.equal(result.points[11].label, "Des");
});

test("user isolation: repository query receives authenticated userId only", async () => {
  const fixedNow = new Date("2026-10-17T04:00:00.000Z");
  const repository = createMockStatsRepository();

  await getStats(
    repository,
    "user-alpha",
    {
      mode: "yearly",
      year: 2025,
    },
    fixedNow
  );

  assert.ok(repository.queriedUserIds.length >= 2);
  assert.ok(repository.queriedUserIds.every((id) => id === "user-alpha"));
});
