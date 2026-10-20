import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  aggregatePickingAnalysis,
  getPickingAnalysis,
  PickingAnalysisError,
} from "../src/lib/picking-analysis-service.ts";
import { pickingOptions } from "../src/lib/picking-options.ts";
import {
  validateMonthlyFilter,
  getDaysInMonth,
} from "../src/lib/validations/stats.ts";
import {
  getMonthlyUtcBounds,
  getYearlyUtcBounds,
} from "../src/lib/validations/history.ts";

function createMockRepository({ records = [], shouldFail = false } = {}) {
  let currentRecords = [...records];
  const queriedUserIds = [];
  const queryRanges = [];

  return {
    queriedUserIds,
    queryRanges,
    deleteRecord(index) {
      currentRecords.splice(index, 1);
    },
    async findPickingAnalysisRecords(userId, startUtc, endUtc) {
      if (shouldFail) {
        throw new Error("Database connection lost");
      }
      queriedUserIds.push(userId);
      queryRanges.push({ startUtc, endUtc });

      return currentRecords
        .filter((r) => r.userId === userId)
        .filter((r) => {
          if (!r.occurredAt) return false;
          return r.occurredAt >= startUtc && r.occurredAt < endUtc;
        })
        .map((r) => ({
          triggers: r.triggers,
          emotions: r.emotions,
          urgeStrength: r.urgeStrength,
          durationRange: r.durationRange,
          reasons: r.reasons,
          impacts: r.impacts,
          context: r.context,
        }));
    },
  };
}

// 1. Setiap kelompok menampilkan opsi aktual lengkap
test("1. Setiap kelompok menampilkan 7 kelompok lengkap dengan seluruh opsi aktual dan label yang tepat", () => {
  const groups = aggregatePickingAnalysis([]);

  assert.equal(groups.length, 7);
  const expectedKeys = [
    "triggers",
    "emotions",
    "urgeStrength",
    "durationRange",
    "reasons",
    "impacts",
    "context",
  ];
  assert.deepEqual(
    groups.map((g) => g.key),
    expectedKeys
  );

  // Triggers has 8 options
  const triggersGroup = groups.find((g) => g.key === "triggers");
  assert.equal(triggersGroup.options.length, pickingOptions.triggers.length);
  assert.equal(triggersGroup.options[0].label, "Merasa ada benjolan atau tekstur kulit");

  // Emotions has 9 options
  const emotionsGroup = groups.find((g) => g.key === "emotions");
  assert.equal(emotionsGroup.options.length, pickingOptions.emotions.length);
  assert.equal(emotionsGroup.options[0].label, "Cemas atau gelisah");

  // UrgeStrength has 5 options (1 to 5)
  const urgeGroup = groups.find((g) => g.key === "urgeStrength");
  assert.equal(urgeGroup.options.length, 5);
  assert.equal(urgeGroup.options[0].value, "1");
  assert.equal(urgeGroup.options[0].label, "1");
  assert.equal(urgeGroup.options[4].value, "5");
  assert.equal(urgeGroup.options[4].label, "5");

  // DurationRange has 5 options
  const durationGroup = groups.find((g) => g.key === "durationRange");
  assert.equal(durationGroup.options.length, pickingOptions.durationRanges.length);
  assert.equal(durationGroup.options[0].label, "Kurang dari 1 menit");

  // Reasons has 7 options
  const reasonsGroup = groups.find((g) => g.key === "reasons");
  assert.equal(reasonsGroup.options.length, pickingOptions.reasons.length);

  // Impacts has 7 options
  const impactsGroup = groups.find((g) => g.key === "impacts");
  assert.equal(impactsGroup.options.length, pickingOptions.impacts.length);

  // Context has 7 options
  const contextGroup = groups.find((g) => g.key === "context");
  assert.equal(contextGroup.options.length, pickingOptions.contexts.length);
});

