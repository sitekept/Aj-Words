"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import {
  Download,
  Home,
  MessageSquare,
  Plus,
  Smartphone,
  Upload
} from "lucide-react";
import { ActivityHeatmap } from "@/components/ActivityHeatmap";
import { AJWordsScene } from "@/components/AJWordsScene";
import { BrandLogo } from "@/components/BrandLogo";
import { FlashcardMode } from "@/components/FlashcardMode";
import { ListDetail } from "@/components/ListDetail";
import { ListFormModal } from "@/components/ListFormModal";
import { ListLibrary } from "@/components/ListLibrary";
import { QuizRunner } from "@/components/QuizRunner";
import { ScoreScreen } from "@/components/ScoreScreen";
import { SyncDeviceModal } from "@/components/SyncDeviceModal";
import { WordFormModal } from "@/components/WordFormModal";
import { Button, Modal } from "@/components/ui";
import { useCloudSync, type CloudSyncStatus } from "@/lib/useCloudSync";
import { APP_BUILD_LABEL, buildFeedbackUrl } from "@/lib/app-version";
import { importedListId } from "@/lib/retired-lists";
import { recordActivity } from "@/lib/activity-log";
import { readQuizDirection, writeQuizDirection } from "@/lib/quiz-preferences";
import {
  SHARE_HASH_KEY,
  decodeShare,
  encodeShare,
  extractShareToken
} from "@/lib/share-link";
import {
  clearQuizSession,
  readQuizSession,
  writeQuizSession
} from "@/lib/quiz-session-storage";
import { useVocabularyStore, type WordInput } from "@/lib/useVocabularyStore";
import {
  createExportPayload,
  isPublicListId,
  MAX_IMPORT_BYTES,
  parseExportPayload
} from "@/lib/vocabulary-storage";
import type {
  QuizAttempt,
  QuizDirection,
  QuizMode,
  QuizSessionState,
  TestHistoryEntry,
  VocabularyItem,
  WordList
} from "@/types/vocabulary";

type AppView =
  | "home"
  | "list"
  | "flashcards"
  | "quiz"
  | "score";

type ListFormState =
  | { mode: "create" }
  | { mode: "edit"; list: WordList }
  | null;

type TransferNotice = {
  tone: "success" | "error";
  message: string;
} | null;

// The raw CloudSyncStatus values leaked into the UI through the Sync button's
// tooltip ("Sync status: synced"). Keys stay as the type defines them; only the
// displayed wording is translated.
const SYNC_STATUS_LABELS: Record<CloudSyncStatus, string> = {
  disabled: "désactivée",
  connecting: "connexion…",
  syncing: "en cours…",
  synced: "à jour",
  error: "échec"
};

const UI_STATE_KEY = "ajwords.v1.ui";
const FLASHCARD_STATE_KEY = "ajwords.v1.flashcards";

type FlashcardPositionStore = Record<
  string,
  {
    nextIndex: number;
    updatedAt: string;
  }
>;

const formatFileSize = (bytes: number) => {
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
};

const readFlashcardPositions = (): FlashcardPositionStore => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(FLASHCARD_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as FlashcardPositionStore)
      : {};
  } catch {
    return {};
  }
};

const normalizeFlashcardIndex = (value: unknown, total: number) => {
  if (!total || typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  const nextIndex = Math.floor(value);
  return nextIndex >= 0 && nextIndex < total ? nextIndex : 0;
};

const readFlashcardPosition = (listId: string, total: number) => {
  const positions = readFlashcardPositions();
  return normalizeFlashcardIndex(positions[listId]?.nextIndex, total);
};

const writeFlashcardPosition = (listId: string, nextIndex: number) => {
  if (typeof window === "undefined") {
    return;
  }

  const positions = readFlashcardPositions();
  const safeNextIndex = Number.isFinite(nextIndex)
    ? Math.max(0, Math.floor(nextIndex))
    : 0;

  positions[listId] = {
    nextIndex: safeNextIndex,
    updatedAt: new Date().toISOString()
  };

  try {
    window.localStorage.setItem(FLASHCARD_STATE_KEY, JSON.stringify(positions));
  } catch {
    // Resume position is non-critical; skip it when storage is unavailable.
  }
};

const readPreferredListId = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const url = new URL(window.location.href);
  const urlListId = url.searchParams.get("list");

  if (urlListId) {
    return urlListId;
  }

  try {
    const raw = window.localStorage.getItem(UI_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return typeof parsed?.selectedListId === "string" ? parsed.selectedListId : null;
  } catch {
    return null;
  }
};

const writePreferredListId = (listId: string | null) => {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);

  if (listId) {
    try {
      window.localStorage.setItem(UI_STATE_KEY, JSON.stringify({ selectedListId: listId }));
    } catch {
      // Selection memory is non-critical; the URL param still carries it.
    }
    url.searchParams.set("list", listId);
  } else {
    window.localStorage.removeItem(UI_STATE_KEY);
    url.searchParams.delete("list");
  }

  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
};

