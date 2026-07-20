// Tolerant answer matching for written quiz questions: accent/niqqud folding,
// synonym alternatives ("בטן, כרס"), quote-insensitive Hebrew abbreviations
// (חו"ל), and a small typo allowance with a character diff for misses.

export type AnswerVerdict = "correct" | "correct-typo" | "incorrect";

export interface AnswerCheckResult {
  verdict: AnswerVerdict;
  matchedAnswer: string;
  distance: number;
}

export interface DiffSegment {
  char: string;
  kind: "match" | "wrong" | "missing" | "extra";
}

// Straight/curly quotes plus Hebrew geresh (U+05F3) and gershayim (U+05F4).
// Stripped anywhere in the string: Hebrew abbreviations embed them mid-word.
const QUOTE_CHARS = new Set([
  '"',
  "'",
  "`",
  "´",
  "‘",
  "’",
  "“",
  "”",
  "׳",
  "״"
]);

// Terminal punctuation is only stripped at the edges of the folded string.
const TERMINAL_PUNCTUATION = new Set([".", "!", "?", "…", ",", ";", ":"]);

const SEGMENT_SEPARATORS = /[,;\/]/;
const PARENTHETICAL = /\([^()]*\)/g;

interface FoldedChar {
  folded: string;
  raw: string;
}

// Per-code-point fold that remembers the original character, so diffAnswer can
// align on folded text but render the raw (accented, quoted) characters.
const foldChars = (value: string): FoldedChar[] => {
  const out: FoldedChar[] = [];

  for (const raw of value) {
    if (QUOTE_CHARS.has(raw)) {
      continue;
    }

    // NFD then drop combining marks: French accents and Hebrew niqqud.
    const base = raw.normalize("NFD").replace(/\p{M}/gu, "");
    if (!base) {
      continue;
    }

    if (/^\s+$/u.test(base)) {
      // Collapse whitespace runs and drop leading whitespace.
      if (out.length && out[out.length - 1].folded !== " ") {
        out.push({ folded: " ", raw: " " });
      }
      continue;
    }

    for (const folded of base.toLocaleLowerCase()) {
      out.push({ folded, raw });
    }
  }

  const isEdgeJunk = (entry: FoldedChar) =>
    entry.folded === " " || TERMINAL_PUNCTUATION.has(entry.folded);

  while (out.length && isEdgeJunk(out[out.length - 1])) {
    out.pop();
  }
  let start = 0;
  while (start < out.length && isEdgeJunk(out[start])) {
    start += 1;
  }

  return out.slice(start);
};

export const foldAnswer = (value: string): string =>
  foldChars(value)
    .map((entry) => entry.folded)
    .join("");

// Accepted variants for a target translation: the full target, each synonym
// segment (split on , ; /), the parenthetical-free forms, and any extra
// alternatives (future altAnswers hook). Deduped by folded form, empties out.
export const getAcceptedAnswers = (target: string, extra: string[] = []): string[] => {
  const withoutParens = target.replace(PARENTHETICAL, " ");
  const candidates = [
    target,
    ...target.split(SEGMENT_SEPARATORS),
    withoutParens,
    ...withoutParens.split(SEGMENT_SEPARATORS),
    ...extra
  ];

  const seen = new Set<string>();
  const variants: string[] = [];
  for (const candidate of candidates) {
    const raw = candidate.trim();
    const key = foldAnswer(raw);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    variants.push(raw);
  }

  return variants.length ? variants : [target];
};

export const levenshtein = (a: string, b: string): number => {
  const source = Array.from(a);
  const goal = Array.from(b);
  if (!source.length) {
    return goal.length;
  }
  if (!goal.length) {
    return source.length;
  }

  let previous = Array.from({ length: goal.length + 1 }, (_, index) => index);
  for (let i = 1; i <= source.length; i += 1) {
    const current = new Array<number>(goal.length + 1).fill(0);
    current[0] = i;
    for (let j = 1; j <= goal.length; j += 1) {
      const cost = source[i - 1] === goal[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );
    }
    previous = current;
  }

  return previous[goal.length];
};

export const typoToleranceFor = (length: number): number => {
  if (length <= 3) {
    return 0;
  }
  if (length <= 7) {
    return 1;
  }
  return Math.floor(length * 0.15);
};

export const checkAnswer = (
  userAnswer: string,
  target: string,
  extra?: string[]
): AnswerCheckResult => {
  const folded = foldAnswer(userAnswer);
  const variants = getAcceptedAnswers(target, extra);

  let closest: { variant: string; distance: number } | null = null;
  let typo: { variant: string; distance: number } | null = null;

  for (const variant of variants) {
    const variantFolded = foldAnswer(variant);
    if (variantFolded === folded) {
      return { verdict: "correct", matchedAnswer: variant, distance: 0 };
    }

    const distance = levenshtein(folded, variantFolded);
    if (!closest || distance < closest.distance) {
      closest = { variant, distance };
    }
    if (
      distance <= typoToleranceFor(Array.from(variantFolded).length) &&
      (!typo || distance < typo.distance)
    ) {
      typo = { variant, distance };
    }
  }

  if (typo) {
    return { verdict: "correct-typo", matchedAnswer: typo.variant, distance: typo.distance };
  }

  // `closest` is always set: getAcceptedAnswers never returns an empty array.
  return {
    verdict: "incorrect",
    matchedAnswer: closest?.variant ?? target,
    distance: closest?.distance ?? Array.from(folded).length
  };
};

// Character diff of the user's answer against the expected variant. Alignment
// runs on the folded code points (so accents/quotes never count as mistakes)
// while segments carry the raw characters for display.
export const diffAnswer = (userAnswer: string, expected: string): DiffSegment[] => {
  const user = foldChars(userAnswer);
  const goal = foldChars(expected);

  const dp: number[][] = Array.from({ length: user.length + 1 }, () =>
    new Array<number>(goal.length + 1).fill(0)
  );
  for (let i = 0; i <= user.length; i += 1) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= goal.length; j += 1) {
    dp[0][j] = j;
  }
  for (let i = 1; i <= user.length; i += 1) {
    for (let j = 1; j <= goal.length; j += 1) {
      const cost = user[i - 1].folded === goal[j - 1].folded ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  const segments: DiffSegment[] = [];
  let i = user.length;
  let j = goal.length;
  while (i > 0 || j > 0) {
    if (
      i > 0 &&
      j > 0 &&
      user[i - 1].folded === goal[j - 1].folded &&
      dp[i][j] === dp[i - 1][j - 1]
    ) {
      segments.push({ char: user[i - 1].raw, kind: "match" });
      i -= 1;
      j -= 1;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      segments.push({ char: user[i - 1].raw, kind: "wrong" });
      i -= 1;
      j -= 1;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      segments.push({ char: user[i - 1].raw, kind: "extra" });
      i -= 1;
    } else {
      segments.push({ char: goal[j - 1].raw, kind: "missing" });
      j -= 1;
    }
  }

  return segments.reverse();
};
