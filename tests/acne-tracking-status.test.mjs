import assert from "node:assert/strict";
import test from "node:test";
import { getAcneTrackingHealingUpdate } from "../src/lib/acne-tracking-status.ts";

test("active records are marked healed using the supplied calendar date", () => {
  const healedDate = new Date("2026-10-22T00:00:00.000Z");

  assert.deepEqual(
    getAcneTrackingHealingUpdate("ACTIVE", healedDate),
    { status: "HEALED", healedDate }
  );
});

test("healing an already healed record does not produce another update", () => {
  assert.equal(
    getAcneTrackingHealingUpdate(
      "HEALED",
      new Date("2026-10-20T00:00:00.000Z")
    ),
    null
  );
});
