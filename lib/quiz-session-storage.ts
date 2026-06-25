import type {
  QuizAttempt,
  QuizMode,
  QuizQuestionType,
  QuizSessionQuestion,
  QuizSessionState
} from "@/types/vocabulary";
import { isQuizMode } from "@/lib/quiz-modes";

const QUIZ_SESSION_STORAGE_KEY = "ajwords.v1.quizSessions";

type StoredQuizSessionMap = Record<string, QuizSessionState>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const storageKeyFor = (listId: string, mode: QuizMode) => `${listId}:${mode}`;

const isQuestionType = (value: unknown): value is QuizQuestionType =>
  value === "written" || value === "choice";

const normalizeOptions = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((option): option is string => typeof option === "string")
    : undefined;

const normalizeAttempt = (value: unknown): QuizAttempt | null => {
  if (!isRecord(value)) {
    return null;
  }

  return {
    itemId: typeof value.itemId === "string" ? value.itemId : "",
    questionType: value.questionType === "choice" ? "choice" : "written",
    prompt: typeof value.prompt === "string" ? value.prompt : "",
    correctAnswer:
      typeof value.correctAnswer === "string" ? value.correctAnswer : "",
    userAnswer: typeof value.userAnswer === "string" ? value.userAnswer : "",
    isCorrect: Boolean(value.isCorrect),
    options: normalizeOptions(value.options)
  };
};

const normalizeQuestion = (value: unknown): QuizSessionQuestion | null => {
  if (!isRecord(value) || typeof value.itemId !== "string") {
    return null;
  }

  return {
    itemId: value.itemId,
    type: isQuestionType(value.type) ? value.type : "written",
    options: normalizeOptions(value.options)
  };
};

const normalizeSession = (
  value: unknown,
  listId: string,
  mode: QuizMode
): QuizSessionState | null => {
  if (!isRecord(value) || value.listId !== listId || !isQuizMode(value.mode)) {
    return null;
  }

  const questions = Array.isArray(value.questions)
    ? value.questions
        .map(normalizeQuestion)
        .filter((question): question is QuizSessionQuestion => Boolean(question))
    : [];

  if (value.mode !== mode || !questions.length) {
    return null;
  }

  const attempts = Array.isArray(value.attempts)
    ? value.attempts
        .map(normalizeAttempt)
        .filter((attempt): attempt is QuizAttempt => Boolean(attempt))
    : [];
  const feedback = normalizeAttempt(value.feedback);
  const rawIndex = typeof value.index === "number" ? value.index : 0;

  return {
    attempts,
    feedback,
    index:
      Number.isFinite(rawIndex) && rawIndex >= 0
        ? Math.min(Math.floor(rawIndex), questions.length - 1)
        : 0,
    listId,
    mode,
    questions,
    selectedAnswer:
      typeof value.selectedAnswer === "string" ? value.selectedAnswer : "",
    typedAnswer: typeof value.typedAnswer === "string" ? value.typedAnswer : "",
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : ""
  };
};

const readSessionMap = (): StoredQuizSessionMap => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(QUIZ_SESSION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return isRecord(parsed) ? (parsed as StoredQuizSessionMap) : {};
  } catch {
    return {};
  }
};

const writeSessionMap = (sessions: StoredQuizSessionMap) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(QUIZ_SESSION_STORAGE_KEY, JSON.stringify(sessions));
};

export const readQuizSession = (listId: string, mode: QuizMode) => {
  const sessions = readSessionMap();
  return normalizeSession(sessions[storageKeyFor(listId, mode)], listId, mode);
};

export const writeQuizSession = (session: QuizSessionState) => {
  const sessions = readSessionMap();
  sessions[storageKeyFor(session.listId, session.mode)] = {
    ...session,
    updatedAt: new Date().toISOString()
  };
  writeSessionMap(sessions);
};

export const clearQuizSession = (listId: string, mode: QuizMode) => {
  const sessions = readSessionMap();
  delete sessions[storageKeyFor(listId, mode)];
  writeSessionMap(sessions);
};
