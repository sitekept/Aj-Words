import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const builtinLists = require("./builtin-vocabulary-data.json") as Array<{
  id: string;
  title: string;
  language?: string;
  items: Array<{ word: string; translation: string }>;
}>;

const CANONICAL_DARIJA_ID = "0b43895e-5ce3-409a-b1ac-4f989fba0dae";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`´]/g, "")
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const itemKey = (item: { word: string; translation: string }) =>
  `${normalize(item.word)}\u0000${normalize(item.translation)}`;

test("bundles a single canonical Darija list without content duplicates", () => {
  const darijaLists = builtinLists.filter(
    (list) => list.language === "Darija" || list.title.includes("Mots Darija")
  );

  assert.equal(darijaLists.length, 1);

  const [darija] = darijaLists;
  assert.equal(darija.id, CANONICAL_DARIJA_ID);
  assert.equal(darija.title, "Mots Darija");
  assert.equal(darija.language, "Darija");
  assert.equal(darija.items.length, 159);

  const uniqueKeys = new Set(darija.items.map(itemKey));
  assert.equal(uniqueKeys.size, darija.items.length);

  for (const key of [
    "sali\u0000prier",
    "magana\u0000montre",
    "ktab\u0000livre",
    "sh7al\u0000combien",
    "ar9an\u0000chiffres"
  ]) {
    assert.equal(uniqueKeys.has(key), true, `Expected ${key} to be present`);
  }
});
