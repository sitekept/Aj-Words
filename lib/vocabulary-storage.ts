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
import { normalizeContentFields } from "./item-content";
import { isQuizMode } from "@/lib/quiz-modes";
import { readLatestBackup, writeRotatingBackup } from "@/lib/local-backup";
import { createPersistedLists } from "@/lib/vocabulary-persistence";
import {
  clampBox,
  deriveStatusFromBox,
  inferSrsFromLegacy,
  initialSrs,
  LEITNER_INTERVALS,
  scheduleNext
} from "@/lib/srs";
import {
  intervalDays,
  MAX_STABILITY,
  nextState as fsrsNextState,
  type FsrsGrade,
  type FsrsState
} from "@/lib/fsrs";

const STORAGE_KEY = "worddeck.v1.lists";
const DAY_MS = 24 * 60 * 60 * 1000;
export const EXPORT_APP_ID = "aj-words";
export const EXPORT_VERSION = 1;

// Import ceilings. For scale: an export of everything AJ Words ships — 19
// lists, 1080 items, full progress — is about 0.7 MB. These bound the work
// done on a hostile file without getting in a real user's way.
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_LISTS = 500;
export const MAX_IMPORT_ITEMS_PER_LIST = 50000;

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

const normalizeCount = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;

// A date field is only kept if it actually parses. Accepting any non-empty
// string let an imported "banana" through as a dueAt/lastTestedAt, which then
// silently poisoned every date comparison downstream.
const normalizeDate = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  return Number.isFinite(new Date(value).getTime()) ? value : undefined;
};

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

// --- FSRS scheduling helpers --------------------------------------------
// FSRS (lib/fsrs.ts) decides WHEN a card is due (dueAt); the Leitner box stays
// the mastery scale that drives status (see the FSRS ADR in docs/ARCHITECTURE).

const elapsedDaysSince = (
  lastTestedAt: string | undefined,
  nowIso: string
): number => {
  if (!lastTestedAt) {
    return 0;
  }

  const prev = new Date(lastTestedAt).getTime();
  const current = new Date(nowIso).getTime();
  if (!Number.isFinite(prev) || !Number.isFinite(current)) {
    return 0;
  }

  return Math.max(0, (current - prev) / DAY_MS);
};

const readFsrsState = (
  item: Pick<VocabularyItem, "stability" | "difficulty">
): FsrsState | null =>
  typeof item.stability === "number" &&
  Number.isFinite(item.stability) &&
  item.stability > 0 &&
  typeof item.difficulty === "number" &&
  Number.isFinite(item.difficulty)
    ? { stability: item.stability, difficulty: item.difficulty }
    : null;

// One review outcome → the next box (Leitner, unchanged), dueAt (FSRS) and the
// FSRS card state. A correct answer maps to Good, a miss to Again; the finer
// Hard/Easy grades are reserved (they aren't derivable from a boolean attempt).
const advanceSchedule = (
  item: VocabularyItem,
  correct: boolean,
  timestamp: string
): Pick<VocabularyItem, "box" | "dueAt" | "stability" | "difficulty"> => {
  const box = scheduleNext(item.box, correct, timestamp).box;
  const grade: FsrsGrade = correct ? 3 : 1;
  const state = fsrsNextState(
    readFsrsState(item),
    grade,
    elapsedDaysSince(item.lastTestedAt, timestamp)
  );
  // Belt and braces: fsrs clamps stability, but this date is the one place a
  // bad number would surface as a thrown RangeError rather than a wrong value.
  const dueMs =
    new Date(timestamp).getTime() + intervalDays(state.stability) * DAY_MS;
  const dueAt = Number.isFinite(dueMs)
    ? new Date(dueMs).toISOString()
    : timestamp;

  return {
    box,
    dueAt,
    stability: state.stability,
    difficulty: state.difficulty
  };
};

