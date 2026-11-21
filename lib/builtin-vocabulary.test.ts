import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const seedData = require("./builtin-vocabulary-data.json") as unknown;

// AJ Words no longer bundles any starter list. This file used to carry 19 of
// them (Darija + Hebrew Quizlet units, 1080 words) along with their original
// owner's real study progress, which every tester would have seen as their own.
//
// The guard below is the point of this test: `npm run import:phone` regenerates
// this very file from a personal in-app export, so one stray run would quietly
// ship someone's vocabulary and progress to everyone again. If this test fails,
// that is almost certainly what happened — do not "fix" it by updating the
// expectation.
test("ships no bundled starter lists", () => {
  assert.ok(Array.isArray(seedData), "the seed file must be a JSON array");
  assert.deepEqual(seedData, []);
});

test("the seed file is an array, so the module cannot crash at import time", () => {
  // lib/builtin-vocabulary.ts is evaluated at import time by the only page and
  // calls .map() on this data. An object here used to throw
  // "builtinVocabulary.map is not a function" during `next build` and at
  // hydration, with no error boundary to catch it. The module now guards with
  // Array.isArray, but keeping the data file's shape pinned is cheaper than
  // relying on the guard.
  assert.equal(Array.isArray(seedData), true);
});
