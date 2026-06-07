import type {
  FlashcardAssessment,
  LearningStatus,
  ListProgress,
  QuizAttempt,
  QuizMode,
  TestHistoryEntry,
  VocabularyItem,
  WordList
} from "@/types/vocabulary";
import {
  builtinLists,
  getBuiltinList,
  isBuiltinListId
} from "@/lib/builtin-vocabulary";
import {
  clampBox,
  deriveStatusFromBox,
  inferSrsFromLegacy,
  initialSrs,
  scheduleNext
} from "@/lib/srs";

const STORAGE_KEY = "worddeck.v1.lists";
export const EXPORT_APP_ID = "aj-words";
export const EXPORT_VERSION = 1;

const now = () => new Date().toISOString();

export interface VocabularyExportFile {
  app: typeof EXPORT_APP_ID;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  lists: WordList[];
}

export interface ImportedListsResult {
  lists: WordList[];
}

export const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const initialLists: WordList[] = builtinLists;

const isQuizMode = (value: unknown): value is QuizMode =>
  value === "written" ||
  value === "choice" ||
  value === "mixed" ||
  value === "test" ||
  value === "full-review";

const normalizeCount = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;

const normalizeDate = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : undefined;

const hasProgressStats = (item: Partial<VocabularyItem>) =>
  typeof item.attempts === "number" ||
  typeof item.correctCount === "number" ||
  typeof item.wrongCount === "number" ||
  typeof item.correctStreak === "number" ||
  typeof item.wrongStreak === "number" ||
  typeof item.lastTestedAt === "string" ||
  typeof item.lastWrongAt === "string";

const createInitialProgress = () => ({
  attempts: 0,
  correctCount: 0,
  wrongCount: 0,
  correctStreak: 0,
  wrongStreak: 0
});

const normalizeItem = (item: Partial<VocabularyItem>): VocabularyItem => {
  const hasStats = hasProgressStats(item);
  const timestamp = now();
  const normalized = {
    id: typeof item.id === "string" ? item.id : createId(),
    word: typeof item.word === "string" ? item.word : "",
    translation: typeof item.translation === "string" ? item.translation : "",
    status: "new" as LearningStatus,
    attempts: hasStats ? normalizeCount(item.attempts) : 0,
    correctCount: hasStats ? normalizeCount(item.correctCount) : 0,
    wrongCount: hasStats ? normalizeCount(item.wrongCount) : 0,
    correctStreak: hasStats ? normalizeCount(item.correctStreak) : 0,
    wrongStreak: hasStats ? normalizeCount(item.wrongStreak) : 0,
    lastTestedAt: hasStats ? normalizeDate(item.lastTestedAt) : undefined,
    lastWrongAt: hasStats ? normalizeDate(item.lastWrongAt) : undefined,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : timestamp,
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : timestamp
  };

  const hasSrs = typeof item.box === "number" || typeof item.dueAt === "string";
  const srs = hasSrs
    ? {
        box: clampBox(typeof item.box === "number" ? item.box : 0),
        dueAt: normalizeDate(item.dueAt) ?? timestamp
      }
    : hasStats
      ? inferSrsFromLegacy(normalized, timestamp)
      : initialSrs(timestamp);

  return {
    ...normalized,
    box: srs.box,
    dueAt: srs.dueAt,
    status: deriveStatusFromBox({ box: srs.box, attempts: normalized.attempts })
  };
};

const normalizeAttempt = (attempt: Partial<QuizAttempt>): QuizAttempt => ({
  itemId: typeof attempt.itemId === "string" ? attempt.itemId : createId(),
  questionType: attempt.questionType === "choice" ? "choice" : "written",
  prompt: typeof attempt.prompt === "string" ? attempt.prompt : "",
  correctAnswer:
    typeof attempt.correctAnswer === "string" ? attempt.correctAnswer : "",
  userAnswer: typeof attempt.userAnswer === "string" ? attempt.userAnswer : "",
  isCorrect: Boolean(attempt.isCorrect),
  options: Array.isArray(attempt.options)
    ? attempt.options.filter((option): option is string => typeof option === "string")
    : undefined
});