// Lazy migration of pre-FSRS cards. A card with an explicit finite state keeps
// it; a brand-new (untouched) card gets none (first review initializes it); a
// legacy card with counters gets a state inferred from its Leitner box and
// miss count — WITHOUT ever moving its existing dueAt.
const normalizeFsrsFields = (
  item: Partial<VocabularyItem>,
  box: number,
  wrongCount: number,
  hasStats: boolean
): { stability?: number; difficulty?: number } => {
  if (
    typeof item.stability === "number" &&
    Number.isFinite(item.stability) &&
    item.stability > 0 &&
    typeof item.difficulty === "number" &&
    Number.isFinite(item.difficulty)
  ) {
    return {
      // Bound on the way in as well as on the way out: this value is persisted,
      // so an imported card would otherwise carry an absurd stability forever.
      stability: Math.min(MAX_STABILITY, item.stability),
      difficulty: Math.min(10, Math.max(1, item.difficulty))
    };
  }

  if (!hasStats) {
    return {};
  }

  const interval = LEITNER_INTERVALS[clampBox(box)] ?? 0;
  const stability = interval > 0 ? interval : 1;
  const difficulty = Math.min(10, Math.max(1, 5 + Math.min(10, wrongCount) * 0.5));
  return { stability, difficulty };
};

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
    // Optional content fields survive only when present and non-empty; the
    // conditional spread keeps absent fields absent.
    ...normalizeContentFields(item),
    box: srs.box,
    dueAt: srs.dueAt,
    // FSRS state: kept if present, inferred for legacy cards, absent for new
    // ones — never disturbing the dueAt computed above.
    ...normalizeFsrsFields(item, srs.box, normalized.wrongCount, hasStats),
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
        stability: storedItem.stability,
        difficulty: storedItem.difficulty,
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

// A locally stored image blob (imageId → IndexedDB) can't travel in a JSON
// export or a share link, and binary would blow the backup/URL size budgets.
// Drop imageId on the way out; external imageUrl survives.
const stripDeviceLocalImage = (list: WordList): WordList => {
  if (!list.items.some((item) => item.imageId)) {
    return list;
  }

  return {
    ...list,
    items: list.items.map((item) => {
      if (!item.imageId) {
        return item;
      }
      const copy = { ...item };
      delete copy.imageId;
      return copy;
    })
  };
};

export const createExportPayload = (lists: WordList[]): VocabularyExportFile => ({
  app: EXPORT_APP_ID,
  version: EXPORT_VERSION,
  exportedAt: now(),
  lists: lists.map((list) => stripDeviceLocalImage(normalizeList(list)))
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

  if (!payload.lists.length) {
    // Rejected here rather than at the call site, so the share-link path gets
    // the same guard as the file-import path.
    throw new Error("This export does not contain any lists.");
  }

  if (payload.lists.length > MAX_IMPORT_LISTS) {
    throw new Error(
      `This export holds more than ${MAX_IMPORT_LISTS} lists, which is more than AJ Words can import at once.`
    );
  }

  const oversized = payload.lists.find(
    (list) => isRecord(list) && Array.isArray(list.items) && list.items.length > MAX_IMPORT_ITEMS_PER_LIST
  );
  if (oversized) {
    throw new Error(
      `One of these lists holds more than ${MAX_IMPORT_ITEMS_PER_LIST} words, which is more than AJ Words can import.`
    );
  }

  const lists = payload.lists.map((list) =>
    normalizeList(isRecord(list) ? (list as Partial<WordList>) : {})
  );

  // A single file carrying the same list id twice used to let the later copy
  // silently win. Keep the first and re-id the rest, so nothing is lost.
  const seenIds = new Set<string>();
  return {
    lists: lists.map((list) => {
      if (!seenIds.has(list.id)) {
        seenIds.add(list.id);
        return list;
      }

      const deduped = { ...list, id: createId() };
      seenIds.add(deduped.id);
      return deduped;
    })
  };
};

const mergeStoredLists = (storedLists: WordList[]): WordList[] => {
  const storedById = new Map(storedLists.map((list) => [list.id, list]));
  const publicLists = initialLists.map((list) => {
    const storedList = storedById.get(list.id);
    return storedList ? mergeBuiltinListWithLocalState(storedList) : list;
  });
  const localLists = storedLists.filter((list) => !isPublicListId(list.id));

  return [...publicLists, ...localLists];
};

const loadListsFromBackup = (): WordList[] | null => {
  try {
    const backup = readLatestBackup(window.localStorage);
    if (!backup) {
      return null;
    }

    const { lists } = parseExportPayload(JSON.parse(backup));
    return lists.length ? mergeStoredLists(lists) : null;
  } catch {
    return null;
  }
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
      return loadListsFromBackup() ?? initialLists;
    }

    return mergeStoredLists(parsed.map(normalizeList));
  } catch {
    return loadListsFromBackup() ?? initialLists;
  }
};

export type SaveResult = { ok: true } | { ok: false; message: string };