export function VocabularyApp() {
  const store = useVocabularyStore();
  const cloudSync = useCloudSync(store);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  // Resolved after mount: buildFeedbackUrl reads navigator.userAgent, so each
  // report arrives already labelled with the build and the browser.
  const [feedbackUrl, setFeedbackUrl] = useState<string | null>(null);
  const [view, setView] = useState<AppView>("home");
  const [uiHydrated, setUiHydrated] = useState(false);
  const [transferNotice, setTransferNotice] = useState<TransferNotice>(null);
  const [listFormState, setListFormState] = useState<ListFormState>(null);
  const [wordFormOpen, setWordFormOpen] = useState(false);
  const [wordFormListId, setWordFormListId] = useState<string | null>(null);
  const [editingWord, setEditingWord] = useState<VocabularyItem | null>(null);
  const [wordFormSession, setWordFormSession] = useState(0);
  const [quizMode, setQuizMode] = useState<QuizMode>("written");
  const [quizDirection, setQuizDirection] = useState<QuizDirection>("forward");
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);
  const [quizInitialSession, setQuizInitialSession] =
    useState<QuizSessionState | null>(null);
  const [flashcardInitialIndex, setFlashcardInitialIndex] = useState(0);
  const [activityVersion, setActivityVersion] = useState(0);
  const [shareImport, setShareImport] = useState<WordList[] | null>(null);
  // A file import that would overwrite existing lists, held until confirmed.
  const [pendingImport, setPendingImport] = useState<{
    lists: WordList[];
    replaced: WordList[];
  } | null>(null);
  // The list whose progress is about to be wiped, held until confirmed.
  const [resetProgressList, setResetProgressList] = useState<WordList | null>(
    null
  );

  // Log a review (or an undo, delta -1) to the activity journal and refresh the
  // heatmap. The timestamp is captured here, at the call site.
  const logActivity = (delta: number) => {
    recordActivity(delta, new Date().toISOString());
    setActivityVersion((version) => version + 1);
  };

  const selectedList = selectedListId
    ? store.listMap.get(selectedListId) ?? null
    : null;
  const hasSelectedList = Boolean(selectedListId);
  const hasWorkspaceSelection = hasSelectedList;

  useEffect(() => {
    if (!store.hydrated || uiHydrated) {
      return;
    }

    const preferredListId = readPreferredListId();

    if (preferredListId && store.listMap.has(preferredListId)) {
      setSelectedListId(preferredListId);
      setView("list");
    } else if (preferredListId) {
      writePreferredListId(null);
    }

    setUiHydrated(true);
  }, [store.hydrated, store.listMap, uiHydrated]);

  // A "#share=..." fragment offers an incoming list. Decode it once hydrated,
  // then open a confirmation modal (never a silent import) and clean the URL.
  useEffect(() => {
    if (!store.hydrated) {
      return;
    }

    const token = extractShareToken(window.location.hash);
    if (!token) {
      return;
    }

    let cancelled = false;
    decodeShare(token).then((payload) => {
      if (cancelled) {
        return;
      }
      // Strip the fragment (rebuild the URL, no in-place mutation).
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`
      );

      if (!payload) {
        setTransferNotice({
          tone: "error",
          message: "Ce lien de partage n'a pas pu être lu."
        });
        return;
      }

      try {
        const parsed = parseExportPayload(payload);
        if (parsed.lists.length) {
          setShareImport(parsed.lists);
        }
      } catch {
        setTransferNotice({
          tone: "error",
          message: "Ce lien de partage ne contient pas une liste AJ Words valide."
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [store.hydrated]);

  useEffect(() => {
    setFeedbackUrl(buildFeedbackUrl());
  }, []);

  // Each list remembers its own quiz direction; refresh it on selection change.
  useEffect(() => {
    setQuizDirection(selectedListId ? readQuizDirection(selectedListId) : "forward");
  }, [selectedListId]);

  useEffect(() => {
    if (!transferNotice) {
      return;
    }

    const timeout = window.setTimeout(() => setTransferNotice(null), 5200);
    return () => window.clearTimeout(timeout);
  }, [transferNotice]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const host = window.location.hostname;
    const isLocalDevHost =
      ["localhost", "127.0.0.1", "::1"].includes(host) ||
      /^10\./.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
      /^192\.168\./.test(host) ||
      /\.local$/.test(host);
    const canRegister = window.location.protocol === "https:" || isLocalDevHost;

    if (process.env.NODE_ENV !== "production" || !canRegister) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          registrations.forEach((registration) => registration.unregister())
        )
        .catch(() => undefined);
      return;
    }

    const registerServiceWorker = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => undefined);
    };

    if (document.readyState === "complete") {
      registerServiceWorker();
      return;
    }

    window.addEventListener("load", registerServiceWorker);
    return () => window.removeEventListener("load", registerServiceWorker);
  }, []);

  const showList = (listId: string) => {
    setSelectedListId(listId);
    setView("list");
    writePreferredListId(listId);
  };

  const goHome = () => {
    setSelectedListId(null);
    setView("home");
    writePreferredListId(null);
  };

  const openList = (listId: string) => {
    showList(listId);
  };

  const deleteList = (listId: string) => {
    const list = store.listMap.get(listId);
    if (!list) {
      return;
    }

    if (isPublicListId(listId)) {
      setTransferNotice({
        tone: "error",
        message:
          "Les listes partagées restent disponibles pour tout le monde. Modifiez-la ou ajoutez un mot pour en créer votre copie locale."
      });
      return;
    }

    if (window.confirm(`Supprimer « ${list.title} » et tous ses mots ?`)) {
      const result = store.deleteList(listId);
      if (result.deleted && selectedListId === listId) {
        goHome();
      }
    }
  };

  const submitListForm = (input: {
    title: string;
    language?: string;
  }) => {
    if (listFormState?.mode === "edit") {
      const result = store.updateList(listFormState.list.id, input);
      if (result.copied) {
        showList(result.listId);
        setTransferNotice({
          tone: "success",
          message: "Une copie locale a été créée pour vos modifications."
        });
      }
      setListFormState(null);
      return;
    }

    const nextList = store.addList(input);
    showList(nextList.id);
    setListFormState(null);
  };

  const openAddWord = (listId = selectedListId) => {
    if (!listId) {
      return;
    }

    showList(listId);
    setListFormState(null);
    setWordFormListId(listId);
    setEditingWord(null);
    setWordFormSession((session) => session + 1);
    setWordFormOpen(true);
  };

  const submitWordForm = (input: WordInput) => {
    const activeListId = wordFormListId ?? selectedListId;

    if (!activeListId) {
      return;
    }

    showList(activeListId);
    setListFormState(null);

    const result = editingWord
      ? store.updateWord(activeListId, editingWord.id, input)
      : store.addWord(activeListId, input);

    if (result.copied) {
      showList(result.listId);
      setTransferNotice({
        tone: "success",
        message: "Une copie locale a été créée pour vos modifications."
      });
    }

    setWordFormOpen(false);
    setWordFormListId(null);
    setEditingWord(null);
  };

  const changeQuizDirection = (direction: QuizDirection) => {
    setQuizDirection(direction);
    if (selectedListId) {
      writeQuizDirection(selectedListId, direction);
    }
  };

  const startQuiz = (mode: QuizMode) => {
    if (!selectedList) {
      return;
    }

    setQuizInitialSession(readQuizSession(selectedList.id, mode));
    setQuizMode(mode);
    setQuizAttempts([]);
    setView("quiz");
  };

  const startFlashcards = (list: WordList) => {
    setFlashcardInitialIndex(readFlashcardPosition(list.id, list.items.length));
    setView("flashcards");
  };

  const exportLists = () => {
    if (!store.lists.length) {
      setTransferNotice({
        tone: "error",
        message: "Créez une liste avant d'exporter."
      });
      return;
    }

    const payload = createExportPayload(store.lists);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, "-");

    link.href = url;
    link.download = `aj-words-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setTransferNotice({
      tone: "success",
      message: `${store.lists.length} ${
        store.lists.length <= 1 ? "liste exportée" : "listes exportées"
      }.`
    });
  };

  const shareSelectedList = async (list: WordList) => {
    try {
      const payload = createExportPayload([list]);
      const encoded = await encodeShare(payload);

      if (encoded.tooLarge) {
        setTransferNotice({
          tone: "error",
          message: "Cette liste est trop volumineuse pour un lien de partage — utilisez plutôt l'export."
        });
        return;
      }

      const base = `${window.location.origin}${window.location.pathname}`;
      const url = `${base}#${SHARE_HASH_KEY}=${encoded.token}`;

      try {
        await navigator.clipboard.writeText(url);
        setTransferNotice({
          tone: "success",
          message: encoded.warn
            ? "Lien de partage copié — il est long, certaines applications risquent de le tronquer."
            : "Lien de partage copié dans le presse-papiers."
        });
      } catch {
        setTransferNotice({
          tone: "error",
          message: "Impossible de copier le lien. Vérifiez les autorisations du presse-papiers."
        });
      }
    } catch {
      setTransferNotice({
        tone: "error",
        message: "Impossible de créer un lien de partage pour cette liste."
      });
    }
  };

  const applyImport = (lists: WordList[]) => {
    const summary = store.importLists(lists);
    if (summary.listIds.length) {
      showList(summary.listIds[0]);
    }
    setTransferNotice({
      tone: "success",
      message: `${summary.total} ${
        summary.total <= 1 ? "liste importée" : "listes importées"
      } : ${summary.added} ajoutée(s), ${summary.replaced} remplacée(s).`
    });
  };

  const importListsFromFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      // Checked before reading: file.text() + JSON.parse on a multi-gigabyte
      // file would freeze the tab before any validation could run.
      if (file.size > MAX_IMPORT_BYTES) {
        throw new Error(
          `Ce fichier pèse ${formatFileSize(file.size)}, au-delà de la limite d'import de ${formatFileSize(
            MAX_IMPORT_BYTES
          )}.`
        );
      }

      const text = await file.text();
      let payload: unknown;

      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error("Ce fichier n'est pas du JSON valide.");
      }

      const parsed = parseExportPayload(payload);

      // The *stored* lists, not the incoming ones: the modal must show what is
      // about to be lost, not what is arriving to replace it.
      //
      // Matched on `importedListId`, not on the raw incoming id: a list from a
      // pre-removal export arrives under a retired id but is stored under its
      // restored one, so comparing the raw id found nothing and the overwrite
      // went through with no confirmation at all.
      const replaced = parsed.lists
        .filter(
          (list) =>
            !isPublicListId(list.id) &&
            store.listMap.has(importedListId(list.id))
        )
        .map((list) => store.listMap.get(importedListId(list.id)))
        .filter((list): list is WordList => Boolean(list));

      // Overwriting a list destroys its words and its progress. Name what is
      // at stake instead of asking to confirm a bare count.
      if (replaced.length) {
        setPendingImport({ lists: parsed.lists, replaced });
        return;
      }

      applyImport(parsed.lists);
    } catch (error) {
      setTransferNotice({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Ce fichier n'a pas pu être importé."
      });
    } finally {
      event.target.value = "";
    }
  };

  const reviewTest = (entry: TestHistoryEntry) => {
    setQuizInitialSession(null);
    setQuizMode(entry.mode);
    setQuizAttempts(entry.attempts);
    setView("score");
  };

  const acceptShareImport = () => {
    if (!shareImport) {
      return;
    }

    const summary = store.importLists(shareImport);
    setShareImport(null);
    if (summary.listIds.length) {
      showList(summary.listIds[0]);
    }
    setTransferNotice({
      tone: "success",
      message: `${summary.total} ${
        summary.total <= 1 ? "liste importée" : "listes importées"
      } depuis un lien de partage.`
    });
  };

  const shareImportWordCount = shareImport
    ? shareImport.reduce((sum, list) => sum + list.items.length, 0)
    : 0;
  const shareImportReplaceCount = shareImport
    ? shareImport.filter(
        (list) => !isPublicListId(list.id) && store.listMap.has(list.id)
      ).length
    : 0;

  const deleteWord = (listId: string, itemId: string) => {
    const result = store.deleteWord(listId, itemId);
    if (result.copied) {
      showList(result.listId);
      setTransferNotice({
        tone: "success",
        message: "Une copie locale a été créée pour vos modifications."
      });
    }
  };

  if (!store.hydrated || !uiHydrated) {
    return (
      <main className="loading-screen">
        <div className="loading-card">
          <BrandLogo />
          <span>Chargement d&rsquo;AJ Words</span>
        </div>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">
        Aller au contenu
      </a>
      <header className="app-topbar">
        <button type="button" className="brand-button" onClick={goHome}>
          <BrandLogo />
          <strong>AJ Words</strong>
        </button>
        <div className="topbar-actions">
          <Button variant="ghost" size="sm" icon={<Home size={17} />} onClick={goHome}>
            Accueil
          </Button>
          <Button
            className="topbar-transfer"
            variant="secondary"
            size="sm"
            icon={<Download size={17} />}
            onClick={exportLists}
            disabled={!store.lists.length}
          >
            <span className="topbar-action-label">Exporter</span>
          </Button>
          <Button
            className="topbar-transfer"
            variant="secondary"
            size="sm"
            icon={<Upload size={17} />}
            onClick={() => importInputRef.current?.click()}
          >
            <span className="topbar-action-label">Importer</span>
          </Button>
          {cloudSync.cloudEnabled ? (
            <Button
              className="topbar-transfer"
              variant="secondary"
              size="sm"
              icon={<Smartphone size={17} />}
              onClick={() => setSyncModalOpen(true)}
              title={`Synchronisation : ${SYNC_STATUS_LABELS[cloudSync.status]}`}
            >
              <span className="topbar-action-label">Synchroniser</span>
            </Button>
          ) : null}
          <Button
            className="topbar-new-list"
            size="sm"
            icon={<Plus size={17} />}
            onClick={() => setListFormState({ mode: "create" })}
          >
            <span className="topbar-new-label">Nouvelle liste</span>
          </Button>
          <input
            ref={importInputRef}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            onChange={importListsFromFile}
            aria-label="Importer un fichier JSON AJ Words"
          />
        </div>
      </header>

      {store.storageError ? (
        <div className="transfer-notice transfer-notice-error" role="alert">
          {store.storageError}{" "}
          <Button
            variant="secondary"
            size="sm"
            icon={<Download size={17} />}
            onClick={exportLists}
            disabled={!store.lists.length}
          >
            Exporter mes listes
          </Button>
        </div>
      ) : null}

      {transferNotice ? (
        <div
          className={`transfer-notice transfer-notice-${transferNotice.tone}`}
          role={transferNotice.tone === "error" ? "alert" : "status"}
        >
          {transferNotice.message}
        </div>
      ) : null}

      <SyncDeviceModal
        open={syncModalOpen}
        onClose={() => setSyncModalOpen(false)}
        makePairingLink={cloudSync.makePairingLink}
      />

      <main
        id="workspace"
        tabIndex={-1}
        className={`workspace ${hasWorkspaceSelection ? "has-selection" : ""}`}
      >
        <aside className="library-panel">
          <ActivityHeatmap refreshToken={activityVersion} />
          <ListLibrary
            lists={store.lists}
            selectedListId={selectedListId}
            onCreate={() => setListFormState({ mode: "create" })}
            onDelete={deleteList}
            onEdit={(list) => setListFormState({ mode: "edit", list })}
            onSelect={openList}
          />
          {/* Deliberately in the library panel rather than the welcome panel:
              below 760px the welcome panel is display:none, so anything put
              there would never reach a phone. */}
          <footer className="app-footer">
            <span>Version {APP_BUILD_LABEL}</span>
            {feedbackUrl ? (
              <a href={feedbackUrl}>
                <MessageSquare size={14} aria-hidden="true" /> Donner mon avis
              </a>
            ) : null}
          </footer>
        </aside>

        <section className="workspace-panel">
          {!hasWorkspaceSelection ? (
            <section className="welcome-panel" aria-labelledby="welcome-title">
              <div className="welcome-copy">
                <p className="eyebrow">AJ Words</p>
                <h1 id="welcome-title">
                  Apprenez vos mots avec rythme et concentration
                </h1>
                <p>
                  Créez vos listes de vocabulaire, révisez-les en cartes mémo et
                  testez votre mémoire. Tout reste sur votre appareil.
                </p>
                <div className="welcome-actions">
                  <Button
                    icon={<Plus size={18} />}
                    onClick={() => setListFormState({ mode: "create" })}
                  >
                    Créer une liste
                  </Button>
                  <span className="welcome-metric">
                    <strong>{store.lists.length}</strong>
                    {store.lists.length <= 1
                      ? " liste enregistrée"
                      : " listes enregistrées"}
                  </span>
                </div>
              </div>
              <AJWordsScene />
            </section>
          ) : null}

          {hasSelectedList && !selectedList ? (
            <section className="detail" aria-labelledby="list-loading-title">
              <div className="empty-state">
                <h2 id="list-loading-title">Chargement de la liste</h2>
              </div>
            </section>
          ) : null}

          {selectedList && view === "list" ? (
            <ListDetail
              direction={quizDirection}
              list={selectedList}
              onAddWord={() => openAddWord(selectedList.id)}
              onBack={goHome}
              onDeleteList={() => deleteList(selectedList.id)}
              onDeleteWord={(itemId) => deleteWord(selectedList.id, itemId)}
              onDirectionChange={changeQuizDirection}
              onEditList={() => setListFormState({ mode: "edit", list: selectedList })}
              onEditWord={(item) => {
                setWordFormListId(selectedList.id);
                setEditingWord(item);
                setWordFormSession((session) => session + 1);
                setWordFormOpen(true);
              }}
              onResetProgress={() => setResetProgressList(selectedList)}
              onReviewTest={reviewTest}
              onShareList={() => shareSelectedList(selectedList)}
              onStartFlashcards={() => startFlashcards(selectedList)}
              onStartQuiz={startQuiz}
            />
          ) : null}

          {selectedList && view === "flashcards" ? (
            <FlashcardMode
              initialIndex={flashcardInitialIndex}
              list={selectedList}
              onAssess={(itemId, outcome) => {
                store.recordFlashcardProgress(selectedList.id, itemId, outcome);
                logActivity(1);
              }}
              onBack={() => setView("list")}
              onPositionChange={(nextIndex) =>
                writeFlashcardPosition(selectedList.id, nextIndex)
              }
              onUndo={(snapshot) => {
                store.undoFlashcardAssessment(selectedList.id, snapshot);
                logActivity(-1);
              }}
            />
          ) : null}

          {selectedList && view === "quiz" ? (
            <QuizRunner
              direction={quizDirection}
              initialSession={quizInitialSession}
              list={selectedList}
              mode={quizMode}
              onAttemptFinalized={(attempt) => {
                store.recordQuizProgress(selectedList.id, [attempt]);
                logActivity(1);
              }}
              onBack={() => setView("list")}
              onFinish={(attempts) => {
                clearQuizSession(selectedList.id, quizMode);
                store.addTestHistory(selectedList.id, {
                  attempts,
                  mode: quizMode
                });
                setQuizAttempts(attempts);
                setQuizInitialSession(null);
                setView("score");
              }}
              onSessionChange={writeQuizSession}
            />
          ) : null}

          {selectedList && view === "score" ? (
            <ScoreScreen
              list={selectedList}
              mode={quizMode}
              attempts={quizAttempts}
              onBack={() => setView("list")}
              onRepeat={() => {
                clearQuizSession(selectedList.id, quizMode);
                setQuizAttempts([]);
                setQuizInitialSession(null);
                setView("quiz");
              }}
            />
          ) : null}
        </section>
      </main>

      <ListFormModal
        open={Boolean(listFormState)}
        list={listFormState?.mode === "edit" ? listFormState.list : null}
        onClose={() => setListFormState(null)}
        onAddWord={(list) => {
          openAddWord(list.id);
        }}
        onSubmit={submitListForm}
      />

      <WordFormModal
        key={wordFormSession}
        open={wordFormOpen}
        item={editingWord}
        onClose={() => {
          setWordFormOpen(false);
          setWordFormListId(null);
          setEditingWord(null);
        }}
        onSubmit={submitWordForm}
      />

      <Modal
        open={Boolean(resetProgressList)}
        title="Réinitialiser la progression ?"
        onClose={() => setResetProgressList(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetProgressList(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (resetProgressList) {
                  store.resetProgress(resetProgressList.id);
                  setTransferNotice({
                    tone: "success",
                    message: `Progression réinitialisée pour « ${resetProgressList.title} ».`
                  });
                }
                setResetProgressList(null);
              }}
            >
              Réinitialiser
            </Button>
          </>
        }
      >
        {resetProgressList ? (
          <>
            <p className="modal-lead">
              Toutes les cartes de{" "}
              <strong dir="auto">{resetProgressList.title}</strong> repassent à
              l&rsquo;état « nouveau » : tentatives, séries, planification des
              révisions et historique des tests sont effacés.{" "}
              {resetProgressList.items.length <= 1
                ? "Le mot lui-même est conservé"
                : `Les ${resetProgressList.items.length} mots eux-mêmes sont conservés`}
              .
            </p>
            <p className="field-hint">
              C&rsquo;est irréversible. Exportez une sauvegarde d&rsquo;abord si
              vous pensez vouloir retrouver cette progression.
            </p>
            <Button
              variant="secondary"
              size="sm"
              icon={<Download size={16} />}
              onClick={exportLists}
            >
              Exporter une sauvegarde
            </Button>
          </>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(pendingImport)}
        title="Remplacer des listes existantes ?"
        onClose={() => {
          setPendingImport(null);
          setTransferNotice({ tone: "error", message: "Import annulé." });
        }}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setPendingImport(null);
                setTransferNotice({
                  tone: "error",
                  message: "Import annulé."
                });
              }}
            >
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (pendingImport) {
                  applyImport(pendingImport.lists);
                }
                setPendingImport(null);
              }}
            >
              Remplacer
            </Button>
          </>
        }
      >
        {pendingImport ? (
          <>
            <p className="modal-lead">
              Cet import écrase {pendingImport.replaced.length}{" "}
              {pendingImport.replaced.length <= 1
                ? "liste que vous avez déjà"
                : "listes que vous avez déjà"}
              . Leurs mots et leur progression actuels seront perdus.
            </p>
            <ul className="import-replace-list">
              {pendingImport.replaced.map((list) => (
                <li key={list.id}>
                  <strong dir="auto">{list.title}</strong>{" "}
                  <span className="muted">
                    ({list.items.length}{" "}
                    {list.items.length <= 1 ? "mot" : "mots"} actuellement)
                  </span>
                </li>
              ))}
            </ul>
            <p className="field-hint">
              Exportez une sauvegarde d&rsquo;abord si vous avez un doute.
            </p>
          </>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(shareImport)}
        title="Importer une liste partagée"
        onClose={() => setShareImport(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShareImport(null)}>
              Annuler
            </Button>
            <Button onClick={acceptShareImport}>Importer</Button>
          </>
        }
      >
        {shareImport ? (
          <>
            <p className="modal-lead">
              Quelqu&rsquo;un a partagé{" "}
              {shareImport.length === 1 ? (
                <strong>{shareImport[0].title}</strong>
              ) : (
                <strong>{shareImport.length} listes</strong>
              )}{" "}
              avec vous ({shareImportWordCount}{" "}
              {shareImportWordCount <= 1 ? "mot" : "mots"}).
            </p>
            {shareImportReplaceCount > 0 ? (
              <p className="field-hint">
                Cela remplacera {shareImportReplaceCount}{" "}
                {shareImportReplaceCount <= 1
                  ? "liste existante"
                  : "listes existantes"}
                .
              </p>
            ) : null}
          </>
        ) : null}
      </Modal>
    </div>
  );
}
