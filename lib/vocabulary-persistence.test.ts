import test from "node:test";
import assert from "node:assert/strict";
import { createPersistedLists } from "./vocabulary-persistence.ts";

const timestamp = "2026-06-25T10:00:00.000Z";

const createList = (overrides = {}) => ({
  id: "public-list",
  title: "Public list",
  language: "Audit",
  createdAt: timestamp,
  updatedAt: timestamp,
  testHistory: [],
  items: [
    {
      id: "public-list-term-001",
      word: "alpha",
      translation: "one",
      status: "new",
      attempts: 0,
      correctCount: 0,
      wrongCount: 0,
      correctStreak: 0,
      wrongStreak: 0,
      box: 0,
      dueAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    }
  ],
  ...overrides
});

test("does not persist untouched public lists", () => {
  const persisted = createPersistedLists([createList()], (listId) => listId === "public-list");

  assert.deepEqual(persisted, []);
});

test("does not persist unchanged builtin progress as user state", () => {
  const publicList = createList({
    items: [
      {
        ...createList().items[0],
        attempts: 4,
        correctCount: 4,
        correctStreak: 4,
        box: 4,
        status: "learning",
        dueAt: "2026-06-26T10:00:00.000Z"
      }
    ]
  });
  const persisted = createPersistedLists(
    [publicList],
    (listId) => listId === "public-list",
    () => publicList
  );

  assert.deepEqual(persisted, []);
});

test("persists only progress overlays for public lists with user progress", () => {
  const list = createList({
    items: [
      {
        ...createList().items[0],
        attempts: 1,
        correctCount: 1,
        correctStreak: 1,
        box: 1,
        status: "learning",
        dueAt: "2026-06-26T10:00:00.000Z"
      }
    ]
  });
  const persisted = createPersistedLists([list], (listId) => listId === "public-list");

  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].items.length, 1);
  assert.equal(persisted[0].items[0].id, "public-list-term-001");
  assert.equal(persisted[0].items[0].attempts, 1);
  assert.equal("word" in persisted[0].items[0], false);
  assert.equal("translation" in persisted[0].items[0], false);
});

test("persists only changed public progress relative to the builtin baseline", () => {
  const baseline = createList({
    items: [
      {
        ...createList().items[0],
        attempts: 4,
        correctCount: 4,
        correctStreak: 4,
        box: 4,
        status: "learning",
        dueAt: "2026-06-26T10:00:00.000Z"
      },
      {
        ...createList().items[0],
        id: "public-list-term-002",
        attempts: 2,
        correctCount: 1,
        wrongCount: 1,
        box: 1,
        status: "learning",
        dueAt: "2026-06-25T10:00:00.000Z"
      }
    ]
  });
  const changed = {
    ...baseline,
    items: [
      baseline.items[0],
      {
        ...baseline.items[1],
        attempts: 3,
        wrongCount: 2,
        box: 0,
        dueAt: "2026-06-25T11:00:00.000Z"
      }
    ]
  };
  const persisted = createPersistedLists(
    [changed],
    (listId) => listId === "public-list",
    () => baseline
  );

  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].items.length, 1);
  assert.equal(persisted[0].items[0].id, "public-list-term-002");
  assert.equal(persisted[0].items[0].attempts, 3);
});

test("persists local lists with their full editable content", () => {
  const local = createList({ id: "local-list", title: "Local list" });
  const persisted = createPersistedLists([local], (listId) => listId === "public-list");

  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].id, "local-list");
  assert.equal(persisted[0].items[0].word, "alpha");
  assert.equal(persisted[0].items[0].translation, "one");
});
