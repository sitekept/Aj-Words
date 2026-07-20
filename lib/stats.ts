import type { TestHistoryEntry, VocabularyItem } from "@/types/vocabulary";

// Progress-statistics helpers (pure, framework-free).
//
// These feed the compact stat blocks rendered above the test-history rows:
// a per-session score series, the words the learner misses most, and a
// short-range forecast of how many cards come due each day.

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SessionPoint {
  id: string;
  createdAt: string;
  score: number;
  total: number;
}

// Test history is stored NEWEST-FIRST (the store prepends, capped at 30).
// Charts read left-to-right, so return the series oldest-first.
export const sessionSuccessSeries = (
  entries: TestHistoryEntry[]
): SessionPoint[] =>
  [...entries].reverse().map((entry) => ({
    id: entry.id,
    createdAt: entry.createdAt,
    score: entry.score,
    total: entry.total
  }));

export interface HardWord {
  item: VocabularyItem;
  wrongCount: number;
  wrongStreak: number;
}

// The words the learner actually struggles with: tested at least once and
// missed at least once. Most-missed first; a current wrong streak breaks
// ties; otherwise the original list order is kept (Array.sort is stable).
export const hardestWords = (
  items: VocabularyItem[],
  limit = 5
): HardWord[] =>
  items
    .filter((item) => item.attempts > 0 && item.wrongCount > 0)
    .map((item) => ({
      item,
      wrongCount: item.wrongCount,
      wrongStreak: item.wrongStreak
    }))
    .sort(
      (a, b) => b.wrongCount - a.wrongCount || b.wrongStreak - a.wrongStreak
    )
    .slice(0, Math.max(0, limit));

export interface DueBucket {
  date: string;
  label: string;
  count: number;
}

// Local calendar-day helpers. Buckets follow the learner's wall clock, and
// stepping via date components (not raw ms) keeps DST shifts harmless.
const startOfDay = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());

const addCalendarDays = (dayStart: Date, days: number) =>
  new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + days);

const toDateKey = (dayStart: Date) => {
  const month = String(dayStart.getMonth() + 1).padStart(2, "0");
  const day = String(dayStart.getDate()).padStart(2, "0");
  return `${dayStart.getFullYear()}-${month}-${day}`;
};

const bucketLabel = (dayStart: Date, index: number) => {
  if (index === 0) {
    return "Today";
  }

  if (index === 1) {
    return "Tomorrow";
  }

  // Within a week the weekday is unambiguous; beyond that fall back to M/D.
  if (index < 7) {
    return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(
      dayStart
    );
  }

  return `${dayStart.getMonth() + 1}/${dayStart.getDate()}`;
};

// Count how many cards come due on each of the next `days` calendar days.
// Anything overdue — plus missing/invalid due dates, which the SRS treats as
// due now — folds into day 0 ("Today"). Cards due beyond the window are
// omitted; they are not review work yet.
export const dueByDay = (
  items: VocabularyItem[],
  nowIso: string,
  days = 7
): DueBucket[] => {
  const dayStart = startOfDay(new Date(nowIso));
  const buckets = Array.from({ length: Math.max(0, days) }, (_, index) => {
    const bucketStart = addCalendarDays(dayStart, index);
    return {
      date: toDateKey(bucketStart),
      label: bucketLabel(bucketStart, index),
      count: 0
    };
  });

  if (!buckets.length) {
    return buckets;
  }

  for (const item of items) {
    const due = new Date(item.dueAt ?? "").getTime();
    // Both endpoints are local midnights, so the rounded ms difference is an
    // exact day count even across a DST hour.
    const offset = Number.isFinite(due)
      ? Math.round((startOfDay(new Date(due)).getTime() - dayStart.getTime()) / DAY_MS)
      : 0;

    if (offset >= buckets.length) {
      continue;
    }

    buckets[Math.max(0, offset)].count += 1;
  }

  return buckets;
};
