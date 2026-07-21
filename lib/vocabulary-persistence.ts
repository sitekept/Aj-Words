type PersistableItem = {
  id: string;
  status: string;
  attempts: number;
  correctCount: number;
  wrongCount: number;
  correctStreak: number;
  wrongStreak: number;
  lastTestedAt?: string;
  lastWrongAt?: string;
  box: number;
  dueAt: string;
  stability?: number;
  difficulty?: number;
  updatedAt: string;
};

type PersistableList = {
  id: string;
  title: string;
  language?: string;
  items: PersistableItem[];
  testHistory: unknown[];
  createdAt: string;
  updatedAt: string;
};

const PROGRESS_FIELDS = [
  "status",
  "attempts",
  "correctCount",
  "wrongCount",
  "correctStreak",
  "wrongStreak",
  "lastTestedAt",
  "lastWrongAt",
  "box",
  "dueAt",
  "stability",
  "difficulty",
  "updatedAt"
] as const;

const hasUserProgress = (item: PersistableItem) =>
  item.attempts > 0 ||
  item.correctCount > 0 ||
  item.wrongCount > 0 ||
  item.correctStreak > 0 ||
  item.wrongStreak > 0 ||
  item.box > 0 ||
  Boolean(item.lastTestedAt) ||
  Boolean(item.lastWrongAt);

const createProgressOverlayItem = (item: PersistableItem) => ({
  id: item.id,
  status: item.status,
  attempts: item.attempts,
  correctCount: item.correctCount,
  wrongCount: item.wrongCount,
  correctStreak: item.correctStreak,
  wrongStreak: item.wrongStreak,
  lastTestedAt: item.lastTestedAt,
  lastWrongAt: item.lastWrongAt,
  box: item.box,
  dueAt: item.dueAt,
  stability: item.stability,
  difficulty: item.difficulty,
  updatedAt: item.updatedAt
});

const hasProgressChanged = (
  item: PersistableItem,
  baselineItem: PersistableItem | undefined
) => {
  if (!baselineItem) {
    return hasUserProgress(item);
  }

  return PROGRESS_FIELDS.some((field) => item[field] !== baselineItem[field]);
};

const hasTestHistoryChanged = (
  list: PersistableList,
  baseline: PersistableList | undefined
) => JSON.stringify(list.testHistory) !== JSON.stringify(baseline?.testHistory ?? []);

const hasListMetadataChanged = (
  list: PersistableList,
  baseline: PersistableList | undefined
) => {
  if (!baseline) {
    return false;
  }

  return (
    list.title !== baseline.title ||
    list.language !== baseline.language ||
    list.createdAt !== baseline.createdAt ||
    list.updatedAt !== baseline.updatedAt
  );
};

const createPublicListOverlay = <TList extends PersistableList>(
  list: TList,
  baseline: TList | undefined
) => {
  const baselineItems = new Map(
    (baseline?.items ?? []).map((item) => [item.id, item])
  );
  const items = list.items
    .filter((item) => hasProgressChanged(item, baselineItems.get(item.id)))
    .map(createProgressOverlayItem);
  const testHistoryChanged = hasTestHistoryChanged(list, baseline);
  const metadataChanged = hasListMetadataChanged(list, baseline);

  if (!items.length && !testHistoryChanged && !metadataChanged) {
    return null;
  }

  return {
    id: list.id,
    title: list.title,
    language: list.language,
    items,
    testHistory: testHistoryChanged ? list.testHistory : [],
    createdAt: list.createdAt,
    updatedAt: list.updatedAt
  };
};

export const createPersistedLists = <TList extends PersistableList>(
  lists: TList[],
  isPublicListId: (listId: string) => boolean,
  getPublicBaseline?: (listId: string) => TList | undefined
): PersistableList[] => {
  const persistedLists: PersistableList[] = [];

  lists.forEach((list) => {
    if (!isPublicListId(list.id)) {
      persistedLists.push(list);
      return;
    }

    const overlay = createPublicListOverlay(list, getPublicBaseline?.(list.id));
    if (overlay) {
      persistedLists.push(overlay);
    }
  });

  return persistedLists;
};