const normalizeTestHistoryEntry = (
  entry: Partial<TestHistoryEntry>
): TestHistoryEntry => {
  const attempts = Array.isArray(entry.attempts)
    ? entry.attempts.map(normalizeAttempt)
    : [];
  const correctCount = attempts.filter((attempt) => attempt.isCorrect).length;
  const total = attempts.length;

  return {
    id: typeof entry.id === "string" ? entry.id : createId(),
    mode: isQuizMode(entry.mode) ? entry.mode : "test",
    attempts,
    correctCount,
    total,
    score: total ? Math.round((correctCount / total) * 100) : 0,
    createdAt: typeof entry.createdAt === "string" ? entry.createdAt : now()
  };
};

const normalizeList = (list: Partial<WordList>): WordList => ({
  id: typeof list.id === "string" ? list.id : createId(),
  title: typeof list.title === "string" ? list.title : "Untitled list",
  language: typeof list.language === "string" ? list.language : "",
  items: Array.isArray(list.items) ? list.items.map(normalizeItem) : [],
  testHistory: Array.isArray(list.testHistory)
    ? list.testHistory.map(normalizeTestHistoryEntry)
    : [],
  createdAt: typeof list.createdAt === "string" ? list.createdAt : now(),
  updatedAt: typeof list.updatedAt === "string" ? list.updatedAt : now()
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isPublicListId = isBuiltinListId;

const mergeBuiltinListWithLocalState = (storedList: WordList): WordList => {
  const builtinList = getBuiltinList(storedList.id);
  if (!builtinList) {
    return storedList;
  }

  const storedItems = new Map(storedList.items.map((item) => [item.id, item]));

  return {
    ...builtinList,
    items: builtinList.items.map((item) => {
      const storedItem = storedItems.get(item.id);

      if (!storedItem) {
        return item;
      }

      return {
        ...item,
        status: storedItem.status,
        attempts: storedItem.attempts,
        correctCount: storedItem.correctCount,
        wrongCount: storedItem.wrongCount,
        correctStreak: storedItem.correctStreak,
        wrongStreak: storedItem.wrongStreak,
        lastTestedAt: storedItem.lastTestedAt,
        lastWrongAt: storedItem.lastWrongAt,
        box: storedItem.box,
        dueAt: storedItem.dueAt,
        updatedAt: storedItem.updatedAt
      };
    }),
    testHistory: storedList.testHistory,
    updatedAt:
      new Date(storedList.updatedAt).getTime() > new Date(builtinList.updatedAt).getTime()
        ? storedList.updatedAt
        : builtinList.updatedAt
  };
};

export const createLocalCopy = (list: WordList): WordList => {
  const timestamp = now();

  return {
    ...list,
    id: createId(),
    title: `${list.title} (local copy)`,
    createdAt: timestamp,
    updatedAt: timestamp,
    items: list.items.map((item) => ({
      ...item,
      updatedAt: timestamp
    }))
  };
};

export const createExportPayload = (lists: WordList[]): VocabularyExportFile => ({
  app: EXPORT_APP_ID,
  version: EXPORT_VERSION,
  exportedAt: now(),
  lists: lists.map((list) => normalizeList(list))
});

export const parseExportPayload = (payload: unknown): ImportedListsResult => {
  if (!isRecord(payload)) {
    throw new Error("This file is not a valid AJ Words export.");
  }

  if (payload.app !== EXPORT_APP_ID || payload.version !== EXPORT_VERSION) {
    throw new Error("This file was not created by this version of AJ Words.");
  }

  if (!Array.isArray(payload.lists)) {
    throw new Error("This export does not include any word lists.");
  }

  return {
    lists: payload.lists.map((list) =>
      normalizeList(isRecord(list) ? (list as Partial<WordList>) : {})
    )
  };
};

export const loadLists = (): WordList[] => {
  if (typeof window === "undefined") {
    return initialLists;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return initialLists;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return initialLists;
    }

    const storedLists = parsed.map(normalizeList);
    const storedById = new Map(storedLists.map((list) => [list.id, list]));
    const publicLists = initialLists.map((list) => {
      const storedList = storedById.get(list.id);
      return storedList ? mergeBuiltinListWithLocalState(storedList) : list;
    });
    const localLists = storedLists.filter((list) => !isPublicListId(list.id));

    return [...publicLists, ...localLists];
  } catch {
    return initialLists;
  }
};

export const saveLists = (lists: WordList[]) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
};

export const getProgress = (items: VocabularyItem[]): ListProgress => ({
  total: items.length,
  mastered: items.filter((item) => item.status === "mastered").length,
  learning: items.filter((item) => item.status === "learning").length,
  fresh: items.filter((item) => item.status === "new").length
});

