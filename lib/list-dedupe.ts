// Duplicate-list detection for cloud migration.
//
// Two lists are treated as duplicates when (almost) every word+translation pair
// of the smaller one is also present in the larger one. The signal is the PAIR
// (word|translation), never the word alone — so complementary exercises that
// reuse a unit's vocabulary but pair each word with a different answer (e.g. the
// bundled "בחני מילים" vs "השלמת משפטים" lists, which share 0 identical pairs)
// are never merged. Within a duplicate group the list with the MOST words wins
// (the user's rule); the rest are dropped.
//
// Pure and dependency-free (the WordList import is type-only, erased at runtime)
// so it runs under `node --test` like lib/share-link.ts.

import type { WordList } from "@/types/vocabulary";

// Above this containment (shared pairs / smaller list's size) two lists count as
// duplicates. 0.9 tolerates a stray typo/extra card without merging genuinely
// different lists.
export const DUPLICATE_CONTAINMENT = 0.9;

const fold = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

const contentKeys = (list: WordList): Set<string> =>
  new Set(
    list.items.map((item) => `${fold(item.word)}|||${fold(item.translation)}`)
  );

// Fraction of the SMALLER set that is contained in the larger. 1 means the
// smaller list is fully included in the larger.
const containment = (a: Set<string>, b: Set<string>): number => {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  if (small.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const key of small) {
    if (big.has(key)) {
      overlap += 1;
    }
  }
  return overlap / small.size;
};

/**
 * Drops duplicate lists, keeping the one with the most words from each group.
 * Order of the survivors follows their order in the input.
 */
export const dedupeLists = (lists: WordList[]): WordList[] => {
  if (lists.length < 2) {
    return lists;
  }

  const keys = lists.map(contentKeys);

  // Union-find: link every pair over the duplicate threshold into one group.
  const parent = lists.map((_, index) => index);
  const find = (index: number): number =>
    parent[index] === index ? index : (parent[index] = find(parent[index]));
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };

  for (let i = 0; i < lists.length; i += 1) {
    for (let j = i + 1; j < lists.length; j += 1) {
      if (keys[i].size === 0 || keys[j].size === 0) {
        continue;
      }
      if (containment(keys[i], keys[j]) >= DUPLICATE_CONTAINMENT) {
        union(i, j);
      }
    }
  }

  // Per group keep the largest list (ties: the earliest in the input).
  const winnerByGroup = new Map<number, number>();
  lists.forEach((list, index) => {
    const group = find(index);
    const current = winnerByGroup.get(group);
    if (current === undefined || list.items.length > lists[current].items.length) {
      winnerByGroup.set(group, index);
    }
  });

  const keep = new Set(winnerByGroup.values());
  return lists.filter((_, index) => keep.has(index));
};
