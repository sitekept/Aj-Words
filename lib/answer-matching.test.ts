import test from "node:test";
import assert from "node:assert/strict";
import {
  checkAnswer,
  diffAnswer,
  foldAnswer,
  getAcceptedAnswers,
  levenshtein,
  typoToleranceFor
} from "./answer-matching.ts";

test("foldAnswer strips accents and niqqud", () => {
  assert.equal(foldAnswer("deja"), foldAnswer("déjà"));
  assert.equal(foldAnswer("déjà"), "deja");
  assert.equal(foldAnswer("בָּיִת"), "בית");
});

test("foldAnswer strips terminal punctuation at the edges only", () => {
  assert.equal(foldAnswer("hello!"), "hello");
  assert.equal(foldAnswer("…hello ?! "), "hello");
  // Internal separators survive the fold (alternatives handle them).
  assert.equal(foldAnswer("a, b"), "a, b");
});

test("foldAnswer collapses whitespace and lowercases", () => {
  assert.equal(foldAnswer("  HeLLo   World  "), "hello world");
  assert.equal(foldAnswer("a\t b\n c"), "a b c");
});

test("foldAnswer strips quotes, geresh, and gershayim anywhere", () => {
  assert.equal(foldAnswer('חו"ל'), "חול");
  assert.equal(foldAnswer("חו״ל"), "חול");
  assert.equal(foldAnswer("ג׳ורג׳"), "גורג");
  assert.equal(foldAnswer("l'eau"), "leau");
});

test("getAcceptedAnswers builds synonym and parenthetical variants", () => {
  assert.deepEqual(getAcceptedAnswers("בטן, כרס"), ["בטן, כרס", "בטן", "כרס"]);
  assert.deepEqual(getAcceptedAnswers('קיצור (ר"ת)'), ['קיצור (ר"ת)', "קיצור"]);
  assert.deepEqual(getAcceptedAnswers("a / b", ["c"]), ["a / b", "a", "b", "c"]);
});

test("each synonym of a multi-answer target is accepted", () => {
  assert.equal(checkAnswer("בטן", "בטן, כרס").verdict, "correct");
  assert.equal(checkAnswer("כרס", "בטן, כרס").verdict, "correct");
  assert.equal(checkAnswer("בטן, כרס", "בטן, כרס").verdict, "correct");
});

test("parenthetical segments are optional", () => {
  assert.equal(checkAnswer("קיצור", 'קיצור (ר"ת)').verdict, "correct");
});

test("Hebrew abbreviation quotes are ignored", () => {
  assert.equal(checkAnswer("חול", 'חו"ל').verdict, "correct");
  assert.equal(checkAnswer("חול", "חו״ל").verdict, "correct");
});

test("extra alternatives are accepted", () => {
  assert.equal(checkAnswer("belly", "בטן, כרס", ["belly"]).verdict, "correct");
});

test("levenshtein computes edit distance over code points", () => {
  assert.equal(levenshtein("kitten", "sitting"), 3);
  assert.equal(levenshtein("", "abc"), 3);
  assert.equal(levenshtein("abc", "abc"), 0);
  // Surrogate pairs count as one character.
  assert.equal(levenshtein("😀a", "a"), 1);
});

test("typoToleranceFor scales with answer length", () => {
  assert.equal(typoToleranceFor(3), 0);
  assert.equal(typoToleranceFor(4), 1);
  assert.equal(typoToleranceFor(7), 1);
  assert.equal(typoToleranceFor(8), 1);
  assert.equal(typoToleranceFor(14), 2);
  assert.equal(typoToleranceFor(20), 3);
});

test("one-character typos on longer words are tolerated", () => {
  assert.equal(checkAnswer("m3mrra", "m3mra").verdict, "correct-typo");
  assert.equal(checkAnswer("housr", "house").verdict, "correct-typo");
});

test("short words tolerate no typos", () => {
  assert.equal(checkAnswer("בין", "בית").verdict, "incorrect");
});

test("two misses on a five-letter word are incorrect", () => {
  assert.equal(checkAnswer("houxx", "house").verdict, "incorrect");
});

test("checkAnswer reports matchedAnswer and distance", () => {
  const exact = checkAnswer("Café!", "café");
  assert.equal(exact.verdict, "correct");
  assert.equal(exact.matchedAnswer, "café");
  assert.equal(exact.distance, 0);

  const typo = checkAnswer("housr", "house");
  assert.equal(typo.matchedAnswer, "house");
  assert.equal(typo.distance, 1);

  const miss = checkAnswer("xxxxx", "בטן, כרס");
  assert.equal(miss.verdict, "incorrect");
  assert.ok(["בטן, כרס", "בטן", "כרס"].includes(miss.matchedAnswer));
  assert.ok(miss.distance > 1);
});

test("diffAnswer marks a single-character substitution", () => {
  assert.deepEqual(diffAnswer("hoase", "house"), [
    { char: "h", kind: "match" },
    { char: "o", kind: "match" },
    { char: "a", kind: "wrong" },
    { char: "s", kind: "match" },
    { char: "e", kind: "match" }
  ]);
});

test("diffAnswer marks missing and extra characters", () => {
  assert.deepEqual(diffAnswer("hose", "house"), [
    { char: "h", kind: "match" },
    { char: "o", kind: "match" },
    { char: "u", kind: "missing" },
    { char: "s", kind: "match" },
    { char: "e", kind: "match" }
  ]);

  const extra = diffAnswer("houuse", "house");
  assert.equal(extra.filter((segment) => segment.kind === "extra").length, 1);
  assert.equal(extra.filter((segment) => segment.kind === "match").length, 5);
});

test("diffAnswer renders raw characters but aligns on folded text", () => {
  // Accents never count as mistakes, and the raw character is kept for display.
  const segments = diffAnswer("déjà", "deju");
  assert.deepEqual(
    segments.map((segment) => segment.kind),
    ["match", "match", "match", "wrong"]
  );
  assert.equal(segments[1].char, "é");
});