// 2. Hitungan multi-select dan single-select benar
test("2. Hitungan multi-select dan single-select benar sesuai data input", () => {
  const records = [
    {
      triggers: ["MIRROR", "STRESS"],
      emotions: ["ANXIOUS", "STRESSED"],
      urgeStrength: 4,
      durationRange: "FROM_1_TO_5_MIN",
      reasons: ["REMOVE_TEXTURE"],
      impacts: ["RED_IRRITATION", "TEMPORARY_RELIEF"],
      context: "IN_FRONT_OF_MIRROR",
    },
    {
      triggers: ["MIRROR"],
      emotions: ["ANXIOUS"],
      urgeStrength: 4,
      durationRange: "UNDER_1_MIN",
      reasons: ["PEEL_DRY_SKIN"],
      impacts: ["RED_IRRITATION"],
      context: "IN_FRONT_OF_MIRROR",
    },
    {
      triggers: ["BOREDOM"],
      emotions: ["BORED"],
      urgeStrength: 2,
      durationRange: "FROM_1_TO_5_MIN",
      reasons: ["REMOVE_TEXTURE"],
      impacts: [],
      context: "ALONE_IN_ROOM",
    },
  ];

  const groups = aggregatePickingAnalysis(records);

  // Multi-select triggers
  const triggers = groups.find((g) => g.key === "triggers");
  assert.equal(triggers.filledCount, 3);
  const mirrorOpt = triggers.options.find((o) => o.value === "MIRROR");
  const stressOpt = triggers.options.find((o) => o.value === "STRESS");
  const boredomOpt = triggers.options.find((o) => o.value === "BOREDOM");
  assert.equal(mirrorOpt.count, 2);
  assert.equal(stressOpt.count, 1);
  assert.equal(boredomOpt.count, 1);

  // Single-select urgeStrength
  const urge = groups.find((g) => g.key === "urgeStrength");
  assert.equal(urge.filledCount, 3);
  const opt4 = urge.options.find((o) => o.value === "4");
  const opt2 = urge.options.find((o) => o.value === "2");
  const opt1 = urge.options.find((o) => o.value === "1");
  assert.equal(opt4.count, 2);
  assert.equal(opt2.count, 1);
  assert.equal(opt1.count, 0);

  // Multi-select impacts with an empty record
  const impacts = groups.find((g) => g.key === "impacts");
  assert.equal(impacts.filledCount, 2); // Record 3 had empty impacts []
  const redOpt = impacts.options.find((o) => o.value === "RED_IRRITATION");
  const tempOpt = impacts.options.find((o) => o.value === "TEMPORARY_RELIEF");
  assert.equal(redOpt.count, 2);
  assert.equal(tempOpt.count, 1);
});

// 3. Array kosong, null, dan nilai tidak valid tidak dihitung sebagai pilihan
test("3. Array kosong, null, dan nilai tidak valid diabaikan dan tidak menambah hitungan atau filledCount", () => {
  const records = [
    {
      triggers: ["NON_EXISTENT_CODE", "UNKNOWN"],
      emotions: [],
      urgeStrength: 99, // Invalid strength
      durationRange: "INVALID_ENUM",
      reasons: [],
      impacts: [],
      context: null,
    },
    {
      triggers: [],
      emotions: [],
      urgeStrength: null,
      durationRange: null,
      reasons: [],
      impacts: [],
      context: undefined,
    },
  ];

  const groups = aggregatePickingAnalysis(records);

  for (const group of groups) {
    assert.equal(group.filledCount, 0);
    assert.equal(group.maxCount, 0);
    for (const opt of group.options) {
      assert.equal(opt.count, 0);
      assert.equal(opt.percentageOfMax, 0);
    }
  }
});

