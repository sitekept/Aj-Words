import builtinVocabularyData from "@/lib/builtin-vocabulary-data.json";
import type {
  QuizQuestionType,
  TestHistoryEntry,
  VocabularyItem,
  WordList
} from "@/types/vocabulary";
import {
  clampBox,
  deriveStatusFromBox,
  inferSrsFromLegacy
} from "@/lib/srs";
import { normalizeQuizMode } from "@/lib/quiz-modes";
import { normalizeContentFields } from "./item-content";

const BUILTIN_CREATED_AT = "2026-04-30T00:00:00.000Z";

interface BuiltinVocabularyEntry {
  id: string;
  title: string;
  language?: string;
  source?: string;
  terms?: Array<{
    word: string;
    translation: string;
    note?: string;
    example?: string;
    altAnswers?: string[];
    tags?: string[];
  }>;
  items?: Array<Partial<VocabularyItem>>;
  testHistory?: Array<Partial<TestHistoryEntry>>;
  createdAt?: string;
  updatedAt?: string;
}

// The bundled seed file ships EMPTY (`[]`) — AJ Words no longer carries any
// starter list. The guard is not pedantry: this module is evaluated at import
// time by the only page, so a malformed data file (an object, say) used to
// throw "builtinVocabulary.map is not a function" during `next build` and at
// hydration, with no error boundary to catch it. Degrading to "no builtin
// lists" is always recoverable; crashing the module is not.
const builtinVocabulary: BuiltinVocabularyEntry[] = Array.isArray(
  builtinVocabularyData
)
  ? (builtinVocabularyData as BuiltinVocabularyEntry[]).filter(
      (entry): entry is BuiltinVocabularyEntry =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof (entry as BuiltinVocabularyEntry).id === "string"
    )
  : [];

const normalizeCount = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;

const normalizeDate = (value: unknown, fallback?: string) =>
  typeof value === "string" && value.trim() ? value : fallback;

const makeItems = (
  listId: string,
  items: NonNullable<BuiltinVocabularyEntry["terms"]>
): WordList["items"] =>
  items.map((item, index) => ({
    id: `${listId}-term-${String(index + 1).padStart(3, "0")}`,
    word: item.word,
    translation: item.translation,
    // Forward-compatible: today's bundled JSON has no content fields, but a
    // future seed regeneration may carry them.
    ...normalizeContentFields(item),
    status: "new",
    attempts: 0,
    correctCount: 0,
    wrongCount: 0,
    correctStreak: 0,
    wrongStreak: 0,
    box: 0,
    dueAt: BUILTIN_CREATED_AT,
    createdAt: BUILTIN_CREATED_AT,
    updatedAt: BUILTIN_CREATED_AT
  }));

const makeSnapshotItems = (
  listId: string,
  items: NonNullable<BuiltinVocabularyEntry["items"]>
): WordList["items"] =>
  items.map((item, index) => {
    const attempts = normalizeCount(item.attempts);
    const correctStreak = normalizeCount(item.correctStreak);
    const wrongStreak = normalizeCount(item.wrongStreak);
    const dueAt =
      normalizeDate(item.dueAt, BUILTIN_CREATED_AT) ?? BUILTIN_CREATED_AT;
    const box =
      typeof item.box === "number"
        ? clampBox(item.box)
        : inferSrsFromLegacy({ attempts, correctStreak, wrongStreak }, dueAt).box;

    return {
      id:
        typeof item.id === "string" && item.id.trim()
          ? item.id
          : `${listId}-term-${String(index + 1).padStart(3, "0")}`,
      word: typeof item.word === "string" ? item.word : "",
      translation: typeof item.translation === "string" ? item.translation : "",
      ...normalizeContentFields(item),
      status: deriveStatusFromBox({ box, attempts }),
      attempts,
      correctCount: normalizeCount(item.correctCount),
      wrongCount: normalizeCount(item.wrongCount),
      correctStreak,
      wrongStreak,
      lastTestedAt: normalizeDate(item.lastTestedAt),
      lastWrongAt: normalizeDate(item.lastWrongAt),
      box,
      dueAt,
      createdAt: normalizeDate(item.createdAt, BUILTIN_CREATED_AT) ?? BUILTIN_CREATED_AT,
      updatedAt: normalizeDate(item.updatedAt, BUILTIN_CREATED_AT) ?? BUILTIN_CREATED_AT
    };
  });

const makeSnapshotTestHistory = (
  entries: NonNullable<BuiltinVocabularyEntry["testHistory"]>
): WordList["testHistory"] =>
  entries.map((entry) => {
    const attempts = Array.isArray(entry.attempts)
      ? entry.attempts.map((attempt) => ({
          itemId: typeof attempt.itemId === "string" ? attempt.itemId : "",
          questionType:
            attempt.questionType === "choice"
              ? ("choice" as QuizQuestionType)
              : ("written" as QuizQuestionType),
          prompt: typeof attempt.prompt === "string" ? attempt.prompt : "",
          correctAnswer:
            typeof attempt.correctAnswer === "string" ? attempt.correctAnswer : "",
          userAnswer: typeof attempt.userAnswer === "string" ? attempt.userAnswer : "",
          isCorrect: Boolean(attempt.isCorrect),
          options: Array.isArray(attempt.options)
            ? attempt.options.filter(
                (option): option is string => typeof option === "string"
              )
            : undefined
        }))
      : [];
    const correctCount = attempts.filter((attempt) => attempt.isCorrect).length;
    const total = attempts.length;

    return {
      id: typeof entry.id === "string" && entry.id.trim() ? entry.id : "",
      mode: normalizeQuizMode(entry.mode),
      attempts,
      correctCount,
      total,
      score: total ? Math.round((correctCount / total) * 100) : 0,
      createdAt: normalizeDate(entry.createdAt, BUILTIN_CREATED_AT) ?? BUILTIN_CREATED_AT
    };
  });

export const builtinLists: WordList[] = builtinVocabulary.map((list) => ({
  id: list.id,
  title: list.title,
  language: list.language,
  testHistory: list.testHistory ? makeSnapshotTestHistory(list.testHistory) : [],
  createdAt: normalizeDate(list.createdAt, BUILTIN_CREATED_AT) ?? BUILTIN_CREATED_AT,
  updatedAt: normalizeDate(list.updatedAt, BUILTIN_CREATED_AT) ?? BUILTIN_CREATED_AT,
  items: list.items
    ? makeSnapshotItems(list.id, list.items)
    : makeItems(list.id, list.terms ?? [])
}));

const builtinListsById = new Map(
  builtinLists.map((list) => [list.id, list])
);

export const getBuiltinList = (listId: string) =>
  builtinListsById.get(listId);

export const isBuiltinListId = (listId: string) =>
  builtinListsById.has(listId);