export const createList = (input: {
  title: string;
  language?: string;
  items?: Array<{
    word: string;
    translation: string;
  }>;
}): WordList => {
  const timestamp = now();

  return {
    id: createId(),
    title: input.title.trim(),
    language: input.language?.trim(),
    testHistory: [],
    items: (input.items ?? []).map((item) => ({
      id: createId(),
      word: item.word.trim(),
      translation: item.translation.trim(),
      status: "new",
      ...createInitialProgress(),
      box: 0,
      dueAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    })),
    createdAt: timestamp,
    updatedAt: timestamp
  };
};

export const createTestHistoryEntry = (input: {
  attempts: QuizAttempt[];
  mode: QuizMode;
}): TestHistoryEntry => {
  const attempts = input.attempts.map(normalizeAttempt);
  const correctCount = attempts.filter((attempt) => attempt.isCorrect).length;
  const total = attempts.length;

  return {
    id: createId(),
    mode: input.mode,
    attempts,
    correctCount,
    total,
    score: total ? Math.round((correctCount / total) * 100) : 0,
    createdAt: now()
  };
};

export const createItem = (input: {
  word: string;
  translation: string;
}): VocabularyItem => {
  const timestamp = now();

  return {
    id: createId(),
    word: input.word.trim(),
    translation: input.translation.trim(),
    status: "new",
    ...createInitialProgress(),
    box: 0,
    dueAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  };
};

export const applyAttemptsToItems = (
  items: VocabularyItem[],
  attempts: QuizAttempt[],
  timestamp = now()
): VocabularyItem[] => {
  if (!attempts.length) {
    return items;
  }

  const attemptsByItem = new Map<string, QuizAttempt[]>();
  attempts.forEach((attempt) => {
    attemptsByItem.set(attempt.itemId, [
      ...(attemptsByItem.get(attempt.itemId) ?? []),
      attempt
    ]);
  });

  return items.map((item) => {
    const itemAttempts = attemptsByItem.get(item.id);

    if (!itemAttempts?.length) {
      return item;
    }

    return itemAttempts.reduce<VocabularyItem>((nextItem, attempt) => {
      const nextAttempts = nextItem.attempts + 1;
      const counters = attempt.isCorrect
        ? {
            attempts: nextAttempts,
            correctCount: nextItem.correctCount + 1,
            wrongCount: nextItem.wrongCount,
            correctStreak: nextItem.correctStreak + 1,
            wrongStreak: 0,
            lastTestedAt: timestamp,
            lastWrongAt: nextItem.lastWrongAt
          }
        : {
            attempts: nextAttempts,
            correctCount: nextItem.correctCount,
            wrongCount: nextItem.wrongCount + 1,
            correctStreak: 0,
            wrongStreak: nextItem.wrongStreak + 1,
            lastTestedAt: timestamp,
            lastWrongAt: timestamp
          };
      const schedule = scheduleNext(nextItem.box, attempt.isCorrect, timestamp);
      const merged = {
        ...nextItem,
        ...counters,
        box: schedule.box,
        dueAt: schedule.dueAt,
        updatedAt: timestamp
      };

      return {
        ...merged,
        status: deriveStatusFromBox(merged)
      };
    }, item);
  });
};

export const applyFlashcardAssessmentToItems = (
  items: VocabularyItem[],
  itemId: string,
  outcome: FlashcardAssessment,
  timestamp = now()
): VocabularyItem[] =>
  items.map((item) => {
    if (item.id !== itemId) {
      return item;
    }

    const correct = outcome === "mastered";
    const counters = correct
      ? {
          attempts: item.attempts + 1,
          correctCount: item.correctCount + 1,
          wrongCount: item.wrongCount,
          correctStreak: item.correctStreak + 1,
          wrongStreak: 0,
          lastTestedAt: timestamp,
          lastWrongAt: item.lastWrongAt
        }
      : {
          attempts: item.attempts + 1,
          correctCount: item.correctCount,
          wrongCount: item.wrongCount + 1,
          correctStreak: 0,
          wrongStreak: item.wrongStreak + 1,
          lastTestedAt: timestamp,
          lastWrongAt: timestamp
        };
    const schedule = scheduleNext(item.box, correct, timestamp);
    const merged = {
      ...item,
      ...counters,
      box: schedule.box,
      dueAt: schedule.dueAt,
      updatedAt: timestamp
    };

    return {
      ...merged,
      status: deriveStatusFromBox(merged)
    };
  });

export const touchList = (list: WordList): WordList => ({
  ...list,
  updatedAt: now()
});