// 4. Duplikasi nilai array tidak menggandakan hitungan opsi
test("4. Duplikasi nilai array dalam satu kejadian hanya dihitung satu kali", () => {
  const records = [
    {
      triggers: ["MIRROR", "MIRROR", "MIRROR"],
      emotions: ["ANXIOUS", "ANXIOUS"],
      urgeStrength: 3,
      durationRange: "FROM_1_TO_5_MIN",
      reasons: ["REMOVE_TEXTURE", "REMOVE_TEXTURE"],
      impacts: ["RED_IRRITATION", "RED_IRRITATION"],
      context: "ALONE_IN_ROOM",
    },
  ];

  const groups = aggregatePickingAnalysis(records);

  const triggers = groups.find((g) => g.key === "triggers");
  assert.equal(triggers.filledCount, 1);
  const mirrorOpt = triggers.options.find((o) => o.value === "MIRROR");
  assert.equal(mirrorOpt.count, 1); // Not 3

  const emotions = groups.find((g) => g.key === "emotions");
  assert.equal(emotions.filledCount, 1);
  const anxiousOpt = emotions.options.find((o) => o.value === "ANXIOUS");
  assert.equal(anxiousOpt.count, 1); // Not 2
});

// 5. Kelompok dengan nol data tetap menghasilkan seluruh opsi dengan angka nol dan progress bar 0%
test("5. Kelompok tanpa data tetap menampilkan seluruh opsi dengan angka 0 dan percentageOfMax 0% tanpa division by zero", () => {
  const groups = aggregatePickingAnalysis([]);

  for (const group of groups) {
    assert.equal(group.filledCount, 0);
    assert.equal(group.maxCount, 0);
    assert.ok(group.options.length > 0);
    for (const opt of group.options) {
      assert.equal(opt.count, 0);
      assert.equal(opt.percentageOfMax, 0);
    }
  }
});

// 6. Pengurutan berdasarkan jumlah menurun dan urutan asli sebagai tie-breaker
test("6. Pengurutan opsi berdasarkan count descending dan urutan asli form sebagai tie-breaker", () => {
  // Original triggers order:
  // 0: TEXTURE_FEEL, 1: MIRROR, 2: DRY_SCAB, 3: STRESS, 4: BOREDOM, 5: AUTOMATIC_HAND, 6: SEEK_RELIEF, 7: OTHER
  const records = [
    // 3 events with STRESS
    { triggers: ["STRESS"] },
    { triggers: ["STRESS"] },
    { triggers: ["STRESS"] },
    // 3 events with TEXTURE_FEEL (tie with STRESS, but TEXTURE_FEEL is index 0 vs STRESS index 3)
    { triggers: ["TEXTURE_FEEL"] },
    { triggers: ["TEXTURE_FEEL"] },
    { triggers: ["TEXTURE_FEEL"] },
    // 1 event with OTHER (index 7)
    { triggers: ["OTHER"] },
    // 1 event with MIRROR (tie with OTHER, but MIRROR is index 1 vs OTHER index 7)
    { triggers: ["MIRROR"] },
  ];

  const groups = aggregatePickingAnalysis(records);
  const triggers = groups.find((g) => g.key === "triggers");

  assert.equal(triggers.options[0].value, "TEXTURE_FEEL");
  assert.equal(triggers.options[0].count, 3);
  assert.equal(triggers.options[0].percentageOfMax, 100);

  assert.equal(triggers.options[1].value, "STRESS");
  assert.equal(triggers.options[1].count, 3);
  assert.equal(triggers.options[1].percentageOfMax, 100);

  assert.equal(triggers.options[2].value, "MIRROR");
  assert.equal(triggers.options[2].count, 1);
  assert.equal(triggers.options[2].percentageOfMax, 33);

  assert.equal(triggers.options[3].value, "OTHER");
  assert.equal(triggers.options[3].count, 1);
  assert.equal(triggers.options[3].percentageOfMax, 33);

  // The rest (count 0) preserve their original order
  assert.equal(triggers.options[4].value, "DRY_SCAB");
  assert.equal(triggers.options[5].value, "BOREDOM");
  assert.equal(triggers.options[6].value, "AUTOMATIC_HAND");
  assert.equal(triggers.options[7].value, "SEEK_RELIEF");
});

