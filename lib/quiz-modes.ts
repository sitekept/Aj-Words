export const QUIZ_MODES = [
  "written",
  "choice",
  "mixed",
  "test",
  "full-review",
  "review-due"
] as const;

export type QuizMode = (typeof QUIZ_MODES)[number];

const quizModeSet = new Set<string>(QUIZ_MODES);

export const isQuizMode = (value: unknown): value is QuizMode =>
  typeof value === "string" && quizModeSet.has(value);

export const normalizeQuizMode = (
  value: unknown,
  fallback: QuizMode = "test"
): QuizMode => (isQuizMode(value) ? value : fallback);
