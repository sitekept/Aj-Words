// FSRS-5 spaced-repetition scheduler (pure, framework-free).
//
// FSRS models each card with two latent variables:
//   - stability (S): the number of days until recall probability decays to the
//     request retention (0.9 here);
//   - difficulty (D): 1..10, how hard the card is to make stick.
// Given the elapsed time since the last review and a grade, it returns the next
// S and D; the next interval follows from S and the target retention.
//
// In AJ Words this drives the scheduling of `dueAt` ONLY. The Leitner `box`
// counter (lib/srs.ts) is kept as the mastery scale that powers status,
// ProgressSummary and the tests — box still advances/retreats exactly as
// before; FSRS just decides WHEN the card comes back. See the FSRS ADR in
// docs/ARCHITECTURE.md.
//
// No "@/..." runtime imports, so it stays importable under `node --test`.

export type FsrsGrade = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

export interface FsrsState {
  stability: number;
  difficulty: number;
}

// FSRS-5 default parameters (19 weights), from the published defaults.
export const DEFAULT_FSRS_WEIGHTS = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575,
  0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655,
  0.6621
] as const;

export const DEFAULT_REQUEST_RETENTION = 0.9;

const DECAY = -0.5;
// Forgetting-curve factor so that R(t=S) == 0.9 exactly.
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // ≈ 0.2345 (19/81)
const MIN_STABILITY = 0.01;
// A century. Stability is an interval in days, and it is *stored* on the card,
// so it can arrive from an imported file or a share link rather than from this
// module's own math. Without an upper bound, a hostile `stability: 1e308`
// makes intervalDays() return Infinity, and the caller's
// `new Date(now + interval * DAY_MS).toISOString()` throws a RangeError on the
// first review of that card. Any value past this is already "effectively
// never" for scheduling purposes.
export const MAX_STABILITY = 36500;
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 10;

type Weights = readonly number[];

const clampDifficulty = (value: number): number =>
  Number.isFinite(value)
    ? Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, value))
    : MIN_DIFFICULTY;

const clampStability = (value: number): number =>
  Number.isFinite(value) && value > MIN_STABILITY
    ? Math.min(MAX_STABILITY, value)
    : MIN_STABILITY;

const initialStability = (w: Weights, grade: FsrsGrade): number =>
  clampStability(w[grade - 1]);

const initialDifficulty = (w: Weights, grade: FsrsGrade): number =>
  clampDifficulty(w[4] - Math.exp(w[5] * (grade - 1)) + 1);

export const initialState = (
  grade: FsrsGrade,
  w: Weights = DEFAULT_FSRS_WEIGHTS
): FsrsState => ({
  stability: initialStability(w, grade),
  difficulty: initialDifficulty(w, grade)
});

// Recall probability after `elapsedDays` given the current stability.
const retrievability = (elapsedDays: number, stability: number): number =>
  Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY);

// Next difficulty: linear-damped delta plus mean reversion toward D_0(Easy).
const nextDifficulty = (w: Weights, d: number, grade: FsrsGrade): number => {
  const deltaD = -w[6] * (grade - 3);
  const damped = d + deltaD * ((10 - d) / 9);
  const reverted = w[7] * initialDifficulty(w, 4) + (1 - w[7]) * damped;
  return clampDifficulty(reverted);
};

const nextStabilityOnRecall = (
  w: Weights,
  d: number,
  s: number,
  r: number,
  grade: FsrsGrade
): number => {
  const hardPenalty = grade === 2 ? w[15] : 1;
  const easyBonus = grade === 4 ? w[16] : 1;
  const increment =
    Math.exp(w[8]) *
    (11 - d) *
    Math.pow(s, -w[9]) *
    (Math.exp(w[10] * (1 - r)) - 1) *
    hardPenalty *
    easyBonus;
  return clampStability(s * (1 + increment));
};

const nextStabilityOnForget = (
  w: Weights,
  d: number,
  s: number,
  r: number
): number => {
  const forgotten =
    w[11] *
    Math.pow(d, -w[12]) *
    (Math.pow(s + 1, w[13]) - 1) *
    Math.exp(w[14] * (1 - r));
  // A lapse must never increase stability above its pre-lapse value.
  return clampStability(Math.min(forgotten, s));
};

/**
 * Advance the FSRS state given a grade and the days elapsed since the last
 * review. `prev == null` means a brand-new card (first review).
 */
export const nextState = (
  prev: FsrsState | null,
  grade: FsrsGrade,
  elapsedDays: number,
  w: Weights = DEFAULT_FSRS_WEIGHTS
): FsrsState => {
  if (!prev) {
    return initialState(grade, w);
  }

  const difficulty = nextDifficulty(w, prev.difficulty, grade);
  const r = retrievability(elapsedDays, prev.stability);
  const stability =
    grade === 1
      ? nextStabilityOnForget(w, prev.difficulty, prev.stability, r)
      : nextStabilityOnRecall(w, prev.difficulty, prev.stability, r, grade);

  return { stability, difficulty };
};

/** Days until the card is due again for the target retention (at least 1). */
export const intervalDays = (
  stability: number,
  retention: number = DEFAULT_REQUEST_RETENTION
): number => {
  const s = clampStability(stability);
  const raw = (s / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return Math.max(1, Math.round(raw));
};