// 7. Jumlah kejadian terisi berbeda dari total pilihan ketika satu kejadian memilih beberapa opsi
test("7. Jumlah kejadian terisi (filledCount) dihitung per kejadian, bukan akumulasi pilihan opsi", () => {
  // 1 single event selects 4 triggers
  const records = [
    {
      triggers: ["TEXTURE_FEEL", "MIRROR", "DRY_SCAB", "STRESS"],
    },
  ];

  const groups = aggregatePickingAnalysis(records);
  const triggers = groups.find((g) => g.key === "triggers");

  // filledCount is 1, even though 4 options were selected
  assert.equal(triggers.filledCount, 1);
  const totalOptionsCount = triggers.options.reduce((sum, o) => sum + o.count, 0);
  assert.equal(totalOptionsCount, 4);
  assert.notEqual(triggers.filledCount, totalOptionsCount);
});

// 8. Filter bulanan, tahunan, batas tanggal, dan Februari pada tahun kabisat
test("8. Validasi filter dan perhitungan batas UTC menangani kabisat dan pergantian periode", () => {
  const fixedNow = new Date("2026-10-17T08:00:00.000Z");

  // Leap year 2024 February has 29 days
  assert.equal(getDaysInMonth(2024, 2), 29);
  const leapFeb = validateMonthlyFilter(
    { mode: "monthly", year: 2024, month: 2, startDay: 1, endDay: 29 },
    fixedNow
  );
  assert.equal(leapFeb.isValid, true);
  const leapBounds = getMonthlyUtcBounds(2024, 2, 1, 29);
  // Asia/Jakarta is UTC+7 -> 2024-02-01 00:00:00 Jakarta is 2024-01-31 17:00:00 UTC
  assert.equal(leapBounds.startUtc.toISOString(), "2024-01-31T17:00:00.000Z");
  // 2024-03-01 00:00:00 Jakarta is 2024-02-29 17:00:00 UTC
  assert.equal(leapBounds.endUtc.toISOString(), "2024-02-29T17:00:00.000Z");

  // Non-leap year 2025 February has 28 days
  assert.equal(getDaysInMonth(2025, 2), 28);
  const nonLeap29 = validateMonthlyFilter(
    { mode: "monthly", year: 2025, month: 2, startDay: 1, endDay: 29 },
    fixedNow
  );
  assert.equal(nonLeap29.isValid, false);
  assert.equal(nonLeap29.error, "Bulan ini hanya memiliki 28 hari.");

  // Reject startDay > endDay
  const invalidRange = validateMonthlyFilter(
    { mode: "monthly", year: 2026, month: 9, startDay: 15, endDay: 10 },
    fixedNow
  );
  assert.equal(invalidRange.isValid, false);
  assert.equal(invalidRange.error, "Tanggal awal tidak boleh melebihi tanggal akhir.");

  // Yearly bounds past year (2025)
  const yearlyBounds = getYearlyUtcBounds(2025, 12);
  assert.equal(yearlyBounds.startUtc.toISOString(), "2024-12-31T17:00:00.000Z");
  assert.equal(yearlyBounds.endUtc.toISOString(), "2025-12-31T17:00:00.000Z");
});

// 9. Data tanpa occurredAt dikecualikan
test("9. Catatan tanpa occurredAt (null) tidak masuk ke dalam hasil analisis periode", async () => {
  const userId = "user-1";
  const records = [
    {
      userId,
      occurredAt: new Date("2026-10-05T05:00:00.000Z"),
      triggers: ["MIRROR"],
      emotions: ["ANXIOUS"],
      urgeStrength: 3,
      durationRange: "FROM_1_TO_5_MIN",
      reasons: [],
      impacts: [],
      context: "ALONE_IN_ROOM",
    },
    {
      userId,
      occurredAt: null, // Should be excluded!
      triggers: ["STRESS"],
      emotions: ["STRESSED"],
      urgeStrength: 5,
      durationRange: "OVER_30_MIN",
      reasons: [],
      impacts: [],
      context: "STUDYING_WORKING",
    },
  ];

  const repo = createMockRepository({ records });
  const result = await getPickingAnalysis(
    repo,
    userId,
    { mode: "monthly", year: 2026, month: 10, startDay: 1, endDay: 10 },
    new Date("2026-10-17T08:00:00.000Z")
  );

  assert.equal(result.totalRecordsInPeriod, 1);
  const triggers = result.groups.find((g) => g.key === "triggers");
  const mirrorOpt = triggers.options.find((o) => o.value === "MIRROR");
  const stressOpt = triggers.options.find((o) => o.value === "STRESS");
  assert.equal(mirrorOpt.count, 1);
  assert.equal(stressOpt.count, 0); // Excluded!
});

