// Cloze ("fill in the blank") support. Several builtin lists store a full
// sentence containing a blank run of underscores in `translation` and the
// missing word in `word`. The quiz shows the sentence and asks for the word.
// This module is framework-free and safe to import from node tests.

/** A blank is any run of two or more underscores (a single one is just text). */
export const CLOZE_RE = /_{2,}/;

/** Display form every blank run is normalized to. */
export const CLOZE_BLANK = "______";

export const isClozeText = (text: string): boolean => CLOZE_RE.test(text);

/**
 * Normalizes every blank run in a cloze sentence to CLOZE_BLANK so prompts
 * render consistently regardless of how many underscores the source used.
 * Non-cloze text passes through untouched.
 */
export const getClozePrompt = (translation: string): string =>
  translation.replace(/_{2,}/g, CLOZE_BLANK);
