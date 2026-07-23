// Cloud-sync engine: pushes the user's own lists (CONTENT only — no learning
// progress) to Supabase and pulls them back on another device.
//
// Design notes (KISS, agreed with the product owner):
//  - Only local (non-builtin) lists sync. The 19 builtin lists already ship in
//    the app bundle on every device, so they are never uploaded.
//  - Progress (box/dueAt/attempts/streaks/FSRS/testHistory) is NOT synced. A
//    pulled list arrives with fresh "new" progress; per-device learning state
//    stays local. normalizeList() fills the progress fields for content-only
//    items automatically.
//  - Duplicate local lists are collapsed on the way up (dedupeLists) so the
//    database — and every other device — only ever sees the largest of a group.
//  - Push is UPSERT-only: it never deletes cloud rows, so a failed/partial sync
//    can never lose data. (Cross-device deletion propagation is a later step.)

import { dedupeLists } from "@/lib/list-dedupe";
import { getSupabase } from "@/lib/supabase-client";
import { isPublicListId, normalizeList } from "@/lib/vocabulary-storage";
import type { VocabularyItem, WordList } from "@/types/vocabulary";

const LISTS_TABLE = "lists";

interface CloudItem {
  id: string;
  word: string;
  translation: string;
  note?: string;
  example?: string;
  altAnswers?: string[];
  tags?: string[];
}

interface CloudListRow {
  id: string;
  owner: string;
  title: string;
  language: string | null;
  content: CloudItem[];
  created_at: string;
  updated_at: string;
}

// A cloud row → a full WordList. normalizeList() turns the content-only items
// into fresh cards (progress reset), which is the intended behavior. The cast
// mirrors parseExportPayload: normalizeItem() accepts partial items at runtime,
// but the WordList type declares fully-formed ones.
const rowToList = (row: CloudListRow): WordList =>
  normalizeList({
    id: row.id,
    title: row.title,
    language: row.language ?? "",
    items: (Array.isArray(row.content) ? row.content : []) as unknown as VocabularyItem[],
    testHistory: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });

// A local item → its content-only cloud shape.
const itemToCloud = (item: VocabularyItem): CloudItem => ({
  id: item.id,
  word: item.word,
  translation: item.translation,
  ...(item.note ? { note: item.note } : {}),
  ...(item.example ? { example: item.example } : {}),
  ...(item.altAnswers?.length ? { altAnswers: item.altAnswers } : {}),
  ...(item.tags?.length ? { tags: item.tags } : {})
});

const listToRow = (
  uid: string,
  list: WordList
): Omit<CloudListRow, "owner"> & { owner: string } => ({
  id: list.id,
  owner: uid,
  title: list.title,
  language: list.language ?? null,
  content: list.items.map((item) => itemToCloud(item)),
  created_at: list.createdAt,
  updated_at: list.updatedAt
});

/** Every list the signed-in user owns, as full WordLists. Empty when off. */
export const pullCloudLists = async (): Promise<WordList[]> => {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase.from(LISTS_TABLE).select("*");
  if (error || !data) {
    return [];
  }

  return (data as CloudListRow[]).map(rowToList);
};

/**
 * Upsert the user's local (non-builtin) lists to the cloud, deduplicated.
 * Returns true on success (or a no-op when sync is off).
 */
export const pushLocalLists = async (lists: WordList[]): Promise<boolean> => {
  const supabase = getSupabase();
  if (!supabase) {
    return false;
  }

  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) {
    return false;
  }

  const localLists = dedupeLists(lists.filter((list) => !isPublicListId(list.id)));
  if (!localLists.length) {
    return true;
  }

  const rows = localLists.map((list) => listToRow(uid, list));
  const { error } = await supabase
    .from(LISTS_TABLE)
    .upsert(rows, { onConflict: "owner,id" });

  return !error;
};
