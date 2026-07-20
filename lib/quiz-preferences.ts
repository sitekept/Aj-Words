import type { QuizDirection } from "@/types/vocabulary";

// Per-list quiz preferences (currently just the prompt direction), stored
// separately from list data so clearing or syncing lists never loses them.
const QUIZ_PREFS_STORAGE_KEY = "ajwords.v1.quizPrefs";

interface StoredQuizPrefs {
  direction?: unknown;
}

type StoredQuizPrefsMap = Record<string, StoredQuizPrefs>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeDirection = (value: unknown): QuizDirection =>
  value === "reverse" ? "reverse" : "forward";

const readPrefsMap = (): StoredQuizPrefsMap => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(QUIZ_PREFS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return isRecord(parsed) ? (parsed as StoredQuizPrefsMap) : {};
  } catch {
    return {};
  }
};

export const readQuizDirection = (listId: string): QuizDirection => {
  const entry = readPrefsMap()[listId];
  return normalizeDirection(isRecord(entry) ? entry.direction : undefined);
};

export const writeQuizDirection = (listId: string, direction: QuizDirection) => {
  if (typeof window === "undefined") {
    return;
  }

  const prefs = readPrefsMap();
  const entry = prefs[listId];

  prefs[listId] = {
    ...(isRecord(entry) ? entry : {}),
    direction
  };

  try {
    window.localStorage.setItem(QUIZ_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Preferences are non-critical; losing one beats surfacing a storage error.
  }
};
