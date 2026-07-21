import test from "node:test";
import assert from "node:assert/strict";
import {
  activityHeatmap,
  activityStreak,
  dueByDay,
  hardestWords,
  sessionSuccessSeries
} from "./stats.ts";
import type { ActivityLog } from "./activity-log.ts";
import type { TestHistoryEntry, VocabularyItem } from "../types/vocabulary.ts";

const NOW = "2026-06-07T12:00:00.000Z";
const plusDays = (iso: string, days: number) =>
  new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();

const makeEntry = (overrides: Partial<TestHistoryEntry>): TestHistoryEntry => ({
  id: "entry",
  mode: "test",
  attempts: [],
  correctCount: 0,
  total: 10,
  score: 0,
  createdAt: NOW,
  ...overrides
});

const makeItem = (overrides: Partial<VocabularyItem>): VocabularyItem => ({
  id: "item",
  word: "word",
  translation: "translation",
  status: "learning",
  attempts: 1,
  correctCount: 1,
  wrongCount: 0,
  correctStreak: 1,
  wrongStreak: 0,
  box: 1,
  dueAt: NOW,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides
});

test("sessionSuccessSeries flips newest-first storage into chronological order", () => {
  // Stored order: newest first, exactly as the store prepends entries.
  const entries = [
    makeEntry({ id: "c", score: 90, total: 10, createdAt: plusDays(NOW, 2) }),
    makeEntry({ id: "b", score: 70, total: 8, createdAt: plusDays(NOW, 1) }),
    makeEntry({ id: "a", score: 50, total: 6, createdAt: NOW })
  ];

  const series = sessionSuccessSeries(entries);

  assert.deepEqual(series, [
    { id: "a", createdAt: NOW, score: 50, total: 6 },
    { id: "b", createdAt: plusDays(NOW, 1), score: 70, total: 8 },
    { id: "c", createdAt: plusDays(NOW, 2), score: 90, total: 10 }
  ]);
  // The stored array is left untouched.
  assert.equal(entries[0].id, "c");
});

test("sessionSuccessSeries returns an empty series for no history", () => {
  assert.deepEqual(sessionSuccessSeries([]), []);
});

test("hardestWords keeps only tested words that were missed at least once", () => {
  const items = [
    makeItem({ id: "untested", attempts: 0, wrongCount: 0 }),
    makeItem({ id: "always-right", attempts: 4, wrongCount: 0 }),
    makeItem({ id: "missed", attempts: 4, wrongCount: 2 })
  ];

  const hard = hardestWords(items);

  assert.equal(hard.length, 1);
  assert.equal(hard[0].item.id, "missed");
  assert.equal(hard[0].wrongCount, 2);
});

test("hardestWords sorts by wrongCount, then wrongStreak, then stays stable", () => {
  const items = [
    makeItem({ id: "tied-first", attempts: 5, wrongCount: 2, wrongStreak: 0 }),
    makeItem({ id: "streaky", attempts: 5, wrongCount: 2, wrongStreak: 2 }),
    makeItem({ id: "worst", attempts: 6, wrongCount: 5, wrongStreak: 1 }),
    makeItem({ id: "tied-second", attempts: 5, wrongCount: 2, wrongStreak: 0 })
  ];

  assert.deepEqual(
    hardestWords(items).map((entry) => entry.item.id),
    ["worst", "streaky", "tied-first", "tied-second"]
  );
});

test("hardestWords caps the result at the limit", () => {
  const items = Array.from({ length: 8 }, (_, index) =>
    makeItem({ id: `item-${index}`, attempts: 3, wrongCount: index + 1 })
  );

  assert.equal(hardestWords(items).length, 5);
  assert.equal(hardestWords(items, 2).length, 2);
  assert.equal(hardestWords(items, 2)[0].item.id, "item-7");
});