const looksLikeQuotaError = (error: unknown) =>
  isRecord(error) &&
  (error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error.code === 22 ||
    error.code === 1014);

export const saveLists = (lists: WordList[]): SaveResult => {
  if (typeof window === "undefined") {
    return { ok: true };
  }

  const persistedLists = createPersistedLists(lists, isPublicListId, getBuiltinList);

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedLists));
  } catch (error) {
    return {
      ok: false,
      message: looksLikeQuotaError(error)
        ? "Your browser storage is full, so the latest changes could not be saved. Export your lists to keep them safe, then free up space."
        : "The latest changes could not be saved to browser storage. Export your lists to keep them safe."
    };
  }

  // Best-effort rotating backup, only after the main write landed and only
  // when there is user data worth keeping (untouched builtins persist empty).
  // Backing up only the persisted lists keeps untouched builtin content —
  // already compiled into the app bundle — out of the localStorage quota.
  if (persistedLists.length) {
    try {
      const persistedIds = new Set(persistedLists.map((list) => list.id));
      writeRotatingBackup(
        window.localStorage,
        JSON.stringify(
          createExportPayload(lists.filter((list) => persistedIds.has(list.id)))
        ),
        now()
      );
    } catch {
      // Backups must never affect the save result.
    }
  }

  return { ok: true };
};

export const getProgress = (items: VocabularyItem[]): ListProgress => ({
  total: items.length,
  mastered: items.filter((item) => item.status === "mastered").length,
  learning: items.filter((item) => item.status === "learning").length,
  fresh: items.filter((item) => item.status === "new").length
});

export interface CreateItemInput {
  word: string;
  translation: string;
  note?: string;
  example?: string;
  altAnswers?: string[];
  tags?: string[];
  imageId?: string;
  imageUrl?: string;
}

export const createList = (input: {
  title: string;
  language?: string;
  items?: CreateItemInput[];
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
      ...normalizeContentFields(item),
      status: "new" as const,
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

export const createItem = (input: CreateItemInput): VocabularyItem => {
  const timestamp = now();

  return {
    id: createId(),
    word: input.word.trim(),
    translation: input.translation.trim(),
    ...normalizeContentFields(input),
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
      const schedule = advanceSchedule(nextItem, attempt.isCorrect, timestamp);
      const merged = {
        ...nextItem,
        ...counters,
        box: schedule.box,
        dueAt: schedule.dueAt,
        stability: schedule.stability,
        difficulty: schedule.difficulty,
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
    const schedule = advanceSchedule(item, correct, timestamp);
    const merged = {
      ...item,
      ...counters,
      box: schedule.box,
      dueAt: schedule.dueAt,
      stability: schedule.stability,
      difficulty: schedule.difficulty,
      updatedAt: timestamp
    };

    return {
      ...merged,
      status: deriveStatusFromBox(merged)
    };
  });

/**
 * Clears all learning state from a list's items, returning every card to the
 * state a freshly created one has: no counters, box 0, due now, no FSRS state,
 * status "new". Card *content* (word, translation, note, example, tags,
 * images) is untouched.
 *
 * Note the deletes: `stability`/`difficulty`/`lastTestedAt`/`lastWrongAt` are
 * optional fields, and leaving them at 0/undefined-but-present would make
 * normalizeItem treat the card as legacy-with-progress on the next load and
 * infer a box back onto it.
 */
export const resetItemsProgress = (
  items: VocabularyItem[]
): VocabularyItem[] => {
  const timestamp = now();

  return items.map((item) => {
    const reset = {
      ...item,
      ...createInitialProgress(),
      box: 0,
      // Back to the card's own creation instant, the way createItem leaves a
      // fresh card. A past dueAt reads as due immediately, which is what a
      // reset card should be, and it keeps builtin cards closer to their
      // baseline than a fresh `now` would.
      dueAt: item.createdAt,
      status: "new" as LearningStatus,
      updatedAt: timestamp
    };

    delete reset.lastTestedAt;
    delete reset.lastWrongAt;
    delete reset.stability;
    delete reset.difficulty;

    return reset;
  });
};

// Restores a previously captured item snapshot verbatim (flashcard undo).
export const replaceItemInList = (
  items: VocabularyItem[],
  snapshot: VocabularyItem
): VocabularyItem[] =>
  items.map((item) => (item.id === snapshot.id ? snapshot : item));

export const touchList = (list: WordList): WordList => ({
  ...list,
  updatedAt: now()
});
