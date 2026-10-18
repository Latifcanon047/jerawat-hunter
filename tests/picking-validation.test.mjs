import assert from "node:assert/strict";
import test from "node:test";
import {
  pickingEventDeleteSchema,
  pickingEventSchema,
  pickingEventUpdateSchema,
} from "../src/lib/validations/picking.ts";

const minimumInput = {
  pickingType: "SQUEEZE",
  occurredAt: "2026-10-16T02:30:00.000Z",
};

test("requires one of the defined picking types", () => {
  assert.equal(pickingEventSchema.safeParse({}).success, false);
  assert.equal(
    pickingEventSchema.safeParse({
      ...minimumInput,
      pickingType: "SCRATCH",
    }).success,
    false
  );
  for (const pickingType of ["SQUEEZE", "PEEL", "TOUCH_FIDGET"]) {
    assert.equal(
      pickingEventSchema.safeParse({ ...minimumInput, pickingType }).success,
      true
    );
  }
});

test("rejects urge strength outside the 1–5 integer range", () => {
  for (const urgeStrength of [0, 6, 2.5, "not-a-number", true]) {
    assert.equal(
      pickingEventSchema.safeParse({ ...minimumInput, urgeStrength }).success,
      false
    );
  }
  assert.equal(
    pickingEventSchema.safeParse({ ...minimumInput, urgeStrength: "5" })
      .success,
    true
  );
});

test("rejects multi-select codes not listed in the schema", () => {
  for (const field of ["triggers", "emotions", "reasons", "impacts"]) {
    assert.equal(
      pickingEventSchema.safeParse({
        ...minimumInput,
        [field]: ["NOT_A_REAL_CODE"],
      }).success,
      false
    );
  }
});

test("allows non-time details to be omitted or left blank", () => {
  const omitted = pickingEventSchema.safeParse(minimumInput);
  assert.equal(omitted.success, true);
  if (omitted.success) {
    assert.deepEqual(omitted.data.triggers, []);
    assert.deepEqual(omitted.data.emotions, []);
    assert.deepEqual(omitted.data.reasons, []);
    assert.deepEqual(omitted.data.impacts, []);
    assert.equal(omitted.data.urgeStrength, undefined);
  }

  const blankSelections = pickingEventSchema.safeParse({
    ...minimumInput,
    urgeStrength: "",
    durationRange: "",
    context: "",
  });
  assert.equal(blankSelections.success, true);
});

test("validates and converts the event occurrence timestamp", () => {
  const timestamp = "2026-10-16T09:30:00.000+07:00";
  const parsed = pickingEventSchema.safeParse({
    ...minimumInput,
    occurredAt: timestamp,
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(
      parsed.data.occurredAt.toISOString(),
      "2026-10-16T02:30:00.000Z"
    );
  }

  for (const occurredAt of [
    "not-a-date",
    "2026-02-30T12:00:00.000Z",
    "2026-10-16T09:30:00",
  ]) {
    assert.equal(
      pickingEventSchema.safeParse({ ...minimumInput, occurredAt }).success,
      false
    );
  }
});

test("requires occurredAt for new Picking records", () => {
  assert.equal(
    pickingEventSchema.safeParse({ pickingType: "SQUEEZE" }).success,
    false
  );
  assert.equal(
    pickingEventSchema.safeParse({
      ...minimumInput,
      occurredAt: "2026-10-16T02:30:00.000Z",
    }).success,
    true
  );
});

test("validates standalone submission idempotency keys", () => {
  const key = "b2e78b90-6ca7-4a80-bfd6-1a0f67ee5eb8";
  assert.equal(
    pickingEventSchema.safeParse({
      ...minimumInput,
      idempotencyKey: key,
    }).success,
    true
  );
  assert.equal(
    pickingEventSchema.safeParse({
      ...minimumInput,
      idempotencyKey: "not-a-uuid",
    }).success,
    false
  );
});

test("accepts the declared duration and context enums only", () => {
  assert.equal(
    pickingEventSchema.safeParse({
      ...minimumInput,
      durationRange: "FROM_1_TO_5_MIN",
      context: "IN_FRONT_OF_MIRROR",
    }).success,
    true
  );
  assert.equal(
    pickingEventSchema.safeParse({
      ...minimumInput,
      durationRange: "ONE_HOUR",
    }).success,
    false
  );
  assert.equal(
    pickingEventSchema.safeParse({
      ...minimumInput,
      context: "SOMEWHERE",
    }).success,
    false
  );
});

test("requires an event ID for edits and does not accept a Pause relation change", () => {
  const parsed = pickingEventUpdateSchema.safeParse({
    eventId: "event-1",
    ...minimumInput,
    pauseSessionId: "pause-from-another-record",
  });

  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal("pauseSessionId" in parsed.data, false);
    assert.equal("occurredAt" in parsed.data, true);
  }
  assert.equal(
    pickingEventUpdateSchema.safeParse({
      ...minimumInput,
    }).success,
    false
  );
});

test("validates PickingEvent deletion IDs", () => {
  assert.equal(
    pickingEventDeleteSchema.safeParse({ eventId: "event-1" }).success,
    true
  );
  assert.equal(
    pickingEventDeleteSchema.safeParse({ eventId: "   " }).success,
    false
  );
  assert.equal(
    pickingEventDeleteSchema.safeParse({ eventId: "x".repeat(65) }).success,
    false
  );
});