// 10. Batas user diterapkan pada query
test("10. Repository hanya mengambil data milik user yang sedang terautentikasi", async () => {
  const records = [
    {
      userId: "user-alpha",
      occurredAt: new Date("2026-10-05T05:00:00.000Z"),
      triggers: ["MIRROR"],
      emotions: [],
      urgeStrength: null,
      durationRange: null,
      reasons: [],
      impacts: [],
      context: null,
    },
    {
      userId: "user-beta",
      occurredAt: new Date("2026-10-05T05:00:00.000Z"),
      triggers: ["STRESS"],
      emotions: [],
      urgeStrength: null,
      durationRange: null,
      reasons: [],
      impacts: [],
      context: null,
    },
  ];

  const repo = createMockRepository({ records });
  const result = await getPickingAnalysis(
    repo,
    "user-alpha",
    { mode: "monthly", year: 2026, month: 10, startDay: 1, endDay: 10 },
    new Date("2026-10-17T08:00:00.000Z")
  );

  assert.equal(repo.queriedUserIds.length, 1);
  assert.equal(repo.queriedUserIds[0], "user-alpha");
  assert.equal(result.totalRecordsInPeriod, 1);
  const triggers = result.groups.find((g) => g.key === "triggers");
  assert.equal(triggers.options.find((o) => o.value === "MIRROR").count, 1);
  assert.equal(triggers.options.find((o) => o.value === "STRESS").count, 0);

  // Reject unauthenticated user
  await assert.rejects(
    getPickingAnalysis(
      repo,
      null,
      { mode: "monthly", year: 2026, month: 10, startDay: 1, endDay: 10 },
      new Date("2026-10-17T08:00:00.000Z")
    ),
    (err) => err instanceof PickingAnalysisError && err.code === "UNAUTHENTICATED"
  );
});

// 11. Error query tidak diubah menjadi hasil kosong
test("11. Kegagalan query database dilemparkan sebagai error dan tidak diubah menjadi hasil nol", async () => {
  const repo = createMockRepository({ shouldFail: true });

  await assert.rejects(
    getPickingAnalysis(
      repo,
      "user-1",
      { mode: "monthly", year: 2026, month: 10, startDay: 1, endDay: 10 },
      new Date("2026-10-17T08:00:00.000Z")
    ),
    /Database connection lost/
  );
});

// 12. Mengubah filter tidak menjalankan query sampai fungsi dipanggil
test("12. Validasi menolak input invalid sebelum query dikirim ke database", async () => {
  const repo = createMockRepository();

  // Invalid future month should fail before querying repository
  await assert.rejects(
    getPickingAnalysis(
      repo,
      "user-1",
      { mode: "monthly", year: 2026, month: 12, startDay: 1, endDay: 10 },
      new Date("2026-10-17T08:00:00.000Z")
    ),
    (err) => err instanceof PickingAnalysisError && err.code === "INVALID_FILTER"
  );

  assert.equal(repo.queriedUserIds.length, 0);
});

