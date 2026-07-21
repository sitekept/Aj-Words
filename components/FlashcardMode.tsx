"use client";

import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Brain,
  CheckCircle2,
  RotateCcw,
  Shuffle,
  Undo2,
  Volume2
} from "lucide-react";
import { ItemImage } from "@/components/ItemImage";
import { StatusBadge } from "@/components/StatusBadge";
import { canSpeak, resolveSpeechLangs, speak } from "@/lib/speech";
import { useSpeechVoices } from "@/lib/useSpeechVoices";
import { Button, IconButton, cx } from "@/components/ui";
import type {
  FlashcardAssessment,
  VocabularyItem,
  WordList
} from "@/types/vocabulary";

interface FlashcardModeProps {
  initialIndex: number;
  list: WordList;
  onAssess: (itemId: string, outcome: FlashcardAssessment) => void;
  onBack: () => void;
  onPositionChange: (nextIndex: number) => void;
  onUndo: (snapshot: VocabularyItem) => void;
}

interface LastAction {
  snapshot: VocabularyItem;
  index: number;
  outcome: FlashcardAssessment;
}

interface DragState {
  active: boolean;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
}

const SWIPE_THRESHOLD = 92;
const INTENT_THRESHOLD = 34;
const EXIT_DELAY = 230;

const initialDrag: DragState = {
  active: false,
  offsetX: 0,
  offsetY: 0,
  startX: 0,
  startY: 0
};

const getSafeInitialIndex = (value: number, total: number) => {
  if (!total || !Number.isFinite(value)) {
    return 0;
  }

  const nextIndex = Math.floor(value);
  return nextIndex >= 0 && nextIndex < total ? nextIndex : 0;
};

const shuffleIds = (items: VocabularyItem[]) => {
  const ids = items.map((item) => item.id);

  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }

  return ids;
};

const progressTrackStyle = {
  height: "6px",
  borderRadius: "999px",
  background: "var(--border)",
  overflow: "hidden"
} as const;

const progressFillStyle = {
  height: "100%",
  borderRadius: "inherit",
  background: "var(--primary)"
} as const;

