export type LearningStatus = "new" | "learning" | "mastered";

export type FlashcardAssessment = "learning" | "mastered";

export type QuizMode = "written" | "choice" | "mixed" | "test" | "full-review";

export type QuizQuestionType = "written" | "choice";

export interface VocabularyItem {
  id: string;
  word: string;
  translation: string;
  status: LearningStatus;
  attempts: number;
  correctCount: number;
  wrongCount: number;
  correctStreak: number;
  wrongStreak: number;
  lastTestedAt?: string;
  lastWrongAt?: string;
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

export interface TestHistoryEntry {
  id: string;
  mode: QuizMode;
  attempts: QuizAttempt[];
  correctCount: number;
  total: number;
  score: number;
  createdAt: string;
}
