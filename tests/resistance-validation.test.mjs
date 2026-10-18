import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_RESISTANCE_DURATION_SECS,
  pauseResistanceInputSchema,
  resistanceDeleteSchema,
  resistanceInputSchema,
  resistanceUpdateSchema,
} from "../src/lib/validations/resistance.ts";

const validInput = {
  occurredAt: "2026-10-15T10:00:00.000Z",
  durationSecs: "",
  note: "",
};

test("requires a valid ISO occurrence timestamp", () => {
  assert.equal(resistanceInputSchema.safeParse(validInput).success, true);
  for (const occurredAt of ["", "yesterday", "2026-13-40T99:00:00Z"]) {
    assert.equal(
      resistanceInputSchema.safeParse({ ...validInput, occurredAt }).success,
      false
    );
  }
});

test("duration is optional and restricted to whole nonnegative seconds up to 24 hours", () => {
  assert.equal(
    resistanceInputSchema.safeParse({
      ...validInput,
      durationSecs: undefined,
    }).success,
    true
  );
  for (const durationSecs of [0, "12", MAX_RESISTANCE_DURATION_SECS]) {
    assert.equal(
      resistanceInputSchema.safeParse({ ...validInput, durationSecs }).success,
      true
    );
  }
  for (const durationSecs of [-1, 1.5, "1.5", MAX_RESISTANCE_DURATION_SECS + 1]) {
    assert.equal(
      resistanceInputSchema.safeParse({ ...validInput, durationSecs }).success,
      false
    );
  }
});

test("note is optional, trims whitespace, and has a 500-character limit", () => {
  assert.equal(
    resistanceInputSchema.safeParse({ ...validInput, note: undefined }).success,
    true
  );
  assert.equal(
    resistanceInputSchema.safeParse({
      ...validInput,
      note: ` ${"a".repeat(500)} `,
    }).success,
    true
  );
  assert.equal(
    resistanceInputSchema.safeParse({
      ...validInput,
      note: "a".repeat(500),
    }).success,
    true
  );
  assert.equal(
    resistanceInputSchema.safeParse({
      ...validInput,
      note: "a".repeat(501),
    }).success,
    false
  );
});

test("Pause Resistance input requires a valid session ID as well as the event time", () => {
  assert.equal(
    pauseResistanceInputSchema.safeParse({
      sessionId: "pause-session-1",
      ...validInput,
    }).success,
    true
  );
  assert.equal(
    pauseResistanceInputSchema.safeParse({
      ...validInput,
    }).success,
    false
  );
});

test("Resistance edit accepts only mutable metadata plus a record ID", () => {
  assert.equal(
    resistanceUpdateSchema.safeParse({
      resistanceId: "resistance-1",
      ...validInput,
    }).success,
    true
  );
  assert.equal(
    resistanceUpdateSchema.safeParse({
      resistanceId: "resistance-1",
      ...validInput,
      userId: "forged-user",
      pauseSessionId: "forged-pause",
      recordedAt: "2026-10-16T10:00:00.000Z",
    }).success,
    true
  );
  const parsed = resistanceUpdateSchema.parse({
    resistanceId: "resistance-1",
    ...validInput,
    userId: "forged-user",
    pauseSessionId: "forged-pause",
    recordedAt: "2026-10-16T10:00:00.000Z",
  });
  assert.equal("userId" in parsed, false);
  assert.equal("pauseSessionId" in parsed, false);
  assert.equal("recordedAt" in parsed, false);
});

test("Resistance deletion validates the record ID", () => {
  assert.equal(
    resistanceDeleteSchema.safeParse({ resistanceId: "resistance-1" })
      .success,
    true
  );
  assert.equal(
    resistanceDeleteSchema.safeParse({ resistanceId: " " }).success,
    false
  );
});
