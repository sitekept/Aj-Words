import test from "node:test";
import assert from "node:assert/strict";
import { normalizeContentFields } from "./item-content.ts";

test("preserves valid content fields", () => {
  const result = normalizeContentFields({
    note: "feminine noun",
    example: "M3mra b l3sl",
    altAnswers: ["filled", "full"],
    tags: ["food", "unit 1"],
    imageId: "img-42",
    imageUrl: "https://example.com/pic.jpg"
  });

  assert.deepEqual(result, {
    note: "feminine noun",
    example: "M3mra b l3sl",
    altAnswers: ["filled", "full"],
    tags: ["food", "unit 1"],
    imageId: "img-42",
    imageUrl: "https://example.com/pic.jpg"
  });
});

test("omits absent or empty image fields", () => {
  assert.equal("imageId" in normalizeContentFields({ imageUrl: "  " }), false);
  assert.equal("imageUrl" in normalizeContentFields({ note: "n" }), false);
  assert.deepEqual(normalizeContentFields({ imageId: "  a  " }), {
    imageId: "a"
  });
});

test("trims strings and array entries", () => {
  const result = normalizeContentFields({
    note: "  spaced note  ",
    example: "\tan example\n",
    altAnswers: ["  hi ", "hello  "],
    tags: [" a ", "b"]
  });

  assert.deepEqual(result, {
    note: "spaced note",
    example: "an example",
    altAnswers: ["hi", "hello"],
    tags: ["a", "b"]
  });
});

test("omits empty and whitespace-only values entirely", () => {
  const result = normalizeContentFields({
    note: "   ",
    example: "",
    altAnswers: ["", "   "],
    tags: []
  });

  assert.deepEqual(result, {});
  assert.equal("note" in result, false);
  assert.equal("example" in result, false);
  assert.equal("altAnswers" in result, false);
  assert.equal("tags" in result, false);
});

test("absent fields stay absent — no keys are materialized", () => {
  const result = normalizeContentFields({});

  assert.deepEqual(result, {});
  assert.deepEqual(Object.keys(result), []);
});

test("ignores non-string values and non-string array entries", () => {
  const result = normalizeContentFields({
    note: 42,
    example: { text: "nope" },
    altAnswers: ["ok", 3, null, undefined, { bad: true }, "  also ok "],
    tags: "not-an-array"
  });

  assert.deepEqual(result, {
    altAnswers: ["ok", "also ok"]
  });
});

test("dedupes array entries after trimming", () => {
  const result = normalizeContentFields({
    altAnswers: ["hi", " hi", "hi ", "hello"],
    tags: ["a", "a", "b"]
  });

  assert.deepEqual(result, {
    altAnswers: ["hi", "hello"],
    tags: ["a", "b"]
  });
});

test("spreading the result over an existing object drops nothing else", () => {
  const base = { id: "item-1", word: "m3mra", translation: "remplie" };
  const merged = { ...base, ...normalizeContentFields({ note: "n" }) };

  assert.deepEqual(merged, { ...base, note: "n" });
});
