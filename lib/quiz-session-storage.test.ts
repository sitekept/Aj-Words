import test from "node:test";
import assert from "node:assert/strict";
import { readQuizSession, writeQuizSession } from "./quiz-session-storage.ts";
import type { QuizSessionState } from "../types/vocabulary.ts";

// quiz-session-storage guards every access on `typeof window`, so give the
// node test runner an in-memory localStorage before exercising it.
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

const STORAGE_KEY = "ajwords.v1.quizSessions";

const baseSession: QuizSessionState = {
  attempts: [],
  feedback: null,
  index: 0,
  listId: "list-1",
  mode: "written",
  questions: [{ itemId: "item-1", type: "written" }],
  selectedAnswer: "",
  typedAnswer: "",
  updatedAt: "2026-07-20T00:00:00.000Z"
};

const seed = (session: Record<string, unknown>) => {
  entries.clear();
  entries.set(STORAGE_KEY, JSON.stringify({ "list-1:written": session }));
};

test("sessions saved before the direction field resume as forward", () => {
  seed({ ...baseSession });
  const session = readQuizSession("list-1", "written");
  assert.ok(session);
  assert.equal(session.direction, "forward");
});

test("a stored reverse direction is preserved", () => {
  seed({ ...baseSession, direction: "reverse" });
  assert.equal(readQuizSession("list-1", "written")?.direction, "reverse");
});

test("invalid direction values normalize to forward", () => {
  seed({ ...baseSession, direction: "backwards" });
  assert.equal(readQuizSession("list-1", "written")?.direction, "forward");

  seed({ ...baseSession, direction: 7 });
  assert.equal(readQuizSession("list-1", "written")?.direction, "forward");
});

test("writeQuizSession round-trips the direction", () => {
  entries.clear();
  writeQuizSession({ ...baseSession, direction: "reverse" });
  assert.equal(readQuizSession("list-1", "written")?.direction, "reverse");
});