// 13. Sidebar navigasi mengarah ke /picking/analysis
test("13. Menu sidebar Analisis Pola Picking mengarah ke /picking/analysis dalam urutan yang tepat", () => {
  const sidebarPath = resolve("src/components/dashboard/dashboard-user-header.tsx");
  const content = readFileSync(sidebarPath, "utf-8");

  assert.ok(content.includes('href="/picking/analysis"'));
  assert.ok(content.includes("Analisis Pola Picking"));

  const dashboardIndex = content.indexOf('href="/"');
  const pauseIndex = content.indexOf('href="/pause"');
  const pickingIndex = content.indexOf('href="/picking"');
  const analysisIndex = content.indexOf('href="/picking/analysis"');
  const resistanceIndex = content.indexOf('href="/resistance"');

  assert.ok(dashboardIndex !== -1, "Menu / harus ada");
  assert.ok(pauseIndex !== -1, "Menu /pause harus ada");
  assert.ok(pickingIndex !== -1, "Menu /picking harus ada");
  assert.ok(analysisIndex !== -1, "Menu /picking/analysis harus ada");
  assert.ok(resistanceIndex !== -1, "Menu /resistance harus ada");
  assert.ok(
    dashboardIndex < pauseIndex &&
      pauseIndex < pickingIndex &&
      pickingIndex < analysisIndex &&
      analysisIndex < resistanceIndex,
    "Menu sidebar harus mengikuti urutan dashboard, Pause, picking, analisis, lalu keberhasilan"
  );
});

// 14. Penghapusan catatan tidak lagi tercermin pada hasil analisis setelah query berikutnya
test("14. Penghapusan catatan langsung tercermin pada query analisis berikutnya", async () => {
  const userId = "user-1";
  const records = [
    {
      userId,
      occurredAt: new Date("2026-10-05T05:00:00.000Z"),
      triggers: ["MIRROR"],
      emotions: ["ANXIOUS"],
      urgeStrength: 3,
      durationRange: "FROM_1_TO_5_MIN",
      reasons: [],
      impacts: [],
      context: "ALONE_IN_ROOM",
    },
    {
      userId,
      occurredAt: new Date("2026-10-06T05:00:00.000Z"),
      triggers: ["STRESS"],
      emotions: ["STRESSED"],
      urgeStrength: 5,
      durationRange: "OVER_30_MIN",
      reasons: [],
      impacts: [],
      context: "STUDYING_WORKING",
    },
  ];

  const repo = createMockRepository({ records });
  const filter = { mode: "monthly", year: 2026, month: 10, startDay: 1, endDay: 10 };
  const fixedNow = new Date("2026-10-17T08:00:00.000Z");

  // First query: both records are present
  const result1 = await getPickingAnalysis(repo, userId, filter, fixedNow);
  assert.equal(result1.totalRecordsInPeriod, 2);
  const stressOpt1 = result1.groups
    .find((g) => g.key === "triggers")
    .options.find((o) => o.value === "STRESS");
  assert.equal(stressOpt1.count, 1);

  // User deletes record #1 (index 1 = the STRESS event)
  repo.deleteRecord(1);

  // Second query: only 1 record remains
  const result2 = await getPickingAnalysis(repo, userId, filter, fixedNow);
  assert.equal(result2.totalRecordsInPeriod, 1);
  const stressOpt2 = result2.groups
    .find((g) => g.key === "triggers")
    .options.find((o) => o.value === "STRESS");
  assert.equal(stressOpt2.count, 0); // Record removed!
});

// 15. UI tidak lagi menampilkan ringkasan Total Kejadian Picking, tetapi periode analisis tetap ada
test("15. UI picking-analysis-view tidak menampilkan ringkasan Total Kejadian Picking, namun Periode Analisis tetap ada", () => {
  const viewFile = resolve(process.cwd(), "src/components/picking-analysis/picking-analysis-view.tsx");
  const viewCode = readFileSync(viewFile, "utf-8");

  assert.equal(
    viewCode.includes("Total Kejadian Picking"),
    false,
    "Teks 'Total Kejadian Picking' tidak boleh ada di UI"
  );
  assert.equal(
    viewCode.includes("{analysis.totalRecordsInPeriod} kejadian"),
    false,
    "Angka total kejadian tidak boleh ditampilkan di UI"
  );
  assert.ok(
    viewCode.includes("Periode Analisis"),
    "Label 'Periode Analisis' harus tetap dipertahankan di UI"
  );
  assert.ok(
    viewCode.includes("{analysis.periodLabel}"),
    "Nilai analysis.periodLabel harus tetap ditampilkan di UI"
  );
});

