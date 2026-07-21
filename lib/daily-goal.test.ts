import test from "node:test";
import assert from "node:assert/strict";

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

const { readDailyGoal, writeDailyGoal, DAILY_GOAL_BOUNDS } = await import(
  "./daily-goal.ts"
);

const reset = () => entries.clear();

test("defaults to disabled", () => {
  reset();
  const goal = readDailyGoal();
  assert.equal(goal.enabled, false);
  assert.equal(goal.target, DAILY_GOAL_BOUNDS.default);
});

test("round-trips an enabled goal", () => {
  reset();
  writeDailyGoal({ enabled: true, target: 30 });
  const goal = readDailyGoal();
  assert.equal(goal.enabled, true);
  assert.equal(goal.target, 30);
});

test("clamps the target to bounds", () => {
  reset();
  writeDailyGoal({ enabled: true, target: 9999 });
  assert.equal(readDailyGoal().target, DAILY_GOAL_BOUNDS.max);

  writeDailyGoal({ enabled: true, target: 1 });
  assert.equal(readDailyGoal().target, DAILY_GOAL_BOUNDS.min);
});

test("falls back to defaults on malformed storage", () => {
  reset();
  entries.set("ajwords.v1.dailyGoal", "not json");
  const goal = readDailyGoal();
  assert.equal(goal.enabled, false);
  assert.equal(goal.target, DAILY_GOAL_BOUNDS.default);
});
