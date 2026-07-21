import type { QuizMode } from "@/lib/quiz-modes";

export type LearningStatus = "new" | "learning" | "mastered";

export type FlashcardAssessment = "learning" | "mastered";

export type { QuizMode };

export type QuizQuestionType = "written" | "choice";

/**
 * Which side of a card is shown as the prompt: "forward" asks word -> translation
 * (the historical behavior), "reverse" asks translation -> word.
 */
export type QuizDirection = "forward" | "reverse";

export interface VocabularyItem {
  id: string;
  word: string;
  translation: string;
  /** Optional free-form note shown under the word pair. */
  note?: string;
  /** Optional example sentence. */
  example?: string;
  /** Extra accepted answers for the translation side (forward written quizzes). */
  altAnswers?: string[];
  /** Free-form organizational tags. */
  tags?: string[];
  /** Reference to a locally stored image blob in IndexedDB (lib/image-store.ts). */
  imageId?: string;
  /** External image URL, rendered directly; survives export/share (imageId does not). */
  imageUrl?: string;
  status: LearningStatus;
  attempts: number;
  correctCount: number;
  wrongCount: number;
  correctStreak: number;
  wrongStreak: number;
  lastTestedAt?: string;
  lastWrongAt?: string;
  // Spaced-repetition scheduling. `box` is the Leitner mastery scale (lib/srs.ts)
  // that drives status; `dueAt` is scheduled by FSRS (lib/fsrs.ts). `stability`
  // and `difficulty` are the FSRS card state — optional: absent on brand-new
  // cards, inferred lazily on load for pre-FSRS data.
  box: number;
  dueAt: string;
  stability?: number;
  difficulty?: number;
  createdAt: string;
  updatedAt: string;
}

export interface WordList {
  id: string;
  title: string;
  language?: string;
  items: VocabularyItem[];
  testHistory: TestHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface ListProgress {
  total: number;
  mastered: number;
  learning: number;
  fresh: number;
}

export interface QuizAttempt {
  itemId: string;
  questionType: QuizQuestionType;
  prompt: string;
  correctAnswer: string;
  userAnswer: string;
  isCorrect: boolean;
  options?: string[];
}

export interface QuizSessionQuestion {
  itemId: string;
  type: QuizQuestionType;
  options?: string[];
}

export interface QuizSessionState {
  attempts: QuizAttempt[];
  /** Missing on sessions saved before directions existed; treated as "forward". */
  direction?: QuizDirection;
  feedback: QuizAttempt | null;
  index: number;
  listId: string;
  mode: QuizMode;
  questions: QuizSessionQuestion[];
  selectedAnswer: string;
  typedAnswer: string;
  updatedAt: string;
}

export interface TestHistoryEntry {
  id: string;
  mode: QuizMode;
  attempts: QuizAttempt[];
  correctCount: number;
  total: number;
  score: number;
  createdAt: string;
}
