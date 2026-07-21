// Daily learning-activity journal (pure, framework-free).
//
// A single GLOBAL counter of "reviews" per calendar day, feeding the activity
// heatmap and the optional daily goal. Deliberately tiny: no streak and no
// "debt" is ever stored — a streak is recomputed from the day counts at render
// time (see lib/stats.ts activityStreak), so a missed day just ends a streak
// with nothing punitive to persist.
//
// Stored apart from list data (its own key), mirroring lib/quiz-preferences.ts:
// clearing or syncing lists never touches activity, and vice-versa. No
// "@/..." runtime imports, so it stays importable under `node --test`.

const ACTIVITY_LOG_STORAGE_KEY = "ajwords.v1.activityLog";
// Keep just over a year so the 53-week heatmap always has its window of data;
// older days are pruned on write to bound the footprint.
const RETENTION_DAYS = 53 * 7 + 1;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ActivityDay {
  reviews: number;
}

export type ActivityLog = Record<string, ActivityDay>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Local calendar-day key (YYYY-MM-DD) for an ISO instant, using the learner's
 * wall clock so day boundaries match what they see. Returns "" for an invalid
 * date.
 */
export const toDateKey = (iso: string): string => {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

const normalizeReviews = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value);
};

const normalizeLog = (parsed: unknown): ActivityLog => {
  if (!isRecord(parsed)) {
    return {};
  }

  const log: ActivityLog = {};
  for (const [key, entry] of Object.entries(parsed)) {
    const reviews = isRecord(entry) ? normalizeReviews(entry.reviews) : 0;
    if (reviews > 0) {
      log[key] = { reviews };
    }
  }

  return log;
};

export const readActivityLog = (): ActivityLog => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(ACTIVITY_LOG_STORAGE_KEY);
    return raw ? normalizeLog(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
};

// Drop days older than the retention window relative to `nowIso`.
const pruneLog = (log: ActivityLog, nowIso: string): ActivityLog => {
  const now = new Date(nowIso).getTime();
  if (!Number.isFinite(now)) {
    return log;
  }

  const cutoff = now - RETENTION_DAYS * DAY_MS;
  const pruned: ActivityLog = {};
  for (const [key, entry] of Object.entries(log)) {
    const dayTime = new Date(`${key}T00:00:00`).getTime();
    if (Number.isFinite(dayTime) && dayTime >= cutoff) {
      pruned[key] = entry;
    }
  }

  return pruned;
};

/**
 * Add `delta` reviews to today's count (negative for an undo). The day count
 * never drops below 0, empty days are removed, and any storage failure is
 * swallowed — activity data is non-critical.
 */
export const recordActivity = (delta: number, nowIso: string): void => {
  if (typeof window === "undefined" || !Number.isFinite(delta) || delta === 0) {
    return;
  }

  const key = toDateKey(nowIso);
  if (!key) {
    return;
  }

  const log = pruneLog(readActivityLog(), nowIso);
  const current = log[key]?.reviews ?? 0;
  const next = Math.max(0, current + Math.floor(delta));

  if (next > 0) {
    log[key] = { reviews: next };
  } else {
    delete log[key];
  }

  try {
    window.localStorage.setItem(ACTIVITY_LOG_STORAGE_KEY, JSON.stringify(log));
  } catch {
    // Losing a tick beats surfacing a storage error to the learner.
  }
};

export const readTodayCount = (nowIso: string): number => {
  const key = toDateKey(nowIso);
  return key ? readActivityLog()[key]?.reviews ?? 0 : 0;
};
