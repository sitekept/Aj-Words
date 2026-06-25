import test from "node:test";
import assert from "node:assert/strict";
import {
  DAILY_REVIEW_LIMIT,
  limitDailyReviewItems
} from "./daily-review.ts";

test("limits daily review sessions to a manageable default", () => {
  const items = Array.from({ length: DAILY_REVIEW_LIMIT + 12 }, (_, index) => ({
    id: `item-${index + 1}`
  }));

  const result = limitDailyReviewItems(items);

  assert.equal(result.length, DAILY_REVIEW_LIMIT);
  assert.deepEqual(
    result.map((item) => item.id),
    items.slice(0, DAILY_REVIEW_LIMIT).map((item) => item.id)
  );
});

test("allows a custom review limit for focused tests and future UI controls", () => {
  const items = [{ id: "one" }, { id: "two" }, { id: "three" }];

  assert.deepEqual(limitDailyReviewItems(items, 2), [
    { id: "one" },
    { id: "two" }
  ]);
  assert.deepEqual(limitDailyReviewItems(items, 0), []);
});