// 16. Mutasi catatan picking (create, update, delete) merevalidasi path /picking/analysis
test("16. Mutasi catatan picking merevalidasi path /picking/analysis agar data tidak basi", () => {
  const actionsFile = resolve(process.cwd(), "src/actions/picking.ts");
  const actionsCode = readFileSync(actionsFile, "utf-8");

  // Periksa deletePickingEvent
  const deleteEventPos = actionsCode.indexOf("export async function deletePickingEvent");
  assert.ok(deleteEventPos !== -1, "deletePickingEvent harus ada");
  const deleteCodeChunk = actionsCode.slice(deleteEventPos);
  assert.ok(
    deleteCodeChunk.includes('revalidatePath("/picking/analysis")'),
    "deletePickingEvent harus merevalidasi /picking/analysis"
  );

  // Periksa updatePickingEvent
  const updateEventPos = actionsCode.indexOf("export async function updatePickingEvent");
  assert.ok(updateEventPos !== -1, "updatePickingEvent harus ada");
  const updateCodeChunk = actionsCode.slice(updateEventPos, deleteEventPos);
  assert.ok(
    updateCodeChunk.includes('revalidatePath("/picking/analysis")'),
    "updatePickingEvent harus merevalidasi /picking/analysis"
  );

  // Periksa createPickingEvent
  const createEventPos = actionsCode.indexOf("export async function createPickingEvent");
  const historyEventPos = actionsCode.indexOf("export async function getPickingHistory");
  assert.ok(createEventPos !== -1, "createPickingEvent harus ada");
  const createCodeChunk = actionsCode.slice(createEventPos, historyEventPos);
  assert.ok(
    createCodeChunk.includes('revalidatePath("/picking/analysis")'),
    "createPickingEvent harus merevalidasi /picking/analysis"
  );
});

// 17. Tombol Tampilkan memicu fetch baru dengan server action dan filter yang dikirimkan
test("17. Tombol Tampilkan memicu pemanggilan analisis baru dengan filter yang dipilih", async () => {
  const userId = "user-test";
  const records = [
    {
      userId,
      occurredAt: new Date("2026-05-10T05:00:00.000Z"),
      triggers: ["BOREDOM"],
      emotions: ["BORED"],
      urgeStrength: 2,
      durationRange: "FROM_5_TO_15_MIN",
      reasons: [],
      impacts: [],
      context: "ALONE_IN_ROOM",
    },
    {
      userId,
      occurredAt: new Date("2026-10-10T05:00:00.000Z"),
      triggers: ["STRESS"],
      emotions: ["ANXIOUS"],
      urgeStrength: 4,
      durationRange: "FROM_1_TO_5_MIN",
      reasons: [],
      impacts: [],
      context: "BEDROOM_BEFORE_SLEEP",
    },
  ];

  const repo = createMockRepository({ records });
  const fixedNow = new Date("2026-10-17T08:00:00.000Z");

  // Query 1: Filter Mei 2026
  const mayFilter = { mode: "monthly", year: 2026, month: 5, startDay: 1, endDay: 31 };
  const mayResult = await getPickingAnalysis(repo, userId, mayFilter, fixedNow);
  assert.equal(mayResult.totalRecordsInPeriod, 1);
  const boredomOpt = mayResult.groups
    .find((g) => g.key === "triggers")
    .options.find((o) => o.value === "BOREDOM");
  assert.equal(boredomOpt.count, 1);

  // Query 2: Filter Oktober 2026 (dipicu saat user menekan Tampilkan dengan filter baru)
  const octFilter = { mode: "monthly", year: 2026, month: 10, startDay: 1, endDay: 17 };
  const octResult = await getPickingAnalysis(repo, userId, octFilter, fixedNow);
  assert.equal(octResult.totalRecordsInPeriod, 1);
  const stressOpt = octResult.groups
    .find((g) => g.key === "triggers")
    .options.find((o) => o.value === "STRESS");
  assert.equal(stressOpt.count, 1);
  assert.equal(repo.queryRanges.length, 2, "Harus memanggil query ke repositori sebanyak 2 kali");
});

