import builtinVocabularyData from "@/lib/builtin-vocabulary-data.json";
import type {
  LearningStatus,
  QuizQuestionType,
  TestHistoryEntry,
  VocabularyItem,
  WordList
} from "@/types/vocabulary";

const BUILTIN_CREATED_AT = "2026-04-30T00:00:00.000Z";

const learningStatuses = new Set<LearningStatus>([
  "new",
  "learning",
  "mastered"
]);

interface BuiltinVocabularyEntry {
  id: string;
  title: string;
  language?: string;
  source?: string;
  terms?: Array<{
    word: string;
    translation: string;
  }>;
  items?: Array<Partial<VocabularyItem>>;
  testHistory?: Array<Partial<TestHistoryEntry>>;
  createdAt?: string;
  updatedAt?: string;
}

const builtinVocabulary = builtinVocabularyData as BuiltinVocabularyEntry[];

const isLearningStatus = (value: unknown): value is LearningStatus =>
  typeof value === "string" && learningStatuses.has(value as LearningStatus);

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
    status: "new",
    attempts: 0,
    correctCount: 0,
    wrongCount: 0,
    correctStreak: 0,
    wrongStreak: 0,
    createdAt: BUILTIN_CREATED_AT,
    updatedAt: BUILTIN_CREATED_AT
  }));

const makeSnapshotItems = (
  listId: string,
  items: NonNullable<BuiltinVocabularyEntry["items"]>
): WordList["items"] =>
  items.map((item, index) => ({
    id:
      typeof item.id === "string" && item.id.trim()
        ? item.id
        : `${listId}-term-${String(index + 1).padStart(3, "0")}`,
    word: typeof item.word === "string" ? item.word : "",
    translation: typeof item.translation === "string" ? item.translation : "",
    status: isLearningStatus(item.status) ? item.status : "new",
    attempts: normalizeCount(item.attempts),
    correctCount: normalizeCount(item.correctCount),
    wrongCount: normalizeCount(item.wrongCount),
    correctStreak: normalizeCount(item.correctStreak),
    wrongStreak: normalizeCount(item.wrongStreak),
    lastTestedAt: normalizeDate(item.lastTestedAt),
    lastWrongAt: normalizeDate(item.lastWrongAt),
    createdAt: normalizeDate(item.createdAt, BUILTIN_CREATED_AT) ?? BUILTIN_CREATED_AT,
    updatedAt: normalizeDate(item.updatedAt, BUILTIN_CREATED_AT) ?? BUILTIN_CREATED_AT
  }));

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
      mode:
        entry.mode === "written" ||
        entry.mode === "choice" ||
        entry.mode === "mixed" ||
        entry.mode === "full-review"
          ? entry.mode
          : "test",
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
