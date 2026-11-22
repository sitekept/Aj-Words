#!/usr/bin/env node

// Regenerates the bundled curated library from an in-app JSON export.
//
// This is the maintainer's authoring loop: build the lists in the app (dev mode,
// which is the full editing UI), export them, run this, commit. The bundled
// lists are what every tester receives — read-only, undeletable — and in the
// NEXT_PUBLIC_CURATED_LIBRARY build they are the only lists that exist.
//
// CONTENT ONLY. The output uses the `terms` shape, never `items`, and carries no
// testHistory. That is not politeness, it is the mechanism:
// lib/builtin-vocabulary.ts compiles `terms` through `makeItems`, which hard-codes
// fresh cards, while `items` goes through `makeSnapshotItems` and preserves
// whatever progress the JSON holds. Shipping `items` is how 19 lists once went
// out carrying their owner's real study history for every tester to inherit.
// lib/builtin-vocabulary.test.ts fails if that shape ever comes back.
//
// Two standing rules when editing the bundle:
//  - a NEW list needs a NEW id. A retired id is tombstoned on load
//    (lib/retired-lists.ts) and the list would vanish everywhere, silently.
//  - before REMOVING a list from the bundle, append its id to
//    RETIRED_BUILTIN_IDS, or its stored progress overlays resurface as lists of
//    blank cards. See docs/ARCHITECTURE.md §5.1.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPORT_APP_ID = "aj-words";
const EXPORT_VERSION = 1;
const DEFAULT_OUTPUT = "lib/builtin-vocabulary-data.json";
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const usage = () => {
  console.error(
    [
      "Usage: npm run import:phone -- <aj-words-export.json> [--output <path>]",
      "",
      "Example:",
      "  npm run import:phone -- ~/Downloads/aj-words-2026-05-18.json"
    ].join("\n")
  );
};

const parseArgs = (argv) => {
  const args = [...argv];
  let input = null;
  let output = DEFAULT_OUTPUT;

  while (args.length) {
    const arg = args.shift();

    if (arg === "--output") {
      const nextOutput = args.shift();
      if (!nextOutput) {
        throw new Error("Missing value after --output.");
      }
      output = nextOutput;
      continue;
    }

    if (arg?.startsWith("--output=")) {
      output = arg.slice("--output=".length);
      continue;
    }

    if (arg?.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (input) {
      throw new Error(`Unexpected extra argument: ${arg}`);
    }

    input = arg;
  }

  if (!input) {
    throw new Error("Missing AJ Words export file path.");
  }

  return {
    inputPath: path.resolve(process.cwd(), input),
    outputPath: path.resolve(process.cwd(), output)
  };
};

const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredString = (value, fallback) =>
  typeof value === "string" && value.trim() ? value : fallback;

const optionalString = (value) =>
  typeof value === "string" && value.trim() ? value : undefined;

const count = (value) =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;

// Mirrors lib/item-content.ts normalizeContentFields: trimmed non-empty
// strings and deduped non-empty string arrays; absent/empty stays absent.
const trimmedString = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const stringList = (value) => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const entries = [
    ...new Set(
      value
        .filter((entry) => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  ];

  return entries.length ? entries : undefined;
};

const contentFields = (source) => {
  const note = trimmedString(source.note);
  const example = trimmedString(source.example);
  const altAnswers = stringList(source.altAnswers);
  const tags = stringList(source.tags);

  return {
    ...(note ? { note } : {}),
    ...(example ? { example } : {}),
    ...(altAnswers ? { altAnswers } : {}),
    ...(tags ? { tags } : {})
  };
};

// A bundled term: the card's content and nothing else. Every progress field the
// export carries — status, attempts, streaks, box, dueAt, FSRS state — is left
// behind here, deliberately and by omission rather than by a delete list, so a
// new field cannot leak in by being forgotten.
const normalizeTerm = (item) => {
  const source = isRecord(item) ? item : {};

  return {
    word: requiredString(source.word, ""),
    translation: requiredString(source.translation, ""),
    ...contentFields(source)
  };
};

/** Did this export carry study progress that we are about to drop? */
const carriesProgress = (list) => {
  const source = isRecord(list) ? list : {};
  if (Array.isArray(source.testHistory) && source.testHistory.length) {
    return true;
  }

  return (Array.isArray(source.items) ? source.items : []).some((item) => {
    const card = isRecord(item) ? item : {};
    return (
      count(card.attempts) > 0 ||
      count(card.box) > 0 ||
      (typeof card.status === "string" && card.status !== "new")
    );
  });
};

const normalizeList = (list, index) => {
  const source = isRecord(list) ? list : {};
  const id = requiredString(source.id, `phone-list-${String(index + 1).padStart(3, "0")}`);
  // A card with neither side is a blank in the library and an unanswerable
  // question in a quiz, so it has no business shipping to anyone.
  const terms = (Array.isArray(source.items) ? source.items : [])
    .map(normalizeTerm)
    .filter((term) => term.word.trim() || term.translation.trim());

  return {
    id,
    title: requiredString(source.title, "Liste sans titre"),
    ...(optionalString(source.language) ? { language: optionalString(source.language) } : {}),
    ...(optionalString(source.source) ? { source: optionalString(source.source) } : {}),
    createdAt: requiredString(source.createdAt, new Date().toISOString()),
    updatedAt: requiredString(source.updatedAt, new Date().toISOString()),
    terms
  };
};

const parseExport = async (inputPath) => {
  let payload;

  try {
    payload = JSON.parse(await readFile(inputPath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read a valid JSON export: ${error.message}`);
  }

  if (!isRecord(payload)) {
    throw new Error("The export root must be a JSON object.");
  }

  if (payload.app !== EXPORT_APP_ID || payload.version !== EXPORT_VERSION) {
    throw new Error(
      `Expected an ${EXPORT_APP_ID} export with version ${EXPORT_VERSION}.`
    );
  }

  if (!Array.isArray(payload.lists)) {
    throw new Error("The export does not include a lists array.");
  }

  return {
    lists: payload.lists.map(normalizeList),
    hadProgress: payload.lists.some(carriesProgress)
  };
};

try {
  const { inputPath, outputPath } = parseArgs(process.argv.slice(2));
  const { lists, hadProgress } = await parseExport(inputPath);
  const relativeOutput = path.relative(rootDir, outputPath);

  await writeFile(outputPath, `${JSON.stringify(lists, null, 2)}\n`);

  const wordCount = lists.reduce((total, list) => total + list.terms.length, 0);

  console.log(
    `Imported ${lists.length} list(s) and ${wordCount} words into ${relativeOutput}.`
  );

  if (hadProgress) {
    // Said out loud rather than left implicit: someone running this on their own
    // export should know their practice did not travel, and is not expected to.
    console.log(
      "Study progress and test history in the export were dropped — the bundle ships content only."
    );
  }

  console.log(
    "Next: run `npm test` (the bundle guards live in lib/builtin-vocabulary.test.ts), then commit."
  );
} catch (error) {
  usage();
  console.error(`\nError: ${error.message}`);
  process.exit(1);
}