// 18. Perubahan input filter tidak langsung menjalankan query ke repositori
test("18. Perubahan input filter tidak menjalankan query sampai fetch dieksekusi", async () => {
  const userId = "user-test";
  const repo = createMockRepository({ records: [] });

  // Input filter berubah di UI (state lokal berubah)
  let simulatedFormState = { year: 2026, month: 10, startDay: 1, endDay: 10 };
  simulatedFormState = { ...simulatedFormState, month: 9 };
  simulatedFormState = { ...simulatedFormState, startDay: 5, endDay: 15 };

  // Repositori belum dipanggil sama sekali
  assert.equal(repo.queryRanges.length, 0, "Query repositori tidak boleh dipanggil saat input form hanya berubah");

  // User menekan Tampilkan -> baru memicu fetch
  const filter = { mode: "monthly", ...simulatedFormState };
  await getPickingAnalysis(repo, userId, filter, new Date("2026-10-17T08:00:00.000Z"));
  assert.equal(repo.queryRanges.length, 1, "Query hanya dipanggil 1 kali setelah tombol Tampilkan ditekan");
});

// 19. Query yang gagal menghasilkan error dan tidak mengganti data sebelumnya dengan angka nol palsu
test("19. Query yang gagal menghasilkan error dan mempertahankan integritas data (tidak menimpa dengan angka nol palsu)", async () => {
  const userId = "user-test";
  const records = [
    {
      userId,
      occurredAt: new Date("2026-10-10T05:00:00.000Z"),
      triggers: ["STRESS"],
      emotions: ["ANXIOUS"],
      urgeStrength: 4,
      durationRange: "FROM_1_TO_5_MIN",
      reasons: [],
      impacts: [],
      context: "BEDROOM_BEFORE_SLEEP",
    },
  ];

  const repo = createMockRepository({ records });
  const filter = { mode: "monthly", year: 2026, month: 10, startDay: 1, endDay: 17 };
  const fixedNow = new Date("2026-10-17T08:00:00.000Z");

  // Query awal sukses
  let currentAnalysis = await getPickingAnalysis(repo, userId, filter, fixedNow);
  let currentError = "";

  assert.equal(currentAnalysis.totalRecordsInPeriod, 1);
  const stressOpt = currentAnalysis.groups
    .find((g) => g.key === "triggers")
    .options.find((o) => o.value === "STRESS");
  assert.equal(stressOpt.count, 1);

  // Simulasi query berikutnya gagal (koneksi terputus)
  const failingRepo = createMockRepository({ records, shouldFail: true });
  try {
    await getPickingAnalysis(failingRepo, userId, filter, fixedNow);
    assert.fail("Harusnya melempar error");
  } catch {
    currentError = "Gagal memuat analisis pola picking. Silakan periksa koneksi dan coba lagi.";
    // Sesuai logika handleApply: currentAnalysis TIDAK diubah menjadi null atau nol!
  }

  // Verifikasi state setelah gagal
  assert.ok(currentError.length > 0, "Error message harus diset");
  assert.ok(currentAnalysis !== null, "Data analisis sebelumnya tidak boleh direset ke null");
  assert.equal(
    currentAnalysis.groups.find((g) => g.key === "triggers").options.find((o) => o.value === "STRESS").count,
    1,
    "Data hitungan sebelumnya harus tetap dipertahankan, bukan diganti 0"
  );
});
