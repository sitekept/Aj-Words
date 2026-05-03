import type {
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

const isStatus = (value: unknown): value is LearningStatus =>
  value === "new" || value === "learning" || value === "mastered";

const isQuizMode = (value: unknown): value is QuizMode =>
  value === "written" || value === "choice" || value === "mixed" || value === "test";

const normalizeItem = (item: Partial<VocabularyItem>): VocabularyItem => ({
  id: typeof item.id === "string" ? item.id : createId(),
  word: typeof item.word === "string" ? item.word : "",
  translation: typeof item.translation === "string" ? item.translation : "",
  status: isStatus(item.status) ? item.status : "new",
  createdAt: typeof item.createdAt === "string" ? item.createdAt : now(),
  updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : now()
});

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
    createdAt: timestamp,
    updatedAt: timestamp
  };
};

export const touchList = (list: WordList): WordList => ({
  ...list,
  updatedAt: now()
});
