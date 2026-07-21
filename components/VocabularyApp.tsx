"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Download, Home, Plus, Upload } from "lucide-react";
import { ActivityHeatmap } from "@/components/ActivityHeatmap";
import { AJWordsScene } from "@/components/AJWordsScene";
import { BrandLogo } from "@/components/BrandLogo";
import { FlashcardMode } from "@/components/FlashcardMode";
import { ListDetail } from "@/components/ListDetail";
import { ListFormModal } from "@/components/ListFormModal";
import { ListLibrary } from "@/components/ListLibrary";
import { QuizRunner } from "@/components/QuizRunner";
import { ScoreScreen } from "@/components/ScoreScreen";
import { WordFormModal } from "@/components/WordFormModal";
import { Button, Modal } from "@/components/ui";
import { recordActivity } from "@/lib/activity-log";
import { pruneImages } from "@/lib/image-store";
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

const UI_STATE_KEY = "ajwords.v1.ui";
const FLASHCARD_STATE_KEY = "ajwords.v1.flashcards";

type FlashcardPositionStore = Record<
  string,
  {
    nextIndex: number;
    updatedAt: string;
  }
>;

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
  const importInputRef = useRef<HTMLInputElement>(null);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
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
          message: "This share link could not be read."
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
          message: "This share link is not a valid AJ Words list."
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [store.hydrated]);

  // Once, after hydration: drop image blobs no longer referenced by any item
  // (e.g. a word deleted in a previous session). Best-effort, never blocks.
  useEffect(() => {
    if (!store.hydrated) {
      return;
    }

    const referenced = new Set<string>();
    store.lists.forEach((list) =>
      list.items.forEach((item) => {
        if (item.imageId) {
          referenced.add(item.imageId);
        }
      })
    );
    void pruneImages(referenced);
    // Intentionally runs only when hydration flips; later edits GC on next load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.hydrated]);

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
          "Online lists stay available for everyone. Edit or add a word to create your local copy."
      });
      return;
    }

    if (window.confirm(`Delete "${list.title}" and all of its words?`)) {
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
          message: "Created a local copy for your edits."
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
        message: "Created a local copy for your word changes."
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
        message: "Create a list before exporting."
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
      message: `Exported ${store.lists.length} ${
        store.lists.length === 1 ? "list" : "lists"
      }.`
    });
  };

  const shareSelectedList = async (list: WordList) => {
    try {
      // Single-list payload; createExportPayload already strips device-local
      // images (imageId) so only text + external imageUrl travel in the link.
      const payload = createExportPayload([list]);
      const encoded = await encodeShare(payload);

      if (encoded.tooLarge) {
        setTransferNotice({
          tone: "error",
          message: "This list is too large to share by link — use Export instead."
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
            ? "Share link copied — it's long, so some apps may trim it."
            : "Share link copied to the clipboard."
        });
      } catch {
        setTransferNotice({
          tone: "error",
          message: "Could not copy the link. Check clipboard permissions."
        });
      }
    } catch {
      setTransferNotice({
        tone: "error",
        message: "Could not create a share link for this list."
      });
    }
  };

  const importListsFromFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      let payload: unknown;

      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error("This file is not valid JSON.");
      }

      const parsed = parseExportPayload(payload);

      if (!parsed.lists.length) {
        throw new Error("This export does not contain any lists.");
      }

      const existingCount = parsed.lists.filter(
        (list) => !isPublicListId(list.id) && store.listMap.has(list.id)
      ).length;

      if (
        existingCount &&
        !window.confirm(
          `Importing this file will replace ${existingCount} existing ${
            existingCount === 1 ? "list" : "lists"
          }. Continue?`
        )
      ) {
        setTransferNotice({
          tone: "error",
          message: "Import cancelled."
        });
        return;
      }

      const summary = store.importLists(parsed.lists);
      showList(summary.listIds[0]);
      setTransferNotice({
        tone: "success",
        message: `Imported ${summary.total} ${
          summary.total === 1 ? "list" : "lists"
        }: ${summary.added} added, ${summary.replaced} replaced.`
      });
    } catch (error) {
      setTransferNotice({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "This file could not be imported."
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
      message: `Imported ${summary.total} ${
        summary.total === 1 ? "list" : "lists"
      } from a share link.`
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
        message: "Created a local copy for your word changes."
      });
    }
  };

  if (!store.hydrated || !uiHydrated) {
    return (
      <main className="loading-screen">
        <div className="loading-card">
          <BrandLogo />
          <span>Loading AJ Words</span>
        </div>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <button type="button" className="brand-button" onClick={goHome}>
          <BrandLogo />
          <strong>AJ Words</strong>
        </button>
        <div className="topbar-actions">
          <Button variant="ghost" size="sm" icon={<Home size={17} />} onClick={goHome}>
            Home
          </Button>
          <Button
            className="topbar-transfer"
            variant="secondary"
            size="sm"
            icon={<Download size={17} />}
            onClick={exportLists}
            disabled={!store.lists.length}
          >
            <span className="topbar-action-label">Export</span>
          </Button>
          <Button
            className="topbar-transfer"
            variant="secondary"
            size="sm"
            icon={<Upload size={17} />}
            onClick={() => importInputRef.current?.click()}
          >
            <span className="topbar-action-label">Import</span>
          </Button>
          <Button
            className="topbar-new-list"
            size="sm"
            icon={<Plus size={17} />}
            onClick={() => setListFormState({ mode: "create" })}
          >
            <span className="topbar-new-label">New list</span>
          </Button>
          <input
            ref={importInputRef}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            onChange={importListsFromFile}
            aria-label="Import AJ Words JSON file"
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
            Export lists
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

      <main className={`workspace ${hasWorkspaceSelection ? "has-selection" : ""}`}>
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
        </aside>

        <section className="workspace-panel">
          {!hasWorkspaceSelection ? (
            <section className="welcome-panel" aria-labelledby="welcome-title">
              <div className="welcome-copy">
                <p className="eyebrow">AJ Words</p>
                <h1 id="welcome-title">Learn words with focus and rhythm</h1>
                <p>
                  Build local word lists, flip tactile cards, and test recall
                  without losing speed.
                </p>
                <div className="welcome-actions">
                  <Button
                    icon={<Plus size={18} />}
                    onClick={() => setListFormState({ mode: "create" })}
                  >
                    Create list
                  </Button>
                  <span className="welcome-metric">
                    <strong>{store.lists.length}</strong>
                    {store.lists.length === 1 ? " saved list" : " saved lists"}
                  </span>
                </div>
              </div>
              <AJWordsScene />
            </section>
          ) : null}

          {hasSelectedList && !selectedList ? (
            <section className="detail" aria-labelledby="list-loading-title">
              <div className="empty-state">
                <h2 id="list-loading-title">Loading list</h2>
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
        open={Boolean(shareImport)}
        title="Import shared list"
        onClose={() => setShareImport(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShareImport(null)}>
              Cancel
            </Button>
            <Button onClick={acceptShareImport}>Import</Button>
          </>
        }
      >
        {shareImport ? (
          <>
            <p className="modal-lead">
              Someone shared{" "}
              {shareImport.length === 1 ? (
                <strong>{shareImport[0].title}</strong>
              ) : (
                <strong>{shareImport.length} lists</strong>
              )}{" "}
              with you ({shareImportWordCount}{" "}
              {shareImportWordCount === 1 ? "word" : "words"}).
            </p>
            {shareImportReplaceCount > 0 ? (
              <p className="field-hint">
                This will replace {shareImportReplaceCount} existing{" "}
                {shareImportReplaceCount === 1 ? "list" : "lists"}.
              </p>
            ) : null}
            <p className="field-hint">
              Locally stored images are not included in share links.
            </p>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
