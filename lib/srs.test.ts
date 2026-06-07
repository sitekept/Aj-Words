import test from "node:test";
import assert from "node:assert/strict";
import {
  LEITNER_INTERVALS,
  MASTERED_BOX,
  MAX_BOX,
  clampBox,
  countDue,
  deriveStatusFromBox,
  getDueItems,
  inferSrsFromLegacy,
  initialSrs,
  isDue,
  scheduleNext
} from "./srs.ts";

const NOW = "2026-06-07T12:00:00.000Z";
const plusDays = (iso: string, days: number) =>
  new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();

test("clampBox keeps the box within [0, MAX_BOX]", () => {
  assert.equal(clampBox(-3), 0);
  assert.equal(clampBox(2), 2);
  assert.equal(clampBox(99), MAX_BOX);
  assert.equal(clampBox(Number.NaN), 0);
  assert.equal(clampBox(2.9), 2);
});

test("scheduleNext promotes one box on a correct answer", () => {
  const result = scheduleNext(0, true, NOW);
  assert.equal(result.box, 1);
  assert.equal(result.dueAt, plusDays(NOW, LEITNER_INTERVALS[1]));
});

test("scheduleNext caps promotion at MAX_BOX", () => {
  const result = scheduleNext(MAX_BOX, true, NOW);
  assert.equal(result.box, MAX_BOX);
  assert.equal(result.dueAt, plusDays(NOW, LEITNER_INTERVALS[MAX_BOX]));
});

test("scheduleNext demotes one box, due now, on a wrong answer", () => {
  const fromMid = scheduleNext(4, false, NOW);
  assert.equal(fromMid.box, 3);
  assert.equal(fromMid.dueAt, NOW);
  // Never below box 0.
  assert.equal(scheduleNext(0, false, NOW).box, 0);
});

test("isDue is true for past/missing dueAt, false for future", () => {
  assert.equal(isDue({ dueAt: plusDays(NOW, -1) }, NOW), true);
  assert.equal(isDue({ dueAt: NOW }, NOW), true);
  assert.equal(isDue({ dueAt: plusDays(NOW, 1) }, NOW), false);
  assert.equal(isDue({ dueAt: "" }, NOW), true);
});

test("getDueItems and countDue select only due cards", () => {
  const items = [
    { dueAt: plusDays(NOW, -2) },
    { dueAt: plusDays(NOW, 5) },
    { dueAt: NOW }
  ] as Parameters<typeof getDueItems>[0];

  assert.equal(countDue(items, NOW), 2);
  assert.equal(getDueItems(items, NOW).length, 2);
});

test("deriveStatusFromBox derives new / learning / mastered", () => {
  assert.equal(deriveStatusFromBox({ box: 0, attempts: 0 }), "new");
  assert.equal(deriveStatusFromBox({ box: 0, attempts: 1 }), "learning");
  assert.equal(
    deriveStatusFromBox({ box: MASTERED_BOX - 1, attempts: 5 }),
    "learning"
  );
  assert.equal(deriveStatusFromBox({ box: MASTERED_BOX, attempts: 5 }), "mastered");
});

test("initialSrs starts a card in box 0, due now", () => {
  assert.deepEqual(initialSrs(NOW), { box: 0, dueAt: NOW });
});

test("inferSrsFromLegacy maps legacy counters onto a box", () => {
  assert.deepEqual(
    inferSrsFromLegacy({ attempts: 0, correctStreak: 0, wrongStreak: 0 }, NOW),
    { box: 0, dueAt: NOW }
  );
  // A current wrong streak forces review regardless of past correct answers.
  assert.deepEqual(
    inferSrsFromLegacy({ attempts: 5, correctStreak: 5, wrongStreak: 1 }, NOW),
    { box: 0, dueAt: NOW }
  );
  assert.equal(
    inferSrsFromLegacy({ attempts: 2, correctStreak: 2, wrongStreak: 0 }, NOW).box,
    2
  );
  assert.equal(
    inferSrsFromLegacy({ attempts: 9, correctStreak: 9, wrongStreak: 0 }, NOW).box,
    MAX_BOX
  );
});

test("MASTERED_BOX consecutive correct answers reach mastery", () => {
  let box = 0;
  let attempts = 0;
  for (let index = 0; index < MASTERED_BOX; index += 1) {
    box = scheduleNext(box, true, NOW).box;
    attempts += 1;
  }
  assert.equal(box, MASTERED_BOX);
  assert.equal(deriveStatusFromBox({ box, attempts }), "mastered");
});
