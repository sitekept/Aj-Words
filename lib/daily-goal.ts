// Optional daily-review goal (pure, framework-free). OFF by default.
//
// A gentle target, never a punishment: there is no streak debt, no "missed"
// counter, no catch-up. The goal only powers a discreet "n / target today"
// readout next to the heatmap. Stored apart from list data, mirroring
// lib/quiz-preferences.ts. No "@/..." runtime imports (testable under
// `node --test`).

const DAILY_GOAL_STORAGE_KEY = "ajwords.v1.dailyGoal";
const MIN_TARGET = 5;
const MAX_TARGET = 200;
const DEFAULT_TARGET = 20;

export const DAILY_GOAL_BOUNDS = {
  min: MIN_TARGET,
  max: MAX_TARGET,
  default: DEFAULT_TARGET
} as const;

export interface DailyGoal {
  enabled: boolean;
  target: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const clampTarget = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_TARGET;
  }

  return Math.min(MAX_TARGET, Math.max(MIN_TARGET, Math.round(value)));
};

export const readDailyGoal = (): DailyGoal => {
  if (typeof window === "undefined") {
    return { enabled: false, target: DEFAULT_TARGET };
  }

  try {
    const raw = window.localStorage.getItem(DAILY_GOAL_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!isRecord(parsed)) {
      return { enabled: false, target: DEFAULT_TARGET };
    }

    return {
      enabled: parsed.enabled === true,
      target: clampTarget(parsed.target)
    };
  } catch {
    return { enabled: false, target: DEFAULT_TARGET };
  }
};

export const writeDailyGoal = (goal: DailyGoal): void => {
  if (typeof window === "undefined") {
    return;
  }

  const normalized: DailyGoal = {
    enabled: goal.enabled === true,
    target: clampTarget(goal.target)
  };

  try {
    window.localStorage.setItem(
      DAILY_GOAL_STORAGE_KEY,
      JSON.stringify(normalized)
    );
  } catch {
    // Non-critical preference; losing it beats surfacing a storage error.
  }
};