test("dueByDay buckets cards by calendar day across the window", () => {
  const items = [
    makeItem({ id: "today", dueAt: NOW }),
    makeItem({ id: "tomorrow", dueAt: plusDays(NOW, 1) }),
    makeItem({ id: "in-three", dueAt: plusDays(NOW, 3) }),
    makeItem({ id: "in-three-too", dueAt: plusDays(NOW, 3) }),
    makeItem({ id: "beyond-window", dueAt: plusDays(NOW, 10) })
  ];

  const buckets = dueByDay(items, NOW);

  assert.equal(buckets.length, 7);
  assert.equal(buckets[0].label, "Today");
  assert.equal(buckets[1].label, "Tomorrow");
  assert.deepEqual(
    buckets.map((bucket) => bucket.count),
    [1, 1, 0, 2, 0, 0, 0]
  );
  // Bucket keys are local calendar days, strictly increasing.
  for (const bucket of buckets) {
    assert.match(bucket.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(bucket.label.length > 0);
  }
  assert.deepEqual(
    [...buckets.map((bucket) => bucket.date)].sort(),
    buckets.map((bucket) => bucket.date)
  );
});

test("dueByDay folds overdue and invalid due dates into Today", () => {
  const items = [
    makeItem({ id: "overdue", dueAt: plusDays(NOW, -5) }),
    makeItem({ id: "invalid", dueAt: "not-a-date" }),
    makeItem({ id: "missing", dueAt: "" }),
    makeItem({ id: "tomorrow", dueAt: plusDays(NOW, 1) })
  ];

  const buckets = dueByDay(items, NOW);

  assert.equal(buckets[0].count, 3);
  assert.equal(buckets[1].count, 1);
});

test("dueByDay returns empty buckets for empty input and honors the window size", () => {
  const empty = dueByDay([], NOW);
  assert.equal(empty.length, 7);
  assert.deepEqual(
    empty.map((bucket) => bucket.count),
    [0, 0, 0, 0, 0, 0, 0]
  );

  const narrow = dueByDay(
    [makeItem({ id: "later", dueAt: plusDays(NOW, 2) })],
    NOW,
    2
  );
  assert.equal(narrow.length, 2);
  // A card just past the narrow window is dropped, not folded anywhere.
  assert.deepEqual(
    narrow.map((bucket) => bucket.count),
    [0, 0]
  );

  assert.deepEqual(dueByDay([makeItem({ id: "x" })], NOW, 0), []);
});

// Build a local-calendar-day key relative to NOW so tests are timezone-safe.
const dayKey = (offsetDays: number): string => {
  const base = new Date(NOW);
  const local = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offsetDays);
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  return `${local.getFullYear()}-${month}-${day}`;
};

test("activityHeatmap builds a rectangular weeks × 7 grid ending today", () => {
  const log: ActivityLog = {
    [dayKey(0)]: { reviews: 4 },
    [dayKey(-1)]: { reviews: 12 }
  };
  const heat = activityHeatmap(log, NOW, 8);

  assert.equal(heat.weeks.length, 8);
  for (const week of heat.weeks) {
    assert.equal(week.days.length, 7);
  }
  assert.equal(heat.totalReviews, 16);
  assert.equal(heat.maxCount, 12);

  // Today lives in the last column and is in range.
  const lastWeek = heat.weeks[heat.weeks.length - 1];
  const todayCell = lastWeek.days.find((d) => d.date === dayKey(0));
  assert.ok(todayCell);
  assert.equal(todayCell?.count, 4);
  assert.equal(todayCell?.intensity, 2); // 3..5 → intensity 2
  assert.equal(todayCell?.inRange, true);
});

test("activityHeatmap marks future cells out of range", () => {
  const heat = activityHeatmap({}, NOW, 4);
  const future = heat.weeks.flatMap((w) => w.days).filter((d) => !d.inRange);
  // There is at least one padding cell unless today is a Saturday.
  for (const cell of future) {
    assert.equal(cell.date, "");
    assert.equal(cell.count, 0);
  }
});

test("activityStreak counts consecutive active days with forgiveness", () => {
  // Active today, yesterday, two days ago → streak 3.
  const log: ActivityLog = {
    [dayKey(0)]: { reviews: 1 },
    [dayKey(-1)]: { reviews: 2 },
    [dayKey(-2)]: { reviews: 1 }
  };
  assert.equal(activityStreak(log, NOW), 3);
});

test("activityStreak forgives a not-yet-active today", () => {
  // Nothing today, but active yesterday and the day before → streak 2.
  const log: ActivityLog = {
    [dayKey(-1)]: { reviews: 2 },
    [dayKey(-2)]: { reviews: 1 }
  };
  assert.equal(activityStreak(log, NOW), 2);
});

test("activityStreak is zero after a gap", () => {
  const log: ActivityLog = {
    [dayKey(-2)]: { reviews: 1 },
    [dayKey(-3)]: { reviews: 1 }
  };
  // Missed today AND yesterday → streak broken.
  assert.equal(activityStreak(log, NOW), 0);
});
