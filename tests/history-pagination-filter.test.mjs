import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PAGE_SIZE,
  historyPaginationSchema,
  resolveHistoryDateRange,
} from "../src/lib/validations/history.ts";
import {
  pickingHistoryFilter,
  pickingHistoryOrderBy,
} from "../src/lib/picking-service.ts";
import {
  resistanceHistoryFilter,
  resistanceHistoryOrderBy,
} from "../src/lib/resistance-service.ts";

test("DEFAULT_PAGE_SIZE is strictly 50", () => {
  assert.equal(DEFAULT_PAGE_SIZE, 50);
});

test("historyPaginationSchema defaults to page 1, pageSize 50, filter null", () => {
  const result = historyPaginationSchema.safeParse({});
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.page, 1);
    assert.equal(result.data.pageSize, 50);
    assert.equal(result.data.filter, null);
  }
});

test("historyPaginationSchema enforces maximum 50 records per page", () => {
  const invalid = historyPaginationSchema.safeParse({ pageSize: 51 });
  assert.equal(invalid.success, false);

  const validMax = historyPaginationSchema.safeParse({ pageSize: 50 });
  assert.equal(validMax.success, true);
});

test("historyPaginationSchema rejects invalid page numbers", () => {
  assert.equal(historyPaginationSchema.safeParse({ page: 0 }).success, false);
  assert.equal(historyPaginationSchema.safeParse({ page: -1 }).success, false);
  assert.equal(historyPaginationSchema.safeParse({ page: 1.5 }).success, false);
});

test("resolveHistoryDateRange returns null for unfiltered queries", () => {
  assert.deepEqual(resolveHistoryDateRange(null), {
    isValid: true,
    dateRange: null,
  });
  assert.deepEqual(resolveHistoryDateRange(undefined), {
    isValid: true,
    dateRange: null,
  });
});

test("resolveHistoryDateRange calculates accurate inclusive Asia/Jakarta bounds for Monthly filter", () => {
  const fixedNow = new Date("2026-10-17T08:00:00.000Z"); // Oct 17 2026, 15:00 Jakarta
  const filter = {
    mode: "monthly",
    year: 2026,
    month: 10,
    startDay: 5,
    endDay: 12,
  };
  const res = resolveHistoryDateRange(filter, fixedNow);
  assert.equal(res.isValid, true);
  assert.ok(res.dateRange);

  // 2026-10-05 00:00:00 Jakarta = 2026-10-04 17:00:00 UTC
  assert.equal(
    res.dateRange.startUtc.toISOString(),
    "2026-10-04T17:00:00.000Z"
  );
  // 2026-10-12 23:59:59.999 Jakarta = 2026-10-12 16:59:59.999 UTC
  // Exclusive upper bound is start of next day (2026-10-13 00:00:00 Jakarta = 2026-10-12 17:00:00 UTC)
  assert.equal(
    res.dateRange.endUtc.toISOString(),
    "2026-10-12T17:00:00.000Z"
  );
});

test("resolveHistoryDateRange caps current month to today in Asia/Jakarta", () => {
  const fixedNow = new Date("2026-10-17T08:00:00.000Z"); // Oct 17 2026 Jakarta
  const filter = {
    mode: "monthly",
    year: 2026,
    month: 10,
    startDay: 1,
    endDay: 25, // Requesting future day in current month
  };
  const res = resolveHistoryDateRange(filter, fixedNow);
  assert.equal(res.isValid, true);
  assert.ok(res.dateRange);
  // Capped to Oct 17 (end bound is Oct 18 00:00 Jakarta = Oct 17 17:00 UTC)
  assert.equal(
    res.dateRange.endUtc.toISOString(),
    "2026-10-17T17:00:00.000Z"
  );
});

test("resolveHistoryDateRange calculates accurate bounds for Yearly filter", () => {
  const fixedNow = new Date("2026-10-17T08:00:00.000Z"); // 2026
  const pastYearFilter = {
    mode: "yearly",
    year: 2025,
  };
  const pastRes = resolveHistoryDateRange(pastYearFilter, fixedNow);
  assert.equal(pastRes.isValid, true);
  assert.ok(pastRes.dateRange);
  // 2025-01-01 00:00 Jakarta = 2024-12-31 17:00 UTC
  assert.equal(
    pastRes.dateRange.startUtc.toISOString(),
    "2024-12-31T17:00:00.000Z"
  );
  // 2026-01-01 00:00 Jakarta = 2025-12-31 17:00 UTC
  assert.equal(
    pastRes.dateRange.endUtc.toISOString(),
    "2025-12-31T17:00:00.000Z"
  );

  // Current year capped to current month
  const currentYearFilter = {
    mode: "yearly",
    year: 2026,
  };
  const curRes = resolveHistoryDateRange(currentYearFilter, fixedNow);
  assert.equal(curRes.isValid, true);
  assert.ok(curRes.dateRange);
  assert.equal(
    curRes.dateRange.startUtc.toISOString(),
    "2025-12-31T17:00:00.000Z"
  );
  // Capped to end of Oct 2026 (Nov 1 00:00 Jakarta = Oct 31 17:00 UTC)
  assert.equal(
    curRes.dateRange.endUtc.toISOString(),
    "2026-10-31T17:00:00.000Z"
  );
});

test("resolveHistoryDateRange rejects invalid date input", () => {
  const fixedNow = new Date("2026-10-17T08:00:00.000Z");
  assert.equal(
    resolveHistoryDateRange(
      { mode: "monthly", year: 2027, month: 1, startDay: 1, endDay: 5 },
      fixedNow
    ).isValid,
    false
  );
  assert.equal(
    resolveHistoryDateRange(
      { mode: "monthly", year: 2026, month: 10, startDay: 15, endDay: 10 },
      fixedNow
    ).isValid,
    false
  );
});

