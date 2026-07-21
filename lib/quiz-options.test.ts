import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHOICE_OPTION_COUNT,
  answerFor,
  buildOptions,
  canUseChoice,
  countDistinctAnswers,
  similarityScore
} from "./quiz-options.ts";
import type { QuizDirection, VocabularyItem } from "../types/vocabulary.ts";

const makeItem = (
  id: string,
  word: string,
  translation: string
): VocabularyItem => ({
  id,
  word,
  translation,
  status: "new",
  attempts: 0,
  correctCount: 0,
  wrongCount: 0,
  correctStreak: 0,
  wrongStreak: 0,
  box: 0,
  dueAt: "2026-07-21T00:00:00.000Z",
  createdAt: "2026-07-21T00:00:00.000Z",
  updatedAt: "2026-07-21T00:00:00.000Z"
});

/** Deterministic stand-in for the Fisher-Yates shuffle. */
const identity = <T,>(values: T[]): T[] => [...values];

const optionsFor = (
  items: VocabularyItem[],
  index: number,
  direction: QuizDirection = "forward"
) => buildOptions(items[index], items, direction, identity);

test("returns four distinct options when four distinct answers exist", () => {
  const items = [
    makeItem("1", "cat", "chat"),
    makeItem("2", "dog", "chien"),
    makeItem("3", "bird", "oiseau"),
    makeItem("4", "fish", "poisson")
  ];

  const options = optionsFor(items, 0);
  assert.equal(options.length, CHOICE_OPTION_COUNT);
  assert.equal(new Set(options).size, CHOICE_OPTION_COUNT);
  assert.ok(options.includes("chat"));
});

// The regression this module exists for: a distractor equal to the correct
// answer used to survive the draw and get absorbed by the final dedupe,
// leaving three options. "Ou" and "Habiter" really are duplicated in the
// bundled Mots Darija list.
test("still fills four options when another card shares the correct answer", () => {
  const items = [
    makeItem("1", "w-a", "Ou"),
    makeItem("2", "w-b", "Ou"),
    makeItem("3", "w-c", "Habiter"),
    makeItem("4", "w-d", "Manger"),
    makeItem("5", "w-e", "Boire")
  ];

  const options = optionsFor(items, 0);
  assert.equal(options.length, CHOICE_OPTION_COUNT);
  assert.equal(new Set(options).size, CHOICE_OPTION_COUNT);
  assert.equal(options.filter((option) => option === "Ou").length, 1);
});

test("treats answers differing only by case or accent as one option", () => {
  const items = [
    makeItem("1", "w-a", "déjà"),
    makeItem("2", "w-b", "Deja"),
    makeItem("3", "w-c", "encore"),
    makeItem("4", "w-d", "toujours"),
    makeItem("5", "w-e", "jamais")
  ];

  const options = optionsFor(items, 0);
  assert.equal(options.length, CHOICE_OPTION_COUNT);
  // "Deja" folds onto "déjà": showing both would offer two correct answers.
  assert.ok(!options.includes("Deja"));
});

test("degrades to the distinct answers available instead of padding", () => {
  const items = [
    makeItem("1", "w-a", "alpha"),
    makeItem("2", "w-b", "beta"),
    makeItem("3", "w-c", "beta")
  ];

  const options = optionsFor(items, 0);
  assert.equal(options.length, 2);
  assert.equal(new Set(options).size, 2);
  assert.ok(options.includes("alpha"));
});

test("draws distractors from the graded side of the requested direction", () => {
  const items = [
    makeItem("1", "cat", "chat"),
    makeItem("2", "dog", "chien"),
    makeItem("3", "bird", "oiseau"),
    makeItem("4", "fish", "poisson")
  ];

  const forward = optionsFor(items, 0, "forward");
  const reverse = optionsFor(items, 0, "reverse");

  assert.ok(forward.every((option) => option !== "dog"));
  assert.ok(reverse.includes("cat"));
  assert.ok(reverse.every((option) => option !== "chien"));
});

test("keeps Hebrew distractors for a Hebrew answer over Latin ones", () => {
  const items = [
    makeItem("1", "connection", "קשר"),
    makeItem("2", "b", "קשה"),
    makeItem("3", "c", "קשת"),
    makeItem("4", "d", "בטן"),
    makeItem("5", "e", "a very long english sentence here"),
    makeItem("6", "f", "another lengthy english phrase"),
    makeItem("7", "g", "yet more english filler text")
  ];

  const options = optionsFor(items, 0);
  assert.equal(options.length, CHOICE_OPTION_COUNT);
  // Same-script, near-identical Hebrew words outrank the long English ones.
  assert.ok(options.includes("קשה"));
  assert.ok(options.includes("קשת"));
});

test("similarityScore ranks near-misses above unrelated answers", () => {
  assert.ok(
    similarityScore("chanter", "chanteur") > similarityScore("chanter", "kayak")
  );
  // Same script beats a cross-script match of comparable length.
  assert.ok(similarityScore("קשר", "בטן") > similarityScore("קשר", "cat"));
});

test("similarityScore ignores accents and quotes, like the answer checker", () => {
  assert.equal(similarityScore("déjà", "deja"), similarityScore("deja", "deja"));
});

test("countDistinctAnswers counts folded answers, not cards", () => {
  const items = [
    makeItem("1", "w-a", "Ou"),
    makeItem("2", "w-b", "ou"),
    makeItem("3", "w-c", "Habiter")
  ];

  assert.equal(countDistinctAnswers(items, "forward"), 2);
  assert.equal(countDistinctAnswers(items, "reverse"), 3);
});

// Four cards are not four options: the old item-count guard offered a choice
// question this list cannot actually fill.
test("canUseChoice requires four distinct answers, not four cards", () => {
  const items = [
    makeItem("1", "w-a", "alpha"),
    makeItem("2", "w-b", "beta"),
    makeItem("3", "w-c", "beta"),
    makeItem("4", "w-d", "gamma")
  ];

  assert.equal(canUseChoice(items, "forward"), false);
  // Same cards, other direction: four distinct words, so choice works.
  assert.equal(canUseChoice(items, "reverse"), true);
});

test("answerFor picks the side the direction grades", () => {
  const item = makeItem("1", "cat", "chat");
  assert.equal(answerFor(item, "forward"), "chat");
  assert.equal(answerFor(item, "reverse"), "cat");
});

test("skips blank answers rather than offering an empty option", () => {
  const items = [
    makeItem("1", "w-a", "alpha"),
    makeItem("2", "w-b", ""),
    makeItem("3", "w-c", "   "),
    makeItem("4", "w-d", "beta"),
    makeItem("5", "w-e", "gamma"),
    makeItem("6", "w-f", "delta")
  ];

  const options = optionsFor(items, 0);
  assert.equal(options.length, CHOICE_OPTION_COUNT);
  assert.ok(options.every((option) => option.trim().length > 0));
});
