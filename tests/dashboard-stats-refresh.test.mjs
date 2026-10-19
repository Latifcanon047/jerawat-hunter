import assert from "node:assert/strict";
import test from "node:test";
import {
  createAppliedStatsFilter,
  notifyDashboardStatsRefresh,
} from "../src/lib/dashboard-stats-refresh.ts";

test("stats refresh uses the last applied filter instead of draft filter values", () => {
  const appliedFilter = {
    mode: "monthly",
    year: 2026,
    month: 9,
    startDay: 3,
    endDay: 12,
  };
  const filterState = createAppliedStatsFilter(appliedFilter);

  assert.equal(filterState.get(), appliedFilter);

  const newlyAppliedFilter = {
    mode: "yearly",
    year: 2025,
  };
  filterState.apply(newlyAppliedFilter);

  assert.equal(filterState.get(), newlyAppliedFilter);
});

test("only successful create actions notify the Dashboard stats refresh", () => {
  let refreshCount = 0;
  const notify = () => {
    refreshCount += 1;
  };

  notifyDashboardStatsRefresh({ success: false }, notify);
  assert.equal(refreshCount, 0);

  notifyDashboardStatsRefresh({ success: true }, notify);
  assert.equal(refreshCount, 1);
});
