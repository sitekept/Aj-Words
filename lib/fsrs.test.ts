import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  intervalDays,
  MAX_STABILITY,
  nextState,
  DEFAULT_REQUEST_RETENTION,
  type FsrsState
} from "./fsrs.ts";

test("initial state grows stability and lowers difficulty with grade", () => {
  const again = initialState(1);
  const good = initialState(3);
  const easy = initialState(4);

  // Higher grade → more stable first interval.
  assert.ok(again.stability < good.stability);
  assert.ok(good.stability < easy.stability);
  // Higher grade → easier card.
  assert.ok(good.difficulty < again.difficulty);
  assert.ok(easy.difficulty < good.difficulty);
});

test("difficulty always stays within [1, 10]", () => {
  let state: FsrsState | null = null;
  const grades = [1, 4, 1, 1, 4, 3, 2, 1, 4] as const;
  for (const grade of grades) {
    state = nextState(state, grade, 5);
    assert.ok(state.difficulty >= 1, `difficulty ${state.difficulty} >= 1`);
    assert.ok(state.difficulty <= 10, `difficulty ${state.difficulty} <= 10`);
    assert.ok(state.stability > 0);
  }
});

test("a Good review after elapsed time increases stability", () => {
  const start = initialState(3);
  // Review roughly when due (elapsed ≈ current interval), so R < 1.
  const elapsed = intervalDays(start.stability);
  const after = nextState(start, 3, elapsed);
  assert.ok(
    after.stability > start.stability,
    `expected growth, got ${after.stability} <= ${start.stability}`
  );
});

test("an Again review never increases stability", () => {
  const start = nextState(initialState(3), 3, 10); // build up some stability
  const lapsed = nextState(start, 1, 10);
  assert.ok(lapsed.stability <= start.stability);
});

test("interval is monotonic in stability and at least 1 day", () => {
  assert.ok(intervalDays(0.01) >= 1);
  assert.ok(intervalDays(10) < intervalDays(50));
  assert.ok(intervalDays(50) < intervalDays(200));
});

test("interval at stability S equals ~S for 0.9 retention", () => {
  // Stability is defined as days for recall to fall to the request retention,
  // so the interval at the default retention should be ≈ S.
  const s = 42;
  const days = intervalDays(s, DEFAULT_REQUEST_RETENTION);
  assert.ok(Math.abs(days - s) <= 1, `interval ${days} not ≈ ${s}`);
});

test("is deterministic for the same inputs", () => {
  const a = nextState({ stability: 12, difficulty: 5 }, 3, 8);
  const b = nextState({ stability: 12, difficulty: 5 }, 3, 8);
  assert.deepEqual(a, b);
});

// Stability is persisted on the card, so it can arrive from an imported file
// or a share link rather than from this module's own math. Unbounded, a
// hostile value made intervalDays() return Infinity and the caller's
// `new Date(now + interval * DAY_MS).toISOString()` throw a RangeError.
test("intervalDays stays finite for an absurd stored stability", () => {
  const days = intervalDays(1e308);

  assert.ok(Number.isFinite(days), "interval must stay finite");
  assert.ok(days <= MAX_STABILITY);

  const dueMs = Date.UTC(2026, 6, 21) + days * 24 * 60 * 60 * 1000;
  assert.ok(Number.isFinite(dueMs));
  // The call that used to throw.
  assert.doesNotThrow(() => new Date(dueMs).toISOString());
});

test("intervalDays survives non-finite stability", () => {
  for (const value of [Infinity, -Infinity, NaN]) {
    const days = intervalDays(value);
    assert.ok(Number.isFinite(days), `interval must stay finite for ${value}`);
    assert.ok(days >= 1);
  }
});

test("nextState never returns a stability past the ceiling", () => {
  const absurd: FsrsState = { stability: 1e308, difficulty: 5 };
  const next = nextState(absurd, 4, 0);

  assert.ok(Number.isFinite(next.stability));
  assert.ok(next.stability <= MAX_STABILITY);
});
