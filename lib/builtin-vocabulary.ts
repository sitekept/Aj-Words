import builtinVocabularyData from "@/lib/builtin-vocabulary-data.json";
import type { WordList } from "@/types/vocabulary";

const BUILTIN_CREATED_AT = "2026-04-30T00:00:00.000Z";

interface BuiltinVocabularyEntry {
  id: string;
  title: string;
  language?: string;
  source?: string;
  terms: Array<{
    word: string;
    translation: string;
  }>;
}

const builtinVocabulary = builtinVocabularyData as BuiltinVocabularyEntry[];

const makeItems = (
  listId: string,
  items: BuiltinVocabularyEntry["terms"]
): WordList["items"] =>
  items.map((item, index) => ({
    id: `${listId}-term-${String(index + 1).padStart(3, "0")}`,
    word: item.word,
    translation: item.translation,
    status: "new",
    createdAt: BUILTIN_CREATED_AT,
    updatedAt: BUILTIN_CREATED_AT
  }));

export const builtinLists: WordList[] = builtinVocabulary.map((list) => ({
  id: list.id,
  title: list.title,
  language: list.language,
  testHistory: [],
  createdAt: BUILTIN_CREATED_AT,
  updatedAt: BUILTIN_CREATED_AT,
  items: makeItems(list.id, list.terms)
}));

const builtinListsById = new Map(
  builtinLists.map((list) => [list.id, list])
);

export const getBuiltinList = (listId: string) =>
  builtinListsById.get(listId);

export const isBuiltinListId = (listId: string) =>
  builtinListsById.has(listId);
