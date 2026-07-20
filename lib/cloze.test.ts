import test from "node:test";
import assert from "node:assert/strict";
import { CLOZE_BLANK, CLOZE_RE, getClozePrompt, isClozeText } from "./cloze.ts";

test("isClozeText detects a run of two or more underscores", () => {
  assert.equal(isClozeText("IDF is an _________ of the state."), true);
  assert.equal(isClozeText("__"), true);
  assert.equal(isClozeText("start ____ middle"), true);
});

test("isClozeText ignores single underscores and plain text", () => {
  assert.equal(isClozeText("a _ b"), false);
  assert.equal(isClozeText("snake_case"), false);
  assert.equal(isClozeText("no blanks here"), false);
  assert.equal(isClozeText(""), false);
});

test("CLOZE_RE is not global (a stateful lastIndex would break repeated tests)", () => {
  assert.equal(CLOZE_RE.global, false);
  // Same input twice must give the same verdict.
  assert.equal(CLOZE_RE.test("a __ b"), true);
  assert.equal(CLOZE_RE.test("a __ b"), true);
});

test("getClozePrompt normalizes a long blank run to the display run", () => {
  assert.equal(
    getClozePrompt("IDF is an _________ of the state."),
    `IDF is an ${CLOZE_BLANK} of the state.`
  );
});

test("getClozePrompt normalizes every blank run independently", () => {
  assert.equal(
    getClozePrompt("___ and ____________"),
    `${CLOZE_BLANK} and ${CLOZE_BLANK}`
  );
});

test("getClozePrompt handles runs at the start and end of the sentence", () => {
  assert.equal(getClozePrompt("____ begins the sentence"), `${CLOZE_BLANK} begins the sentence`);
  assert.equal(getClozePrompt("the sentence ends with ____"), `the sentence ends with ${CLOZE_BLANK}`);
});

test("getClozePrompt passes non-cloze text through untouched", () => {
  assert.equal(getClozePrompt("plain translation"), "plain translation");
  assert.equal(getClozePrompt("snake_case stays"), "snake_case stays");
  assert.equal(getClozePrompt(""), "");
});
