import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateSuccessPercentage,
  getSuccessPercentageLevel,
  getSuccessRingGeometry,
} from "../src/lib/success-percentage.ts";

test("calculates the success percentage from resistance and picking totals", () => {
  assert.equal(calculateSuccessPercentage(0, 0), 0);
  assert.equal(calculateSuccessPercentage(4, 0), 100);
  assert.equal(calculateSuccessPercentage(0, 4), 50);
  assert.equal(calculateSuccessPercentage(1, 1), 75);
  assert.ok(
    Math.abs(calculateSuccessPercentage(148, 102) - 79.6) < 1e-12
  );
});

test("keeps calculated percentages finite and within the allowed range", () => {
  for (const [resistance, picking] of [
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 1],
    [Number.MAX_VALUE, Number.MAX_VALUE],
    [-1, -1],
    [Number.MAX_VALUE, 0],
    [0, Number.MAX_VALUE],
  ]) {
    const percentage = calculateSuccessPercentage(resistance, picking);
    assert.ok(Number.isFinite(percentage));
    assert.ok(percentage >= 0 && percentage <= 100);
  }

  assert.equal(calculateSuccessPercentage(-1, 0), 0);
});

test("selects color levels using the precise percentage boundaries", () => {
  assert.equal(getSuccessPercentageLevel(0), "red");
  assert.equal(getSuccessPercentageLevel(39.99), "red");
  assert.equal(getSuccessPercentageLevel(40), "orange");
  assert.equal(getSuccessPercentageLevel(59.99), "orange");
  assert.equal(getSuccessPercentageLevel(60), "yellow");
  assert.equal(getSuccessPercentageLevel(79.6), "yellow");
  assert.equal(getSuccessPercentageLevel(79.99), "yellow");
  assert.equal(getSuccessPercentageLevel(80), "green");
  assert.equal(getSuccessPercentageLevel(100), "green");
  assert.equal(getSuccessPercentageLevel(Number.NaN), "red");
});

test("ring geometry is empty, proportional, or fully closed at the endpoints", () => {
  const empty = getSuccessRingGeometry(0);
  const half = getSuccessRingGeometry(50);
  const full = getSuccessRingGeometry(100);

  assert.notEqual(empty.strokeDasharray, "none");
  assert.equal(empty.strokeDashoffset, half.strokeDashoffset * 2);
  assert.equal(full.strokeDasharray, "none");
  assert.equal(full.strokeDashoffset, 0);
  assert.equal(getSuccessRingGeometry(150).strokeDashoffset, 0);
  assert.equal(
    getSuccessRingGeometry(Number.NaN).strokeDashoffset,
    empty.strokeDashoffset
  );
});

test("rounding is presentation-only and does not change the color level", () => {
  const percentage = calculateSuccessPercentage(148, 102);

  assert.equal(Math.round(percentage), 80);
  assert.equal(getSuccessPercentageLevel(percentage), "yellow");
});
