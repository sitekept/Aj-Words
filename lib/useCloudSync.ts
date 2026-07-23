"use client";

// Orchestrates cloud sync on top of the vocabulary store, without touching its
// internals. On mount (once the store has hydrated) it: redeems a #pair= link if
// present, ensures an anonymous session, pulls the user's cloud lists and merges
// the newer-or-absent ones, then backfills the local lists up. After that first
// successful pull it debounces a push on every local change.
//
// Everything is a no-op when cloud sync is disabled (no env vars), so the app
// keeps working purely offline/local.

import { useCallback, useEffect, useRef, useState } from "react";

import { pullCloudLists, pushLocalLists } from "@/lib/cloud-sync";
import {
  createPairingLink,
  extractPairCode,
  redeemPairing,
  type PairingLink
} from "@/lib/device-pairing";
import { getSupabase, isCloudEnabled } from "@/lib/supabase-client";
import type { WordList } from "@/types/vocabulary";

export type CloudSyncStatus =
  | "disabled"
  | "connecting"
  | "syncing"
  | "synced"
  | "error";

// The slice of useVocabularyStore this hook needs.
interface CloudStore {
  hydrated: boolean;
  lists: WordList[];
  listMap: Map<string, WordList>;
  importLists: (lists: WordList[]) => unknown;
}

const isNewer = (a: string, b: string): boolean =>
  new Date(a).getTime() > new Date(b).getTime();

export const useCloudSync = (store: CloudStore) => {
  const cloudEnabled = isCloudEnabled();
  const [status, setStatus] = useState<CloudSyncStatus>(
    cloudEnabled ? "connecting" : "disabled"
  );
  // Guards the push effect: only push after the first pull has landed, so a
  // stale local state can never overwrite fresher cloud data on startup.
  const pushReadyRef = useRef(false);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One-time: sign in (or pair), pull + merge, then backfill.
  useEffect(() => {
    if (!cloudEnabled || !store.hydrated) {
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        setStatus("connecting");

        // A pairing deep link adopts an existing device's session instead of
        // creating a fresh anonymous one.
        const pairCode = extractPairCode(window.location.hash);
        if (pairCode) {
          await redeemPairing(pairCode);
          window.history.replaceState(
            null,
            "",
            `${window.location.pathname}${window.location.search}`
          );
        }

        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          await supabase.auth.signInAnonymously();
        }

        setStatus("syncing");
        const cloudLists = await pullCloudLists();
        if (cancelled) {
          return;
        }

        const toApply = cloudLists.filter((cloudList) => {
          const local = store.listMap.get(cloudList.id);
          return !local || isNewer(cloudList.updatedAt, local.updatedAt);
        });
        if (toApply.length) {
          store.importLists(toApply);
        }

        // Pull succeeded: safe to start pushing local changes.
        pushReadyRef.current = true;
        const pushed = await pushLocalLists(store.lists);
        if (!cancelled) {
          setStatus(pushed ? "synced" : "error");
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // Runs once when hydration flips; the async closure reads the current store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudEnabled, store.hydrated]);

  // Debounced push on local mutations, after the initial pull.
  useEffect(() => {
    if (!cloudEnabled || !pushReadyRef.current) {
      return;
    }

    if (pushTimerRef.current) {
      clearTimeout(pushTimerRef.current);
    }

    pushTimerRef.current = setTimeout(() => {
      setStatus("syncing");
      void pushLocalLists(store.lists).then((ok) =>
        setStatus(ok ? "synced" : "error")
      );
    }, 1500);

    return () => {
      if (pushTimerRef.current) {
        clearTimeout(pushTimerRef.current);
      }
    };
  }, [cloudEnabled, store.lists]);

  const makePairingLink = useCallback(
    (): Promise<PairingLink | null> => createPairingLink(),
    []
  );

  return { status, cloudEnabled, makePairingLink };
};
