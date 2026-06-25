import test from "node:test";
import assert from "node:assert/strict";
import { QUIZ_MODES, isQuizMode, normalizeQuizMode } from "./quiz-modes.ts";

test("recognizes every supported quiz mode, including review-due", () => {
  assert.deepEqual(QUIZ_MODES, [
    "written",
    "choice",
    "mixed",
    "test",
    "full-review",
    "review-due"
  ]);

  assert.equal(isQuizMode("review-due"), true);
  assert.equal(normalizeQuizMode("review-due"), "review-due");
});

test("normalizes unknown quiz modes to the requested fallback", () => {
  assert.equal(isQuizMode("daily"), false);
  assert.equal(normalizeQuizMode("daily"), "test");
  assert.equal(normalizeQuizMode("daily", "written"), "written");
});
