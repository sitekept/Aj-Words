"use client";

import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Brain,
  CheckCircle2,
  RotateCcw
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { Button, cx } from "@/components/ui";
import type { FlashcardAssessment, WordList } from "@/types/vocabulary";

interface FlashcardModeProps {
  list: WordList;
  onAssess: (itemId: string, outcome: FlashcardAssessment) => void;
  onBack: () => void;
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

export function FlashcardMode({
  list,
  onAssess,
  onBack
}: FlashcardModeProps) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [drag, setDrag] = useState<DragState>(initialDrag);
  const [exitDirection, setExitDirection] = useState<FlashcardAssessment | null>(null);
  const [complete, setComplete] = useState(false);
  const [summary, setSummary] = useState({ learning: 0, mastered: 0 });
  const suppressClickRef = useRef(false);
  const resolvingRef = useRef(false);
  const cards = useMemo(() => list.items, [list.items]);
  const current = cards[index];

  useEffect(() => {
    setIndex(0);
    setFlipped(false);
    setDrag(initialDrag);
    setExitDirection(null);
    setComplete(false);
    setSummary({ learning: 0, mastered: 0 });
    resolvingRef.current = false;
  }, [list.id]);

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
    setExitDirection(outcome);
    setSummary((value) => ({
      ...value,
      [outcome]: value[outcome] + 1
    }));
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
    setIndex(0);
    setFlipped(false);
    setDrag(initialDrag);
    setExitDirection(null);
    setComplete(false);
    setSummary({ learning: 0, mastered: 0 });
    resolvingRef.current = false;
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
        <span className="study-count">
          {index + 1} / {cards.length}
        </span>
      </header>

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
