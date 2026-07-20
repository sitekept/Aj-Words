import type { LearningStatus, VocabularyItem } from "@/types/vocabulary";

// Leitner spaced-repetition engine (pure, framework-free).
//
// Each item lives in a "box". Box 0 holds brand-new and just-missed cards
// (review the same day); higher boxes are reviewed less and less often. A
// correct answer promotes a card one box (longer interval); a wrong answer
// demotes it one box (a gentle penalty). Status is always derived from the
// box — never trusted from stored input.

// Interval, in DAYS, until a card is due again once it REACHES each box.
// Boxes above MASTERED_BOX don't change status — they only keep stretching the
// interval for mature cards so a long-mastered word isn't resurfaced forever.
export const LEITNER_INTERVALS = [0, 1, 3, 7, 16, 35, 75, 150] as const;
export const MAX_BOX = LEITNER_INTERVALS.length - 1;
// Box at/after which a card counts as "mastered" (5 correct answers in a row).
export const MASTERED_BOX = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SrsSchedule {
  box: number;
  dueAt: string;
}

export const clampBox = (box: number) =>
  Number.isFinite(box) ? Math.min(Math.max(0, Math.floor(box)), MAX_BOX) : 0;

const addDays = (iso: string, days: number) =>
  new Date(new Date(iso).getTime() + days * DAY_MS).toISOString();

// Pure scheduler: from the current box + outcome, return the next box + due date.
export const scheduleNext = (
  currentBox: number,
  correct: boolean,
  now: string
): SrsSchedule => {
  if (correct) {
    const box = clampBox(currentBox + 1);
    return { box, dueAt: addDays(now, LEITNER_INTERVALS[box]) };
  }

  // Missed → demote one box (gentle penalty), due again right away.
  return { box: clampBox(currentBox - 1), dueAt: now };
};

export const isDue = (item: Pick<VocabularyItem, "dueAt">, now: string) => {
  if (!item.dueAt) {
    return true;
  }

  const due = new Date(item.dueAt).getTime();
  return !Number.isFinite(due) || due <= new Date(now).getTime();
};

export const getDueItems = (items: VocabularyItem[], now: string) =>
  items.filter((item) => isDue(item, now));

export const countDue = (items: VocabularyItem[], now: string) =>
  getDueItems(items, now).length;

export const deriveStatusFromBox = (
  item: Pick<VocabularyItem, "box" | "attempts">
): LearningStatus => {
  if (item.attempts <= 0) {
    return "new";
  }

  return clampBox(item.box) >= MASTERED_BOX ? "mastered" : "learning";
};

// Default SRS fields for a brand-new card (immediately available to study).
export const initialSrs = (now: string): SrsSchedule => ({ box: 0, dueAt: now });

// Map a pre-SRS card (counters only) onto a Leitner box. Surface everything
// immediately on first migration so nothing stays hidden.
export const inferSrsFromLegacy = (
  item: Pick<VocabularyItem, "attempts" | "correctStreak" | "wrongStreak">,
  now: string
): SrsSchedule => {
  if (item.attempts <= 0 || item.wrongStreak > 0) {
    return { box: 0, dueAt: now };
  }

  return { box: clampBox(item.correctStreak), dueAt: now };
};
