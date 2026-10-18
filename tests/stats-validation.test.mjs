import assert from "node:assert/strict";
import test from "node:test";
import {
  getDaysInMonth,
  getJakartaDateParts,
  validateMonthlyFilter,
  validateYearlyFilter,
} from "../src/lib/validations/stats.ts";

test("getDaysInMonth accurately computes days for leap and non-leap years", () => {
  assert.equal(getDaysInMonth(2024, 2), 29); // 2024 is leap
  assert.equal(getDaysInMonth(2025, 2), 28); // 2025 is not leap
  assert.equal(getDaysInMonth(2026, 2), 28); // 2026 is not leap
  assert.equal(getDaysInMonth(2026, 4), 30); // April
  assert.equal(getDaysInMonth(2026, 10), 31); // October
});

test("getJakartaDateParts returns exact Jakarta calendar components", () => {
  // 2026-10-16T17:00:00.000Z in UTC is 2026-10-17T00:00:00 in Jakarta (UTC+7)
  const utcInstant = new Date("2026-10-16T17:00:00.000Z");
  const parts = getJakartaDateParts(utcInstant);
  assert.equal(parts.year, 2026);
  assert.equal(parts.month, 10);
  assert.equal(parts.day, 17);
});

test("monthly validation accepts valid date range in past month", () => {
  const fixedNow = new Date("2026-10-17T04:00:00.000Z"); // 11:00 in Jakarta
  const result = validateMonthlyFilter(
    {
      mode: "monthly",
      year: 2026,
      month: 9, // September
      startDay: 1,
      endDay: 30,
    },
    fixedNow
  );

  assert.equal(result.isValid, true);
  assert.equal(result.data?.effectiveEndDay, 30);
});

test("monthly validation rejects endDay before startDay", () => {
  const fixedNow = new Date("2026-10-17T04:00:00.000Z");
  const result = validateMonthlyFilter(
    {
      mode: "monthly",
      year: 2026,
      month: 10,
      startDay: 15,
      endDay: 10,
    },
    fixedNow
  );

  assert.equal(result.isValid, false);
  assert.equal(
    result.error,
    "Tanggal awal tidak boleh melebihi tanggal akhir."
  );
});

test("monthly validation rejects days exceeding month days", () => {
  const fixedNow = new Date("2026-10-17T04:00:00.000Z");
  const result = validateMonthlyFilter(
    {
      mode: "monthly",
      year: 2026,
      month: 4, // April has 30 days
      startDay: 1,
      endDay: 31,
    },
    fixedNow
  );

  assert.equal(result.isValid, false);
  assert.equal(result.error, "Bulan ini hanya memiliki 30 hari.");
});

test("monthly validation rejects future months and future years", () => {
  const fixedNow = new Date("2026-10-17T04:00:00.000Z"); // Oct 2026
  const futureMonth = validateMonthlyFilter(
    {
      mode: "monthly",
      year: 2026,
      month: 11,
      startDay: 1,
      endDay: 10,
    },
    fixedNow
  );
  assert.equal(futureMonth.isValid, false);
  assert.equal(futureMonth.error, "Bulan tidak boleh berada di masa depan.");

  const futureYear = validateMonthlyFilter(
    {
      mode: "monthly",
      year: 2027,
      month: 1,
      startDay: 1,
      endDay: 10,
    },
    fixedNow
  );
  assert.equal(futureYear.isValid, false);
  assert.equal(futureYear.error, "Tahun tidak boleh berada di masa depan.");
});

test("monthly validation for current month caps effectiveEndDay to today and rejects startDay in future", () => {
  const fixedNow = new Date("2026-10-17T04:00:00.000Z"); // Day 17 in Jakarta
  // Selecting up to day 31 in current month caps effectiveEndDay to 17
  const capped = validateMonthlyFilter(
    {
      mode: "monthly",
      year: 2026,
      month: 10,
      startDay: 1,
      endDay: 31,
    },
    fixedNow
  );
  assert.equal(capped.isValid, true);
  assert.equal(capped.data?.effectiveEndDay, 17);

  // Selecting startDay after today in current month is rejected
  const futureStart = validateMonthlyFilter(
    {
      mode: "monthly",
      year: 2026,
      month: 10,
      startDay: 18,
      endDay: 25,
    },
    fixedNow
  );
  assert.equal(futureStart.isValid, false);
  assert.equal(
    futureStart.error,
    "Tanggal awal tidak boleh melebihi hari ini untuk bulan berjalan."
  );
});

test("yearly validation restricts current year to elapsed months and allows all 12 months for past years", () => {
  const fixedNow = new Date("2026-10-17T04:00:00.000Z"); // Month 10 (October) 2026

  const currentYear = validateYearlyFilter(
    {
      mode: "yearly",
      year: 2026,
    },
    fixedNow
  );
  assert.equal(currentYear.isValid, true);
  assert.equal(currentYear.data?.endMonth, 10);

  const pastYear = validateYearlyFilter(
    {
      mode: "yearly",
      year: 2025,
    },
    fixedNow
  );
  assert.equal(pastYear.isValid, true);
  assert.equal(pastYear.data?.endMonth, 12);

  const futureYear = validateYearlyFilter(
    {
      mode: "yearly",
      year: 2027,
    },
    fixedNow
  );
  assert.equal(futureYear.isValid, false);
  assert.equal(futureYear.error, "Tahun tidak boleh berada di masa depan.");
});
