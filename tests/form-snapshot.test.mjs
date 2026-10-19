import assert from "node:assert/strict";
import test from "node:test";
import { createFormSnapshot } from "../src/lib/form-snapshot.ts";

test("form snapshots include all current values and the controlled occurrence time", () => {
  const initial = createFormSnapshot(
    [
      ["pickingType", "PEEL"],
      ["triggers", "MIRROR"],
      ["triggers", "STRESS"],
      ["urgeStrength", "3"],
      ["context", "ALONE_IN_ROOM"],
    ],
    "2026-10-18T10:00:00",
  );

  assert.equal(
    createFormSnapshot(
      [
        ["pickingType", "PEEL"],
        ["triggers", "MIRROR"],
        ["triggers", "STRESS"],
        ["urgeStrength", "3"],
        ["context", "ALONE_IN_ROOM"],
      ],
      "2026-10-18T10:00:00",
    ),
    initial,
  );
  assert.notEqual(
    createFormSnapshot(
      [
        ["pickingType", "PEEL"],
        ["triggers", "MIRROR"],
        ["triggers", "STRESS"],
        ["urgeStrength", "3"],
        ["context", "ALONE_IN_ROOM"],
      ],
      "2026-10-18T10:00:01",
    ),
    initial,
  );
});

test("form snapshots detect edited and reverted checkbox, radio, and select values", () => {
  const initialValues = [
    ["pickingType", "PEEL"],
    ["triggers", "MIRROR"],
    ["urgeStrength", "3"],
    ["durationRange", "FROM_1_TO_5_MIN"],
  ];
  const initial = createFormSnapshot(initialValues, "");

  assert.notEqual(
    createFormSnapshot(
      [
        ["pickingType", "SQUEEZE"],
        ["triggers", "MIRROR"],
        ["urgeStrength", "3"],
        ["durationRange", "FROM_1_TO_5_MIN"],
      ],
      "",
    ),
    initial,
  );
  assert.notEqual(
    createFormSnapshot(
      [
        ["pickingType", "PEEL"],
        ["triggers", "STRESS"],
        ["urgeStrength", "3"],
        ["durationRange", "FROM_1_TO_5_MIN"],
      ],
      "",
    ),
    initial,
  );
  assert.equal(createFormSnapshot(initialValues, ""), initial);
});

test("form snapshots detect Resistance date, duration, and note changes and reverts", () => {
  const initialValues = [
    ["durationSecs", "90"],
    ["note", "Tetap tenang"],
  ];
  const initial = createFormSnapshot(initialValues, "2026-10-18T10:00:00");

  assert.notEqual(
    createFormSnapshot(initialValues, "2026-10-18T10:01:00"),
    initial,
  );
  assert.notEqual(
    createFormSnapshot(
      [
        ["durationSecs", "91"],
        ["note", "Tetap tenang"],
      ],
      "2026-10-18T10:00:00",
    ),
    initial,
  );
  assert.notEqual(
    createFormSnapshot(
      [
        ["durationSecs", "90"],
        ["note", "Catatan berubah"],
      ],
      "2026-10-18T10:00:00",
    ),
    initial,
  );
  assert.equal(
    createFormSnapshot(initialValues, "2026-10-18T10:00:00"),
    initial,
  );
});

test("Picking create snapshot includes every editable detail and occurrence time", () => {
  const initialValues = [
    ["pickingType", "PEEL"],
    ["triggers", "MIRROR"],
    ["triggers", "STRESS"],
    ["emotions", "ANXIOUS"],
    ["urgeStrength", "3"],
    ["durationRange", "FROM_1_TO_5_MIN"],
    ["reasons", "REMOVE_TEXTURE"],
    ["impacts", "RED_IRRITATION"],
    ["context", "ALONE_IN_ROOM"],
  ];
  const initial = createFormSnapshot(initialValues, "2026-10-18T10:00:00");

  assert.notEqual(
    createFormSnapshot(
      initialValues.filter(([name]) => name !== "triggers"),
      "2026-10-18T10:00:00",
    ),
    initial,
  );
  assert.notEqual(
    createFormSnapshot(initialValues, "2026-10-18T10:00:01"),
    initial,
  );
  assert.equal(
    createFormSnapshot(initialValues, "2026-10-18T10:00:00"),
    initial,
  );
});

test("Resistance standalone create snapshot detects initial empty values and edits", () => {
  const initialValues = [
    ["durationSecs", ""],
    ["note", ""],
  ];
  const initial = createFormSnapshot(initialValues, "2026-10-18T10:00:00");

  assert.equal(
    createFormSnapshot(initialValues, "2026-10-18T10:00:00"),
    initial,
  );
  assert.notEqual(
    createFormSnapshot(initialValues, "2026-10-18T10:05:00"),
    initial,
  );
  assert.notEqual(
    createFormSnapshot(
      [
        ["durationSecs", "45"],
        ["note", ""],
      ],
      "2026-10-18T10:00:00",
    ),
    initial,
  );
  assert.notEqual(
    createFormSnapshot(
      [
        ["durationSecs", ""],
        ["note", "Berhasil menahan dorongan"],
      ],
      "2026-10-18T10:00:00",
    ),
    initial,
  );
});
