import assert from "node:assert/strict";
import test from "node:test";
import {
  acneTrackingMetadataSchema,
  acneTrackingListQuerySchema,
} from "../src/lib/validations/acne-tracking.ts";

test("requires one of the supported Acne Tracking statuses", () => {
  for (const status of ["ACTIVE", "HEALED"]) {
    assert.equal(
      acneTrackingListQuerySchema.safeParse({ status }).success,
      true
    );
  }

  for (const status of [undefined, "", "active", "healing", "UNKNOWN"]) {
    const input = status === undefined ? {} : { status };
    assert.equal(acneTrackingListQuerySchema.safeParse(input).success, false);
  }
});

test("page and pageSize are optional and positive integer strings become numbers", () => {
  const omitted = acneTrackingListQuerySchema.safeParse({ status: "ACTIVE" });
  assert.equal(omitted.success, true);
  if (omitted.success) {
    assert.equal("page" in omitted.data, false);
    assert.equal("pageSize" in omitted.data, false);
  }

  const parsed = acneTrackingListQuerySchema.safeParse({
    status: "HEALED",
    page: "12",
    pageSize: "25",
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.page, 12);
    assert.equal(parsed.data.pageSize, 25);
  }
});

test("rejects noncanonical or nonpositive pagination values", () => {
  const invalidValues = ["", "0", "-1", "1.5", "text", "01"];

  for (const value of invalidValues) {
    assert.equal(
      acneTrackingListQuerySchema.safeParse({
        status: "ACTIVE",
        page: value,
      }).success,
      false,
      `page should reject ${JSON.stringify(value)}`
    );
    assert.equal(
      acneTrackingListQuerySchema.safeParse({
        status: "ACTIVE",
        pageSize: value,
      }).success,
      false,
      `pageSize should reject ${JSON.stringify(value)}`
    );
  }
});

test("accepts the largest safe page number but rejects values above it", () => {
  const largestSafePage = acneTrackingListQuerySchema.safeParse({
    status: "ACTIVE",
    page: String(Number.MAX_SAFE_INTEGER),
  });
  assert.equal(largestSafePage.success, true);
  if (largestSafePage.success) {
    assert.equal(largestSafePage.data.page, Number.MAX_SAFE_INTEGER);
  }

  assert.equal(
    acneTrackingListQuerySchema.safeParse({
      status: "ACTIVE",
      page: String(BigInt(Number.MAX_SAFE_INTEGER) + 1n),
    }).success,
    false
  );
  assert.equal(
    acneTrackingListQuerySchema.safeParse({
      status: "ACTIVE",
      pageSize: String(BigInt(Number.MAX_SAFE_INTEGER) + 1n),
    }).success,
    false
  );
});

test("enforces the maximum pageSize of 50", () => {
  const maxPageSize = acneTrackingListQuerySchema.safeParse({
    status: "ACTIVE",
    pageSize: "50",
  });
  assert.equal(maxPageSize.success, true);
  if (maxPageSize.success) {
    assert.equal(maxPageSize.data.pageSize, 50);
  }

  assert.equal(
    acneTrackingListQuerySchema.safeParse({
      status: "ACTIVE",
      pageSize: "51",
    }).success,
    false
  );
});

test("rejects query parameters not declared by the schema", () => {
  assert.equal(
    acneTrackingListQuerySchema.safeParse({
      status: "ACTIVE",
      userId: "another-user",
    }).success,
    false
  );
});

test("validates the complete metadata update and rejects unrelated fields", () => {
  const validInput = {
    name: "  Jerawat pipi kiri ",
    location: "left_cheek",
    startedAt: "2026-10-20",
  };
  const parsed = acneTrackingMetadataSchema.safeParse(validInput);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.name, "Jerawat pipi kiri");
    assert.equal(parsed.data.startedAt, validInput.startedAt);
  }

  for (const invalidInput of [
    { ...validInput, name: "   " },
    { ...validInput, location: "neck" },
    { ...validInput, startedAt: "2026-02-30" },
    { ...validInput, status: "HEALED" },
    { ...validInput, healedDate: "2026-10-22" },
    { ...validInput, photoPublicId: "private-id" },
    { ...validInput, markerX: 0.5 },
    { name: validInput.name, location: validInput.location },
  ]) {
    assert.equal(acneTrackingMetadataSchema.safeParse(invalidInput).success, false);
  }
});
