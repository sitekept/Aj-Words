// Multiple-choice option building: which distractors a choice question shows,
// and whether a list can support choice questions at all.
//
// Two things make this non-trivial enough to live outside the component:
//
// 1. Distinct answers, not distinct cards. Two cards can carry the same answer
//    on the graded side — real cases ship in the bundled data ("Ou" and
//    "Habiter" each appear twice in Mots Darija, "קשר" twice in יחידה 2). A
//    distractor equal to the correct answer must be dropped *before* the draw,
//    otherwise deduping at the end silently yields a 3-option question.
// 2. Plausible distractors. Drawing at random makes the odd one out obvious
//    (a Hebrew word among three English ones, a 3-letter word among three
//    long sentences). Candidates are ranked by similarity to the correct
//    answer first.
//
// Comparisons run on the folded form from lib/answer-matching (accents, niqqud
// and quotes ignored), so two options can never differ by something the answer
// checker itself would treat as identical.

// Relative + explicit extension: this module is pulled in by `node --test`,
// whose ESM resolver handles neither the "@/" alias nor extensionless paths.
// Type-only imports are erased before Node sees them, so they may still use "@/".
import { foldAnswer, levenshtein } from "./answer-matching.ts";
import type { QuizDirection, VocabularyItem } from "@/types/vocabulary";

export const CHOICE_OPTION_COUNT = 4;
const DISTRACTOR_COUNT = CHOICE_OPTION_COUNT - 1;

// Rank by similarity, then draw from a pool wider than we need: the three
// distractors stay plausible without being identical on every re-run of the
// same card.
const CANDIDATE_POOL_SIZE = 8;

export const shuffle = <T,>(values: T[]): T[] => {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
};

/** The side of the card the answer is graded against. */
export const answerFor = (
  item: Pick<VocabularyItem, "word" | "translation">,
  direction: QuizDirection
): string => (direction === "reverse" ? item.word : item.translation);

const scriptOf = (value: string): string => {
  for (const char of value) {
    if (/\p{Script=Hebrew}/u.test(char)) {
      return "hebrew";
    }
    if (/\p{Script=Arabic}/u.test(char)) {
      return "arabic";
    }
    if (/\p{Script=Latin}/u.test(char)) {
      return "latin";
    }
  }
  return "other";
};

/**
 * How plausible `candidate` is as a distractor for `target`, in [0, 1].
 * Blends edit distance, length proximity, shared prefix and script match —
 * the four cues that make a wrong option worth reading rather than obviously
 * discardable. Higher is more similar.
 */
export const similarityScore = (target: string, candidate: string): number => {
  const foldedTarget = foldAnswer(target);
  const foldedCandidate = foldAnswer(candidate);
  if (!foldedTarget || !foldedCandidate) {
    return 0;
  }

  const targetChars = Array.from(foldedTarget);
  const candidateChars = Array.from(foldedCandidate);
  const maxLength = Math.max(targetChars.length, candidateChars.length);

  const editSimilarity =
    1 - levenshtein(foldedTarget, foldedCandidate) / maxLength;
  const lengthSimilarity =
    1 - Math.abs(targetChars.length - candidateChars.length) / maxLength;

  let prefix = 0;
  while (
    prefix < targetChars.length &&
    prefix < candidateChars.length &&
    targetChars[prefix] === candidateChars[prefix]
  ) {
    prefix += 1;
  }
  const prefixSimilarity = prefix / maxLength;
  const scriptSimilarity =
    scriptOf(foldedTarget) === scriptOf(foldedCandidate) ? 1 : 0;

  return (
    editSimilarity * 0.4 +
    lengthSimilarity * 0.25 +
    prefixSimilarity * 0.2 +
    scriptSimilarity * 0.15
  );
};

/** Distinct answers available on the graded side, compared folded. */
export const countDistinctAnswers = (
  items: VocabularyItem[],
  direction: QuizDirection
): number => {
  const seen = new Set<string>();
  for (const item of items) {
    const key = foldAnswer(answerFor(item, direction));
    if (key) {
      seen.add(key);
    }
  }
  return seen.size;
};

/**
 * Whether choice questions are possible for this list *in this direction*.
 * Counting items would over-promise: four cards sharing three translations
 * cannot fill four distinct options.
 */
export const canUseChoice = (
  items: VocabularyItem[],
  direction: QuizDirection
): boolean => countDistinctAnswers(items, direction) >= CHOICE_OPTION_COUNT;

/**
 * The options for one choice question, already shuffled. Always contains the
 * correct answer, and holds CHOICE_OPTION_COUNT distinct entries whenever the
 * list offers that many distinct answers (fewer only when it genuinely can't).
 *
 * `shuffleFn` is injectable so tests can pin the ordering.
 */
export const buildOptions = (
  item: VocabularyItem,
  items: VocabularyItem[],
  direction: QuizDirection,
  shuffleFn: <T>(values: T[]) => T[] = shuffle
): string[] => {
  const correct = answerFor(item, direction);
  const correctKey = foldAnswer(correct);

  // Seeded with the correct answer so an equal-but-different-card candidate is
  // rejected here, not silently absorbed by a dedupe after the draw.
  const seen = new Set<string>([correctKey]);
  const candidates: string[] = [];

  for (const candidate of items) {
    if (candidate.id === item.id) {
      continue;
    }

    const value = answerFor(candidate, direction);
    const key = foldAnswer(value);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    candidates.push(value);
  }

  const pool = candidates
    .map((value) => ({ value, score: similarityScore(correct, value) }))
    // localeCompare breaks score ties deterministically, so the pool itself
    // never depends on the incoming item order.
    .sort((first, second) =>
      second.score !== first.score
        ? second.score - first.score
        : first.value.localeCompare(second.value)
    )
    .slice(0, CANDIDATE_POOL_SIZE)
    .map((entry) => entry.value);

  const distractors = shuffleFn(pool).slice(0, DISTRACTOR_COUNT);

  return shuffleFn([correct, ...distractors]);
};
