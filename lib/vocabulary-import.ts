export interface ImportedTerm {
  word: string;
  translation: string;
}

export interface TermImportResult {
  terms: ImportedTerm[];
  invalidLineNumbers: number[];
}

export const parseQuizletTerms = (input: string): TermImportResult => {
  const terms: ImportedTerm[] = [];
  const invalidLineNumbers: number[] = [];

  input.split(/\r?\n/).forEach((rawLine, index) => {
    if (!rawLine.trim()) {
      return;
    }

    const [wordPart, ...translationParts] = rawLine.split("\t");
    const word = wordPart?.trim() ?? "";
    const translation = translationParts.join("\t").trim();

    if (!word || !translation) {
      invalidLineNumbers.push(index + 1);
      return;
    }

    terms.push({ word, translation });
  });

  return { terms, invalidLineNumbers };
};
