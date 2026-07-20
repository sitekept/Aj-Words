import test from "node:test";
import assert from "node:assert/strict";
import { QUIZ_MODES, isQuizMode, normalizeQuizMode } from "./quiz-modes.ts";

test("recognizes supported quiz modes and rejects the removed daily review", () => {
  assert.deepEqual(QUIZ_MODES, ["written", "choice", "mixed", "test", "full-review"]);
  assert.equal(isQuizMode("review-due"), false);
  assert.equal(normalizeQuizMode("review-due"), "test");
});

test("normalizes unknown quiz modes to the requested fallback", () => {
  assert.equal(isQuizMode("daily"), false);
  assert.equal(normalizeQuizMode("daily"), "test");
  assert.equal(normalizeQuizMode("daily", "written"), "written");
});