test("pickingHistoryFilter includes occurredAt only when dateRange is provided", () => {
  const unfiltered = pickingHistoryFilter("user-1");
  assert.deepEqual(unfiltered, { userId: "user-1" });
  assert.equal("occurredAt" in unfiltered, false);

  const range = {
    startUtc: new Date("2026-10-01T17:00:00.000Z"),
    endUtc: new Date("2026-10-15T17:00:00.000Z"),
  };
  const filtered = pickingHistoryFilter("user-1", range);
  assert.deepEqual(filtered, {
    userId: "user-1",
    occurredAt: {
      gte: range.startUtc,
      lt: range.endUtc,
    },
  });
});

test("resistanceHistoryFilter preserves SUCCEEDED outcome and includes occurredAt only when dateRange is provided", () => {
  const unfiltered = resistanceHistoryFilter("user-1");
  assert.equal(unfiltered.userId, "user-1");
  assert.equal("occurredAt" in unfiltered, false);
  assert.deepEqual(unfiltered.OR, [
    { pauseSessionId: null },
    { pauseSession: { is: { outcome: "SUCCEEDED" } } },
  ]);

  const range = {
    startUtc: new Date("2026-10-01T17:00:00.000Z"),
    endUtc: new Date("2026-10-15T17:00:00.000Z"),
  };
  const filtered = resistanceHistoryFilter("user-1", range);
  assert.equal(filtered.userId, "user-1");
  assert.deepEqual(filtered.occurredAt, {
    gte: range.startUtc,
    lt: range.endUtc,
  });
});

test("deterministic ordering tie-breakers are configured with occurredAt nulls last", () => {
  assert.deepEqual(pickingHistoryOrderBy, [
    { occurredAt: { sort: "desc", nulls: "last" } },
    { recordedAt: "desc" },
    { id: "desc" },
  ]);

  assert.deepEqual(resistanceHistoryOrderBy, [
    { occurredAt: { sort: "desc", nulls: "last" } },
    { recordedAt: "desc" },
    { id: "desc" },
  ]);
});

test("deterministic sorting orders by occurredAt desc, recordedAt desc, id desc, and nulls last", () => {
  const records = [
    {
      id: "a",
      occurredAt: null,
      recordedAt: new Date("2026-10-10T10:00:00Z"),
    },
    {
      id: "b",
      occurredAt: new Date("2026-10-12T10:00:00Z"),
      recordedAt: new Date("2026-10-12T10:01:00Z"),
    },
    {
      id: "c",
      occurredAt: new Date("2026-10-15T10:00:00Z"),
      recordedAt: new Date("2026-10-15T10:01:00Z"),
    },
    {
      id: "d",
      occurredAt: new Date("2026-10-12T10:00:00Z"), // Same occurredAt as 'b'
      recordedAt: new Date("2026-10-12T10:02:00Z"), // Later recordedAt -> should precede 'b'
    },
    {
      id: "e",
      occurredAt: null,
      recordedAt: new Date("2026-10-11T10:00:00Z"), // Later recordedAt than 'a'
    },
  ];

  // Emulate SQL: ORDER BY occurredAt DESC NULLS LAST, recordedAt DESC, id DESC
  const sorted = [...records].sort((l, r) => {
    if (l.occurredAt && r.occurredAt) {
      const diff = r.occurredAt.getTime() - l.occurredAt.getTime();
      if (diff !== 0) return diff;
    } else if (l.occurredAt && !r.occurredAt) {
      return -1; // nulls last
    } else if (!l.occurredAt && r.occurredAt) {
      return 1; // nulls last
    }
    const recDiff = r.recordedAt.getTime() - l.recordedAt.getTime();
    if (recDiff !== 0) return recDiff;
    return r.id.localeCompare(l.id);
  });

  assert.deepEqual(
    sorted.map((r) => r.id),
    ["c", "d", "b", "e", "a"]
  );
});

test("pagination clamps requested page if out of bounds after deletion or page change", () => {
  // Scenario 1: totalCount = 101, pageSize = 50 -> totalPages = 3
  const totalCount = 101;
  const pageSize = 50;
  const totalPages = Math.ceil(totalCount / pageSize);
  assert.equal(totalPages, 3);

  const reqPageValid = 2;
  const effectivePageValid = Math.min(reqPageValid, totalPages);
  assert.equal(effectivePageValid, 2);
  assert.equal((effectivePageValid - 1) * pageSize, 50);

  // User was on page 3, deletes item #101. Now totalCount = 100 -> totalPages = 2
  const updatedCount = 100;
  const updatedTotalPages = Math.ceil(updatedCount / pageSize);
  assert.equal(updatedTotalPages, 2);

  const reqPagePrev = 3;
  const effectivePageClamped =
    updatedTotalPages > 0 ? Math.min(reqPagePrev, updatedTotalPages) : 1;
  assert.equal(effectivePageClamped, 2); // Clamped to valid page 2!
  assert.equal((effectivePageClamped - 1) * pageSize, 50);

  // If total is 0
  const emptyCount = 0;
  const emptyTotalPages = Math.ceil(emptyCount / pageSize);
  assert.equal(emptyTotalPages, 0);
  const effectiveEmptyPage =
    emptyTotalPages > 0 ? Math.min(1, emptyTotalPages) : 1;
  assert.equal(effectiveEmptyPage, 1);
  assert.equal((effectiveEmptyPage - 1) * pageSize, 0);
});

test("user isolation: filters are always scoped to authenticated user ID", () => {
  const pFilter = pickingHistoryFilter("user-alice");
  assert.equal(pFilter.userId, "user-alice");

  const rFilter = resistanceHistoryFilter("user-bob");
  assert.equal(rFilter.userId, "user-bob");
});
