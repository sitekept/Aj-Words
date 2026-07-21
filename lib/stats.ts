import type { ActivityLog } from "@/lib/activity-log";
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
// Exported so the activity heatmap (below) and lib/activity-log.ts agree on the
// same day boundaries.
export const startOfDay = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());

export const addCalendarDays = (dayStart: Date, days: number) =>
  new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + days);

export const toDateKey = (dayStart: Date) => {
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

// --- Activity heatmap (Anki-style) --------------------------------------

export type HeatmapIntensity = 0 | 1 | 2 | 3 | 4;

export interface HeatmapDay {
  /** YYYY-MM-DD for a real day in range, or "" for a future padding cell. */
  date: string;
  count: number;
  intensity: HeatmapIntensity;
  /** False for cells past today (kept for a rectangular grid). */
  inRange: boolean;
}

export interface HeatmapWeek {
  /** Seven cells, index 0 = Sunday. */
  days: HeatmapDay[];
}

export interface Heatmap {
  weeks: HeatmapWeek[];
  totalReviews: number;
  maxCount: number;
}

// Fixed thresholds (not relative to the max) so the palette doesn't flicker as
// a single big day rescales everything.
const intensityFor = (count: number): HeatmapIntensity => {
  if (count <= 0) {
    return 0;
  }
  if (count < 3) {
    return 1;
  }
  if (count < 6) {
    return 2;
  }
  if (count < 11) {
    return 3;
  }
  return 4;
};

/**
 * Build a GitHub/Anki-style grid: `weeks` columns of 7 rows (Sun..Sat), the
 * last column being the week that contains today. Cells after today are marked
 * `inRange: false` so the grid stays rectangular.
 */
export const activityHeatmap = (
  log: ActivityLog,
  nowIso: string,
  weeks = 53
): Heatmap => {
  const columns = Math.max(1, weeks);
  const today = startOfDay(new Date(nowIso));
  // Sunday of the current week, then step back to the first column's Sunday.
  const thisSunday = addCalendarDays(today, -today.getDay());
  const firstSunday = addCalendarDays(thisSunday, -(columns - 1) * 7);

  const grid: HeatmapWeek[] = [];
  let totalReviews = 0;
  let maxCount = 0;

  for (let w = 0; w < columns; w += 1) {
    const days: HeatmapDay[] = [];
    for (let d = 0; d < 7; d += 1) {
      const cell = addCalendarDays(firstSunday, w * 7 + d);
      const inRange = cell.getTime() <= today.getTime();
      const key = toDateKey(cell);
      const count = inRange ? log[key]?.reviews ?? 0 : 0;
      if (inRange) {
        totalReviews += count;
        maxCount = Math.max(maxCount, count);
      }
      days.push({
        date: inRange ? key : "",
        count,
        intensity: intensityFor(count),
        inRange
      });
    }
    grid.push({ days });
  }

  return { weeks: grid, totalReviews, maxCount };
};

/**
 * Current streak of consecutive active days, with forgiveness: a not-yet-active
 * TODAY does not break the streak (it is counted from yesterday), and a missed
 * day simply ends the streak — nothing punitive, no debt.
 */
export const activityStreak = (log: ActivityLog, nowIso: string): number => {
  const today = startOfDay(new Date(nowIso));
  let cursor =
    (log[toDateKey(today)]?.reviews ?? 0) > 0
      ? today
      : addCalendarDays(today, -1);

  let streak = 0;
  while ((log[toDateKey(cursor)]?.reviews ?? 0) > 0) {
    streak += 1;
    cursor = addCalendarDays(cursor, -1);
  }

  return streak;
};
