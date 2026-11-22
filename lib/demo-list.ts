// The one list a brand-new install starts with, so the quiz and flashcard modes
// can be tried before typing anything in. It is deliberately NOT a builtin
// list: builtins are read-only and `deleteList` refuses them
// (lib/useVocabularyStore.ts), which would leave it stuck in every tester's
// library forever. This is an ordinary local list — editable, and deletable.
//
// The id is fixed rather than generated. Once the tester touches anything the
// store persists the library, so on the next load `worddeck.v1.lists` exists
// and `loadLists` stops seeding; deleting the demo persists `[]`, which is
// equally truthy. That is why no "already seeded" flag is needed. A stable id
// also means an untouched demo cannot be duplicated across reloads.
//
// Only the raw content lives here. The list itself is assembled by
// `createList` in lib/vocabulary-storage.ts — the same helper the app uses when
// a user creates a list — so the data model stays in one place and this module
// needs no import from the storage module (which would be circular).
export const DEMO_LIST_ID = "demo-en-fr-v1";

export const DEMO_LIST_TITLE = "Démo — anglais › français";

export const DEMO_LIST_LANGUAGE = "Anglais / Français";

export const DEMO_LIST_PAIRS: Array<{ word: string; translation: string }> = [
  { word: "the word", translation: "le mot" },
  { word: "to learn", translation: "apprendre" },
  { word: "to remember", translation: "se souvenir" },
  { word: "the mistake", translation: "l'erreur" },
  { word: "the answer", translation: "la réponse" },
  { word: "the question", translation: "la question" },
  { word: "easy", translation: "facile" },
  { word: "difficult", translation: "difficile" },
  { word: "tomorrow", translation: "demain" },
  { word: "together", translation: "ensemble" },
  { word: "to try again", translation: "réessayer" },
  { word: "well done", translation: "bravo" }
];
