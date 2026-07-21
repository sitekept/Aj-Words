import test from "node:test";
import assert from "node:assert/strict";

// activity-log guards every access on `typeof window`, so give the node test
// runner an in-memory localStorage before importing the module.
const entries = new Map<string, string>();

(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (key: string) => (entries.has(key) ? (entries.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    }
  }
};

const {
  readActivityLog,
  recordActivity,
  readTodayCount,
  toDateKey
} = await import("./activity-log.ts");

const STORAGE_KEY = "ajwords.v1.activityLog";
const reset = () => entries.clear();

test("records reviews on the local calendar day", () => {
  reset();
  const now = "2026-07-21T10:00:00.000Z";
  recordActivity(1, now);
  recordActivity(2, now);

  const key = toDateKey(now);
  assert.equal(readActivityLog()[key].reviews, 3);
  assert.equal(readTodayCount(now), 3);
});

test("undo decrements but never goes below zero", () => {
  reset();
  const now = "2026-07-21T10:00:00.000Z";
  recordActivity(1, now);
  recordActivity(-1, now);
  recordActivity(-1, now);

  const key = toDateKey(now);
  assert.equal(readActivityLog()[key], undefined); // empty day dropped
  assert.equal(readTodayCount(now), 0);
});

test("keeps separate counts per day", () => {
  reset();
  recordActivity(3, "2026-07-20T10:00:00.000Z");
  recordActivity(5, "2026-07-21T10:00:00.000Z");

  const log = readActivityLog();
  assert.equal(log["2026-07-20"].reviews, 3);
  assert.equal(log["2026-07-21"].reviews, 5);
});

test("prunes days older than the retention window on write", () => {
  reset();
  // Seed a very old day directly, then write a fresh one.
  entries.set(STORAGE_KEY, JSON.stringify({ "2020-01-01": { reviews: 9 } }));
  recordActivity(1, "2026-07-21T10:00:00.000Z");

  const log = readActivityLog();
  assert.equal(log["2020-01-01"], undefined);
  assert.equal(log["2026-07-21"].reviews, 1);
});

test("ignores malformed stored entries", () => {
  reset();
  entries.set(
    STORAGE_KEY,
    JSON.stringify({ "2026-07-21": { reviews: "nope" }, bad: 5 })
  );
  assert.deepEqual(readActivityLog(), {});
});

test("no-ops on a zero or non-finite delta", () => {
  reset();
  recordActivity(0, "2026-07-21T10:00:00.000Z");
  recordActivity(Number.NaN, "2026-07-21T10:00:00.000Z");
  assert.deepEqual(readActivityLog(), {});
});
