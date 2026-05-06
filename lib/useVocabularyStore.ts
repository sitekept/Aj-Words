"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyFlashcardAssessmentToItems,
  applyAttemptsToItems,
  createItem,
  createList,
  createLocalCopy,
  createTestHistoryEntry,
  isPublicListId,
  loadLists,
  saveLists,
  touchList
} from "@/lib/vocabulary-storage";
import type {
  FlashcardAssessment,
  QuizAttempt,
  QuizMode,
  WordList
} from "@/types/vocabulary";

export interface ListInput {
  title: string;
  language?: string;
  items?: Array<{
    word: string;
    translation: string;
  }>;
}

export interface WordInput {
  word: string;
  translation: string;
}

export interface ImportListsSummary {
  added: number;
  listIds: string[];
  replaced: number;
  total: number;
}

export interface ListMutationResult {
  copied: boolean;
  listId: string;
}

export interface DeleteListResult {
  deleted: boolean;
  isPublicList: boolean;
}

export const useVocabularyStore = () => {
  const [lists, setLists] = useState<WordList[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLists(loadLists());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      saveLists(lists);
    }
  }, [hydrated, lists]);

  const addList = useCallback((input: ListInput) => {
    const nextList = createList(input);
    setLists((current) => [nextList, ...current]);
    return nextList;
  }, []);

  const updateList = useCallback((listId: string, input: ListInput): ListMutationResult => {
    const sourceList = lists.find((list) => list.id === listId);

    if (sourceList && isPublicListId(sourceList.id)) {
      const copy = touchList({
        ...createLocalCopy(sourceList),
        title: input.title.trim(),
        language: input.language?.trim()
      });

      setLists((current) => [copy, ...current]);
      return { copied: true, listId: copy.id };
    }

    setLists((current) =>
      current.map((list) =>
        list.id === listId
          ? (() => {
              const nextList = {
                ...list,
                title: input.title.trim(),
                language: input.language?.trim()
              } as WordList & { description?: string };

              delete nextList.description;
              return touchList(nextList);
            })()
          : list
      )
    );
    return { copied: false, listId };
  }, [lists]);

  const deleteList = useCallback((listId: string): DeleteListResult => {
    if (isPublicListId(listId)) {
      return { deleted: false, isPublicList: true };
    }

    setLists((current) => current.filter((list) => list.id !== listId));
    return { deleted: true, isPublicList: false };
  }, []);

  const addWord = useCallback((listId: string, input: WordInput) => {
    const nextItem = createItem(input);

    const sourceList = lists.find((list) => list.id === listId);
    if (sourceList && isPublicListId(sourceList.id)) {
      const copy = touchList({
        ...createLocalCopy(sourceList),
        items: [nextItem, ...sourceList.items]
      });

      setLists((current) => [copy, ...current]);
      return { copied: true, item: nextItem, listId: copy.id };
    }

    setLists((current) =>
      current.map((list) =>
        list.id === listId
          ? touchList({
              ...list,
              items: [nextItem, ...list.items]
            })
          : list
      )
    );
    return { copied: false, item: nextItem, listId };
  }, [lists]);

  const updateWord = useCallback(
    (listId: string, itemId: string, input: WordInput): ListMutationResult => {
      const sourceList = lists.find((list) => list.id === listId);

      if (sourceList && isPublicListId(sourceList.id)) {
        const copy = touchList({
          ...createLocalCopy(sourceList),
          items: sourceList.items.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  word: input.word.trim(),
                  translation: input.translation.trim(),
                  updatedAt: new Date().toISOString()
                }
              : item
          )
        });

        setLists((current) => [copy, ...current]);
        return { copied: true, listId: copy.id };
      }

      setLists((current) =>
        current.map((list) =>
          list.id === listId
            ? touchList({
                ...list,
                items: list.items.map((item) =>
                  item.id === itemId
                    ? {
                        ...item,
                        word: input.word.trim(),
                        translation: input.translation.trim(),
                        updatedAt: new Date().toISOString()
                      }
                    : item
                )
              })
            : list
        )
      );
      return { copied: false, listId };
    },
    [lists]
  );

  const deleteWord = useCallback((listId: string, itemId: string): ListMutationResult => {
    const sourceList = lists.find((list) => list.id === listId);

    if (sourceList && isPublicListId(sourceList.id)) {
      const copy = touchList({
        ...createLocalCopy(sourceList),
        items: sourceList.items.filter((item) => item.id !== itemId)
      });

      setLists((current) => [copy, ...current]);
      return { copied: true, listId: copy.id };
    }

    setLists((current) =>
      current.map((list) =>
        list.id === listId
          ? touchList({
              ...list,
              items: list.items.filter((item) => item.id !== itemId)
            })
          : list
      )
    );
    return { copied: false, listId };
  }, [lists]);

  const recordQuizProgress = useCallback((listId: string, attempts: QuizAttempt[]) => {
    setLists((current) =>
      current.map((list) =>
        list.id === listId
          ? touchList({
              ...list,
              items: applyAttemptsToItems(list.items, attempts)
            })
          : list
      )
    );
  }, []);

  const recordFlashcardProgress = useCallback(
    (listId: string, itemId: string, outcome: FlashcardAssessment) => {
      setLists((current) =>
        current.map((list) =>
          list.id === listId
            ? touchList({
                ...list,
                items: applyFlashcardAssessmentToItems(
                  list.items,
                  itemId,
                  outcome
                )
              })
            : list
        )
      );
    },
    []
  );

  const addTestHistory = useCallback(
    (listId: string, input: { attempts: QuizAttempt[]; mode: QuizMode }) => {
      const nextEntry = createTestHistoryEntry(input);

      setLists((current) =>
        current.map((list) =>
          list.id === listId
            ? touchList({
                ...list,
                testHistory: [nextEntry, ...list.testHistory].slice(0, 30)
              })
            : list
        )
      );

      return nextEntry;
    },
    []
  );

  const importLists = useCallback(
    (incomingLists: WordList[]): ImportListsSummary => {
      const uniqueIncomingLists = Array.from(
        new Map(
          incomingLists
            .map((list) => (isPublicListId(list.id) ? createLocalCopy(list) : list))
            .map((list) => [list.id, list])
        ).values()
      );
      const existingIds = new Set(lists.map((list) => list.id));
      const addedLists = uniqueIncomingLists.filter(
        (list) => !existingIds.has(list.id)
      );
      const summary = {
        added: addedLists.length,
        listIds: uniqueIncomingLists.map((list) => list.id),
        replaced: uniqueIncomingLists.length - addedLists.length,
        total: uniqueIncomingLists.length
      };

      setLists((current) => {
        const currentIds = new Set(current.map((list) => list.id));
        const importedById = new Map(
          uniqueIncomingLists.map((list) => [list.id, list])
        );
        const nextExistingLists = current.map(
          (list) => importedById.get(list.id) ?? list
        );
        const nextAddedLists = uniqueIncomingLists.filter(
          (list) => !currentIds.has(list.id)
        );

        return [...nextAddedLists, ...nextExistingLists];
      });

      return summary;
    },
    [lists]
  );

  const listMap = useMemo(
    () => new Map(lists.map((list) => [list.id, list])),
    [lists]
  );

  return {
    hydrated,
    lists,
    listMap,
    addList,
    updateList,
    deleteList,
    addWord,
    updateWord,
    deleteWord,
    recordQuizProgress,
    recordFlashcardProgress,
    addTestHistory,
    importLists
  };
};
