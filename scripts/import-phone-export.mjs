#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPORT_APP_ID = "aj-words";
const EXPORT_VERSION = 1;
const DEFAULT_OUTPUT = "lib/builtin-vocabulary-data.json";
const VALID_STATUSES = new Set(["new", "learning", "mastered"]);
const VALID_MODES = new Set([
  "written",
  "choice",
  "mixed",
  "test",
  "full-review"
]);

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

const normalizeAttempt = (attempt) => {
  const source = isRecord(attempt) ? attempt : {};
  const options = Array.isArray(source.options)
    ? source.options.filter((option) => typeof option === "string")
    : undefined;

  return {
    itemId: requiredString(source.itemId, ""),
    questionType: source.questionType === "choice" ? "choice" : "written",
    prompt: requiredString(source.prompt, ""),
    correctAnswer: requiredString(source.correctAnswer, ""),
    userAnswer: requiredString(source.userAnswer, ""),
    isCorrect: Boolean(source.isCorrect),
    ...(options ? { options } : {})
  };
};

const normalizeTestHistoryEntry = (entry, index) => {
  const source = isRecord(entry) ? entry : {};
  const attempts = Array.isArray(source.attempts)
    ? source.attempts.map(normalizeAttempt)
    : [];
  const correctCount = attempts.filter((attempt) => attempt.isCorrect).length;
  const total = attempts.length;

  return {
    id: requiredString(source.id, `history-${String(index + 1).padStart(3, "0")}`),
    mode: VALID_MODES.has(source.mode) ? source.mode : "test",
    attempts,
    correctCount,
    total,
    score: total ? Math.round((correctCount / total) * 100) : 0,
    createdAt: requiredString(source.createdAt, new Date().toISOString())
  };
};

const normalizeItem = (item, listId, index) => {
  const source = isRecord(item) ? item : {};

  return {
    id: requiredString(
      source.id,
      `${listId}-term-${String(index + 1).padStart(3, "0")}`
    ),
    word: requiredString(source.word, ""),
    translation: requiredString(source.translation, ""),
    status: VALID_STATUSES.has(source.status) ? source.status : "new",
    attempts: count(source.attempts),
    correctCount: count(source.correctCount),
    wrongCount: count(source.wrongCount),
    correctStreak: count(source.correctStreak),
    wrongStreak: count(source.wrongStreak),
    ...(optionalString(source.lastTestedAt)
      ? { lastTestedAt: optionalString(source.lastTestedAt) }
      : {}),
    ...(optionalString(source.lastWrongAt)
      ? { lastWrongAt: optionalString(source.lastWrongAt) }
      : {}),
    // Preserve spaced-repetition scheduling when an export carries it; absent
    // values are derived on load by lib/builtin-vocabulary.ts.
    ...(typeof source.box === "number" ? { box: count(source.box) } : {}),
    ...(optionalString(source.dueAt)
      ? { dueAt: optionalString(source.dueAt) }
      : {}),
    createdAt: requiredString(source.createdAt, new Date().toISOString()),
    updatedAt: requiredString(source.updatedAt, new Date().toISOString())
  };
};

const normalizeList = (list, index) => {
  const source = isRecord(list) ? list : {};
  const id = requiredString(source.id, `phone-list-${String(index + 1).padStart(3, "0")}`);
  const items = Array.isArray(source.items)
    ? source.items.map((item, itemIndex) => normalizeItem(item, id, itemIndex))
    : [];
  const testHistory = Array.isArray(source.testHistory)
    ? source.testHistory.map(normalizeTestHistoryEntry)
    : [];

  return {
    id,
    title: requiredString(source.title, "Untitled list"),
    ...(optionalString(source.language) ? { language: optionalString(source.language) } : {}),
    ...(optionalString(source.source) ? { source: optionalString(source.source) } : {}),
    createdAt: requiredString(source.createdAt, new Date().toISOString()),
    updatedAt: requiredString(source.updatedAt, new Date().toISOString()),
    items,
    testHistory
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

  return payload.lists.map(normalizeList);
};

try {
  const { inputPath, outputPath } = parseArgs(process.argv.slice(2));
  const lists = await parseExport(inputPath);
  const relativeOutput = path.relative(rootDir, outputPath);

  await writeFile(outputPath, `${JSON.stringify(lists, null, 2)}\n`);

  const wordCount = lists.reduce((total, list) => total + list.items.length, 0);
  const historyCount = lists.reduce(
    (total, list) => total + list.testHistory.length,
    0
  );

  console.log(
    `Imported ${lists.length} lists, ${wordCount} words, and ${historyCount} test history entries into ${relativeOutput}.`
  );
} catch (error) {
  usage();
  console.error(`\nError: ${error.message}`);
  process.exit(1);
}
