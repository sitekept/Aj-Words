// Retired builtin lists — the migration that makes removing the bundled seed
// lists safe.
//
// AJ Words used to ship 19 starter lists (Darija + Hebrew Quizlet units)
// carrying their original owner's real study progress. They are gone, and
// removing them is NOT just a matter of emptying the seed file.
//
// A builtin list was never stored whole: `createPublicListOverlay` in
// ./vocabulary-persistence.ts writes a compact OVERLAY holding only the items
// whose progress changed, and only their `id` + progress fields — no `word`, no
// `translation`. Re-inflating that overlay depended on the canonical builtin
// definition still existing. With the builtins gone, `isPublicListId` is
// permanently false, so those overlays would fall through the "local lists"
// filter in `mergeStoredLists` and surface as real, editable lists of BLANK
// cards — which `saveLists` would then rewrite in full, making the damage
// permanent. They would also become eligible for cloud push, which filters on
// the same predicate.
//
// So they are dropped on the way in. Structural types and no imports, like
// ./vocabulary-persistence.ts, so this stays unit-testable under plain Node.

type RetirableItem = {
  word: string;
  translation: string;
};

type RetirableList = {
  id: string;
  items: RetirableItem[];
};

/**
 * The exact ids of every list AJ Words ever bundled as a builtin.
 *
 * This is a permanent TOMBSTONE list, not configuration: never remove an entry.
 * The last 3 were shipped in `d207199` and dropped again in `77298ec` (three
 * duplicate Darija lists), so any browser that studied them has carried an
 * orphaned overlay ever since — which is also why the shape-based backstop
 * below exists rather than trusting enumeration alone. Anyone who edits the
 * bundle must append the retired ids here before removing them.
 */
export const RETIRED_BUILTIN_IDS: ReadonlySet<string> = new Set([
  "0b43895e-5ce3-409a-b1ac-4f989fba0dae",
  "quizlet-166616674",
  "quizlet-166615765",
  "quizlet-166615555",
  "quizlet-166609820",
  "quizlet-166607645",
  "quizlet-166601419",
  "quizlet-166599648",
  "quizlet-166290774",
  "quizlet-166288734",
  "quizlet-166253534",
  "quizlet-166251151",
  "quizlet-166242825",
  "quizlet-166223995",
  "quizlet-166221508",
  "quizlet-166214033",
  "quizlet-166211197",
  "quizlet-166110290",
  "quizlet-166111419",
  // Dropped in 77298ec, after shipping in d207199.
  "af2a952c-c1c8-4964-b6f7-d7eec30665d8",
  "ec744517-a77a-4527-8750-57c92d1107ce",
  "2d823501-1dbf-477d-bc7f-cca6c63bb525"
]);

/**
 * A stored list that is all progress and no content: every card has neither a
 * word nor a translation. That is the shape of an orphaned progress overlay,
 * and it carries nothing a user could want, so discarding it is free.
 *
 * `items.length > 0` matters: `every` is true for an empty array, and without
 * the guard this would also eat a list the user just created and has not
 * filled in yet.
 */
const isOrphanedProgressOverlay = (list: RetirableList): boolean =>
  list.items.length > 0 &&
  list.items.every((item) => !item.word.trim() && !item.translation.trim());

/**
 * Should this stored list be dropped on load?
 *
 * The id set covers the 19 we shipped; the shape check is the safety net for
 * any other orphaned overlay — a different builtin set, or an intermediate
 * build whose ids we never enumerated.
 *
 * `isLiveBuiltin` is what keeps the shape check honest, and it is not optional.
 * An overlay belonging to a builtin that STILL SHIPS has exactly the same shape
 * as an orphaned one — all progress, no text — because that is what
 * `createPublicListOverlay` writes. Without this predicate the backstop would
 * delete every tester's progress on every bundled list, on every single load,
 * the moment the bundle stopped being empty. The tombstone still wins, so an id
 * that was retired stays retired even if it reappeared in the bundle.
 *
 * Passed in rather than imported, like `createPersistedLists` takes
 * `isPublicListId`, so this module keeps its zero imports and stays unit-testable
 * under plain Node.
 */
export const isRetiredBuiltinList = (
  list: RetirableList,
  isLiveBuiltin: (id: string) => boolean
): boolean =>
  RETIRED_BUILTIN_IDS.has(list.id) ||
  (!isLiveBuiltin(list.id) && isOrphanedProgressOverlay(list));

/**
 * The id a retired builtin list takes when it is imported back from an export
 * made before the removal.
 *
 * It must differ from the retired id, or `isRetiredBuiltinList` would delete
 * the list on the next load. It must also be **deterministic**: a random id
 * would make a second import of the same file land as a duplicate instead of
 * matching the first and following the ordinary same-id replacement path.
 *
 * The suffix cannot collide with the tombstone set, whose entries are fixed
 * strings, so a restored list is never purged.
 */
export const restoredListId = (retiredId: string): string =>
  `${retiredId}-restored`;

/**
 * The id an imported list will actually be stored under.
 *
 * One source of truth for two callers that must agree: the store, which does
 * the re-id, and the UI, which decides whether an import would overwrite
 * something and needs confirming. When they disagreed, re-importing a
 * pre-removal export silently overwrote the already-restored list — no
 * "Replace existing lists?" prompt, because the incoming retired id matched
 * nothing in the library.
 *
 * Public (builtin) ids are NOT handled here: those fork to a fresh random id
 * through `createLocalCopy`, and never replace anything.
 */
export const importedListId = (id: string): string =>
  RETIRED_BUILTIN_IDS.has(id) ? restoredListId(id) : id;
