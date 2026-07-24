// Optional per-item content fields (note, example, altAnswers, tags):
// normalization shared by every path that parses a VocabularyItem-shaped
// object (runtime storage, builtin compilation, and — mirrored in plain JS —
// scripts/import-phone-export.mjs).
//
// Pure and dependency-free on purpose: no "@/..." imports, so it stays
// importable under `node --test` (the alias only resolves through Next).

export interface ItemContentFields {
  note?: string;
  example?: string;
  altAnswers?: string[];
  tags?: string[];
}

const cleanText = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const cleanStringList = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const entries = Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );

  return entries.length ? entries : undefined;
};

/**
 * Returns only the content fields that are actually present and non-empty,
 * so spreading the result never materializes empty strings or arrays —
 * absent stays absent.
 */
export const normalizeContentFields = (item: {
  note?: unknown;
  example?: unknown;
  altAnswers?: unknown;
  tags?: unknown;
}): ItemContentFields => {
  const note = cleanText(item.note);
  const example = cleanText(item.example);
  const altAnswers = cleanStringList(item.altAnswers);
  const tags = cleanStringList(item.tags);

  return {
    ...(note ? { note } : {}),
    ...(example ? { example } : {}),
    ...(altAnswers ? { altAnswers } : {}),
    ...(tags ? { tags } : {})
  };
};