export function FlashcardMode({
  initialIndex,
  list,
  onAssess,
  onBack,
  onPositionChange,
  onUndo
}: FlashcardModeProps) {
  // Stable shuffled ID order so per-swipe store updates never reshuffle
  // mid-session; null means the list's own order.
  const [orderedIds, setOrderedIds] = useState<string[] | null>(null);
  const cards = useMemo(() => {
    if (!orderedIds) {
      return list.items;
    }

    const itemsById = new Map(list.items.map((item) => [item.id, item]));
    return orderedIds
      .map((id) => itemsById.get(id))
      .filter((item): item is VocabularyItem => Boolean(item));
  }, [list.items, orderedIds]);
  const [index, setIndex] = useState(() =>
    getSafeInitialIndex(initialIndex, list.items.length)
  );
  const [flipped, setFlipped] = useState(false);
  const [drag, setDrag] = useState<DragState>(initialDrag);
  const [exitDirection, setExitDirection] = useState<FlashcardAssessment | null>(null);
  const [complete, setComplete] = useState(false);
  const [summary, setSummary] = useState({ learning: 0, mastered: 0 });
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  const suppressClickRef = useRef(false);
  const resolvingRef = useRef(false);
  const current = cards[index];

  // 0 until mounted on a speech-capable browser; bumps once voices load.
  const speechVersion = useSpeechVoices();
  const speechLangs = resolveSpeechLangs(list.language);
  // The speak button reads the currently visible face. It lives in the
  // actions row, never inside the card — the card itself is a <button> and
  // nested buttons are invalid HTML.
  const faceLang = flipped ? speechLangs.translation : speechLangs.word;
  const faceText = current ? (flipped ? current.translation : current.word) : "";

  useEffect(() => {
    setIndex(getSafeInitialIndex(initialIndex, cards.length));
    setFlipped(false);
    setDrag(initialDrag);
    setExitDirection(null);
    setComplete(false);
    setSummary({ learning: 0, mastered: 0 });
    setLastAction(null);
    setOrderedIds(null);
    resolvingRef.current = false;
  }, [cards.length, initialIndex, list.id]);

  const resetDrag = () => {
    setDrag(initialDrag);
    suppressClickRef.current = false;
  };

  const getExitDelay = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : EXIT_DELAY;

  const assessCard = (outcome: FlashcardAssessment) => {
    if (!current || exitDirection || resolvingRef.current) {
      return;
    }

    resolvingRef.current = true;
    const isLastCard = index >= cards.length - 1;
    const nextIndex = isLastCard ? 0 : index + 1;
    // Snapshot before the assessment mutates the item, so undo can restore
    // the exact pre-swipe SRS fields.
    setLastAction({ snapshot: { ...current }, index, outcome });
    setExitDirection(outcome);
    setSummary((value) => ({
      ...value,
      [outcome]: value[outcome] + 1
    }));
    onPositionChange(nextIndex);
    onAssess(current.id, outcome);

    window.setTimeout(() => {
      setExitDirection(null);
      setDrag(initialDrag);
      setFlipped(false);
      suppressClickRef.current = false;
      resolvingRef.current = false;

      if (isLastCard) {
        setComplete(true);
        return;
      }

      setIndex((value) => value + 1);
    }, getExitDelay());
  };

  const restart = () => {
    onPositionChange(0);
    setIndex(0);
    setFlipped(false);
    setDrag(initialDrag);
    setExitDirection(null);
    setComplete(false);
    setSummary({ learning: 0, mastered: 0 });
    setLastAction(null);
    resolvingRef.current = false;
  };

  const undoLastAssessment = () => {
    if (!lastAction || exitDirection) {
      return;
    }

    onUndo(lastAction.snapshot);
    onPositionChange(lastAction.index);
    setIndex(lastAction.index);
    setSummary((value) => ({
      ...value,
      [lastAction.outcome]: Math.max(0, value[lastAction.outcome] - 1)
    }));
    setComplete(false);
    setFlipped(false);
    setDrag(initialDrag);
    suppressClickRef.current = false;
    resolvingRef.current = false;
    setLastAction(null);
  };

  // The resume index is order-dependent, so toggling shuffle restarts at 0.
  const toggleShuffle = () => {
    if (exitDirection || resolvingRef.current) {
      return;
    }

    setOrderedIds((value) => (value ? null : shuffleIds(list.items)));
    onPositionChange(0);
    setIndex(0);
    setFlipped(false);
    setDrag(initialDrag);
    setComplete(false);
    setSummary({ learning: 0, mastered: 0 });
    setLastAction(null);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (exitDirection) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      active: true,
      offsetX: 0,
      offsetY: 0,
      startX: event.clientX,
      startY: event.clientY
    });
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.active || exitDirection) {
      return;
    }

    const offsetX = event.clientX - drag.startX;
    const rawOffsetY = event.clientY - drag.startY;

    if (Math.abs(offsetX) > 8 || Math.abs(rawOffsetY) > 8) {
      suppressClickRef.current = true;
    }

    if (Math.abs(offsetX) > Math.abs(rawOffsetY)) {
      event.preventDefault();
    }

    setDrag((value) => ({
      ...value,
      offsetX,
      offsetY: rawOffsetY * 0.16
    }));
  };

  const handlePointerEnd = () => {
    if (!drag.active || exitDirection) {
      return;
    }

    if (Math.abs(drag.offsetX) >= SWIPE_THRESHOLD) {
      assessCard(drag.offsetX > 0 ? "mastered" : "learning");
      return;
    }

    resetDrag();
  };

  if (!current) {
    return (
      <section className="study-view">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={17} />} onClick={onBack}>
          Back
        </Button>
        <div className="empty-state">
          <h2>No cards yet</h2>
        </div>
      </section>
    );
  }

  if (complete) {
    const total = summary.learning + summary.mastered;

    return (
      <section className="study-view" aria-labelledby="flashcard-title">
        <header className="study-header">
          <Button variant="ghost" size="sm" icon={<ArrowLeft size={17} />} onClick={onBack}>
            Back
          </Button>
          <div>
            <p className="eyebrow">{list.title}</p>
            <h1 id="flashcard-title">Flashcards</h1>
          </div>
          <span className="study-count">
            {cards.length} / {cards.length}
          </span>
        </header>

        <section className="flashcard-summary" aria-labelledby="flashcard-summary-title">
          <p className="eyebrow">Session complete</p>
          <h2 id="flashcard-summary-title">{total} cards reviewed</h2>
          <div className="flashcard-summary-grid">
            <article className="flashcard-summary-card learning">
              <span>Learning</span>
              <strong>{summary.learning}</strong>
            </article>
            <article className="flashcard-summary-card mastered">
              <span>Mastered</span>
              <strong>{summary.mastered}</strong>
            </article>
          </div>
          <div className="flashcard-actions">
            <Button
              variant="ghost"
              icon={<Undo2 size={18} />}
              onClick={undoLastAssessment}
              disabled={!lastAction}
            >
              Undo
            </Button>
            <Button variant="secondary" icon={<ArrowLeft size={18} />} onClick={onBack}>
              Back to list
            </Button>
            <Button icon={<RotateCcw size={18} />} onClick={restart}>
              Restart flashcards
            </Button>
          </div>
        </section>
      </section>
    );
  }

  const intent =
    drag.offsetX > INTENT_THRESHOLD
      ? "mastered"
      : drag.offsetX < -INTENT_THRESHOLD
        ? "learning"
        : null;
  const rotation = Math.max(-14, Math.min(14, drag.offsetX / 16));
  const stageStyle = exitDirection
    ? undefined
    : {
        transform: `translate3d(${drag.offsetX}px, ${drag.offsetY}px, 0) rotate(${rotation}deg)`
      };

  return (
    <section className="study-view" aria-labelledby="flashcard-title">
      <header className="study-header">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={17} />} onClick={onBack}>
          Back
        </Button>
        <div>
          <p className="eyebrow">{list.title}</p>
          <h1 id="flashcard-title">Flashcards</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <IconButton
            label={orderedIds ? "Turn off shuffle" : "Shuffle cards"}
            aria-pressed={Boolean(orderedIds)}
            onClick={toggleShuffle}
            style={orderedIds ? { color: "var(--primary)" } : undefined}
          >
            <Shuffle size={17} />
          </IconButton>
          <span className="study-count">
            {index + 1} / {cards.length}
          </span>
        </div>
      </header>

      {/* The deck advances and flips without moving focus, so nothing would
          otherwise tell a screen-reader user the card changed. Mounted for the
          whole session so each update registers as a change. */}
      <p className="sr-only" role="status" aria-live="polite">
        {`Card ${index + 1} of ${cards.length}. ${
          flipped ? `Translation: ${current.translation}` : `Word: ${current.word}`
        }`}
      </p>

      <div
        className="flashcard-progress"
        role="progressbar"
        aria-label="Deck progress"
        aria-valuemin={0}
        aria-valuemax={cards.length}
        aria-valuenow={index}
        style={progressTrackStyle}
      >
        <div
          style={{
            ...progressFillStyle,
            width: `${(index / cards.length) * 100}%`
          }}
        />
      </div>

      <div className="flashcard-shell">
        <div className="flashcard-swipe-rail" aria-hidden="true">
          <span className="learning">Learning</span>
          <span className="mastered">Mastered</span>
        </div>

        <div
          className={cx(
            "flashcard-stage",
            drag.active && "is-dragging",
            intent === "learning" && "intent-learning",
            intent === "mastered" && "intent-mastered",
            exitDirection === "learning" && "is-exiting-learning",
            exitDirection === "mastered" && "is-exiting-mastered"
          )}
          style={stageStyle}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={resetDrag}
        >
          <span className="flashcard-decision flashcard-decision-learning">
            Learning
          </span>
          <span className="flashcard-decision flashcard-decision-mastered">
            Mastered
          </span>
          <button
            type="button"
            className={`flashcard ${flipped ? "is-flipped" : ""}`}
            aria-label={flipped ? "Show word" : "Show translation"}
            aria-pressed={flipped}
            onClick={(event) => {
              if (suppressClickRef.current) {
                event.preventDefault();
                suppressClickRef.current = false;
                return;
              }

              setFlipped((value) => !value);
            }}
          >
            <span className="flashcard-side flashcard-front">
              <small>Word</small>
              <strong>{current.word}</strong>
              <ItemImage
                imageId={current.imageId}
                imageUrl={current.imageUrl}
                className="flashcard-image"
              />
              <StatusBadge status={current.status} />
            </span>
            <span className="flashcard-side flashcard-back">
              <small>Translation</small>
              <strong>{current.translation}</strong>
            </span>
          </button>
        </div>
      </div>

      <div className="flashcard-actions">
        <Button
          variant="ghost"
          icon={<Undo2 size={18} />}
          onClick={undoLastAssessment}
          disabled={Boolean(exitDirection) || !lastAction}
        >
          Undo
        </Button>
        <Button
          variant="secondary"
          icon={<Brain size={18} />}
          onClick={() => assessCard("learning")}
          disabled={Boolean(exitDirection)}
        >
          Learning
        </Button>
        <Button
          variant="secondary"
          icon={<RotateCcw size={18} />}
          onClick={() => setFlipped((value) => !value)}
        >
          Flip
        </Button>
        {speechVersion > 0 && faceLang && canSpeak(faceLang) ? (
          <IconButton
            label={`Listen to "${faceText}"`}
            onClick={() => speak(faceText, faceLang)}
          >
            <Volume2 size={18} />
          </IconButton>
        ) : null}
        <Button
          icon={<CheckCircle2 size={18} />}
          onClick={() => assessCard("mastered")}
          disabled={Boolean(exitDirection)}
        >
          Mastered
        </Button>
      </div>
    </section>
  );
}
