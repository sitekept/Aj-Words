import test from "node:test";
import assert from "node:assert/strict";
import { dedupeLists } from "./list-dedupe.ts";
import type { WordList } from "../types/vocabulary.ts";

// dedupeLists only reads items[].word/.translation and items.length, so the
// fixtures stay intentionally minimal.
const list = (
  id: string,
  pairs: Array<[string, string]>
): WordList =>
  ({
    id,
    title: id,
    items: pairs.map(([word, translation], index) => ({
      id: `${id}-${index}`,
      word,
      translation
    })),
    testHistory: []
  }) as unknown as WordList;

test("keeps the larger list when one is contained in the other", () => {
  const small = list("small", [
    ["hello", "bonjour"],
    ["bye", "au revoir"]
  ]);
  const big = list("big", [
    ["hello", "bonjour"],
    ["bye", "au revoir"],
    ["thanks", "merci"],
    ["please", "s'il te plaît"]
  ]);

  const result = dedupeLists([small, big]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "big");
});

test("keeps complementary exercises that share only the word, not the pair", () => {
  // Same words, different answer side (word-quiz vs sentence-completion): the
  // word|translation pairs never match, so both must survive.
  const quiz = list("quiz", [
    ["aid", "לעזור, לסייע"],
    ["around", "מסביב"]
  ]);
  const completion = list("completion", [
    ["aid", "Germany gave Greece the financial ____ they need."],
    ["around", "Most planets have several moons orbiting ____ them."]
  ]);

  const result = dedupeLists([quiz, completion]);
  assert.equal(result.length, 2);
});

test("leaves genuinely distinct lists untouched", () => {
  const a = list("a", [["one", "un"], ["two", "deux"]]);
  const b = list("b", [["dog", "chien"], ["cat", "chat"]]);
  const result = dedupeLists([a, b]);
  assert.equal(result.length, 2);
});

test("folds diacritics and case when comparing pairs", () => {
  const a = list("a", [["Café", "Coffee"], ["Éte", "Summer"]]);
  const b = list("b", [
    ["cafe", "coffee"],
    ["ete", "summer"],
    ["hiver", "winter"]
  ]);
  const result = dedupeLists([a, b]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "b");
});

test("returns the input unchanged when there is nothing to compare", () => {
  const only = list("only", [["x", "y"]]);
  assert.deepEqual(dedupeLists([only]), [only]);
  assert.deepEqual(dedupeLists([]), []);
});
