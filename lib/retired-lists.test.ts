import test from "node:test";
import assert from "node:assert/strict";
import { RETIRED_BUILTIN_IDS, isRetiredBuiltinList } from "./retired-lists.ts";

const item = (word = "", translation = "") => ({ word, translation });

test("drops every list id AJ Words ever bundled", () => {
  assert.equal(RETIRED_BUILTIN_IDS.size, 22);

  for (const id of RETIRED_BUILTIN_IDS) {
    assert.equal(
      isRetiredBuiltinList({ id, items: [item("", "")] }),
      true,
      `expected ${id} to be retired`
    );
  }
});

test("drops an orphaned progress overlay whatever its id", () => {
  // This is the shape the old builtin lists were persisted as: progress only,
  // no word and no translation. Without this guard it would resurface as a
  // real, editable list of blank cards.
  assert.equal(
    isRetiredBuiltinList({
      id: "some-unenumerated-builtin",
      items: [item("", ""), item("", ""), item("   ", "  ")]
    }),
    true
  );
});

test("keeps a list that has any real content", () => {
  assert.equal(
    isRetiredBuiltinList({
      id: "user-list",
      items: [item("", ""), item("bonjour", "hello")]
    }),
    false
  );
});

test("keeps a freshly created list that has no words yet", () => {
  // `every` is true for an empty array, so without the length guard this would
  // delete a list the user just created and has not filled in.
  assert.equal(isRetiredBuiltinList({ id: "brand-new", items: [] }), false);
});

test("keeps a user list even if one card was left blank", () => {
  assert.equal(
    isRetiredBuiltinList({
      id: "user-list",
      items: [item("chat", "cat"), item("", "")]
    }),
    false
  );
});

test("drops a retired builtin even when it still carries its full content", () => {
  // Not hypothetical: lib/local-backup.ts stores the in-memory lists, words and
  // all, and `loadListsFromBackup` restores through the same funnel. A restored
  // "Mots Darija" has real content, so the shape check would wave it through —
  // the id check is what catches it. This is why the id set stays unconditional.
  assert.equal(
    isRetiredBuiltinList({
      id: "0b43895e-5ce3-409a-b1ac-4f989fba0dae",
      items: [item("sali", "prier"), item("ktab", "livre")]
    }),
    true
  );
});

test("the id check is why imports must be re-id'd, not why they are dropped", () => {
  // The flip side of the test above: an export taken before the removal carries
  // the retired id with real content. `importLists` in lib/useVocabularyStore.ts
  // assigns it a fresh id for exactly this reason — once re-id'd, it is no
  // longer matched here and survives every later reload.
  assert.equal(
    isRetiredBuiltinList({
      id: "freshly-generated-id",
      items: [item("sali", "prier")]
    }),
    false
  );
});
