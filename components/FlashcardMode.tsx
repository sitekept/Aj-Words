"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  RotateCcw
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui";
import type { WordList } from "@/types/vocabulary";

interface FlashcardModeProps {
  list: WordList;
  onBack: () => void;
}

export function FlashcardMode({
  list,
  onBack
}: FlashcardModeProps) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const cards = useMemo(() => list.items, [list.items]);
  const current = cards[index];

  useEffect(() => {
    setIndex(0);
    setFlipped(false);
  }, [list.id]);

  const move = (nextIndex: number) => {
    setIndex(nextIndex);
    setFlipped(false);
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
        <button
          type="button"
          className={`flashcard ${flipped ? "is-flipped" : ""}`}
          aria-pressed={flipped}
          onClick={() => setFlipped((value) => !value)}
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

      <div className="flashcard-actions">
        <Button
          variant="secondary"
          icon={<ChevronLeft size={18} />}
          onClick={() => move(index - 1)}
          disabled={index === 0}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          icon={<RotateCcw size={18} />}
          onClick={() => setFlipped((value) => !value)}
        >
          Flip
        </Button>
        <Button
          variant="secondary"
          icon={<ChevronRight size={18} />}
          onClick={() => move(index + 1)}
          disabled={index === cards.length - 1}
        >
          Next
        </Button>
      </div>
    </section>
  );
}
