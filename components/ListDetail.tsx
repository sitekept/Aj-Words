"use client";

import { useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Brain,
  ClipboardCheck,
  Clock,
  Layers,
  ListChecks,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Shuffle,
  Trash2,
  Volume2
} from "lucide-react";
import { ProgressSummary } from "@/components/ProgressSummary";
import { StatusBadge } from "@/components/StatusBadge";
import { TestHistory } from "@/components/TestHistory";
import { countDue } from "@/lib/srs";
import { canUseChoice } from "@/lib/quiz-options";
import { canSpeak, resolveSpeechLangs, speak } from "@/lib/speech";
import { useSpeechVoices } from "@/lib/useSpeechVoices";
import { Button, IconButton } from "@/components/ui";
import type {
  LearningStatus,
  QuizDirection,
  QuizMode,
  TestHistoryEntry,
  VocabularyItem,
  WordList
} from "@/types/vocabulary";

interface ListDetailProps {
  direction: QuizDirection;
  list: WordList;
  onAddWord: () => void;
  onBack: () => void;
  onDeleteList: () => void;
  onDeleteWord: (itemId: string) => void;
  onDirectionChange: (direction: QuizDirection) => void;
  onEditList: () => void;
  onEditWord: (item: VocabularyItem) => void;
  onResetProgress: () => void;
  onReviewTest: (entry: TestHistoryEntry) => void;
  onShareList: () => void;
  onStartFlashcards: () => void;
  onStartQuiz: (mode: QuizMode) => void;
}

type StatusFilter = "all" | LearningStatus;

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "learning", label: "Learning" },
  { value: "mastered", label: "Mastered" }
];

export function ListDetail({
  direction,
  list,
  onAddWord,
  onBack,
  onDeleteList,
  onDeleteWord,
  onDirectionChange,
  onEditList,
  onEditWord,
  onResetProgress,
  onReviewTest,
  onShareList,
  onStartFlashcards,
  onStartQuiz
}: ListDetailProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // 0 until mounted on a speech-capable browser; bumps once voices load.
  const speechVersion = useSpeechVoices();
  const speechLangs = resolveSpeechLangs(list.language);

  const speakButton = (text: string, lang: string | undefined) =>
    speechVersion > 0 && lang && canSpeak(lang) ? (
      <IconButton
        label={`Listen to "${text}"`}
        onClick={() => speak(text, lang)}
      >
        <Volume2 size={16} />
      </IconButton>
    ) : null;

  // Reset the word filters when the user switches to a different list.
  const [filterListId, setFilterListId] = useState(list.id);
  if (filterListId !== list.id) {
    setFilterListId(list.id);
    setQuery("");
    setStatusFilter("all");
  }

  const hasWords = list.items.length > 0;
  // Must agree with QuizRunner: offering "Multiple choice" for a list that
  // cannot fill four distinct options would silently fall back to written.
  const hasChoiceSet = canUseChoice(list.items, direction);
  const dueCount = countDue(list.items, new Date().toISOString());

  const normalizedQuery = query.trim().toLowerCase();
  const isFiltering = normalizedQuery.length > 0 || statusFilter !== "all";
  const visibleItems = list.items.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return (
      item.word.toLowerCase().includes(normalizedQuery) ||
      item.translation.toLowerCase().includes(normalizedQuery) ||
      (item.note?.toLowerCase().includes(normalizedQuery) ?? false) ||
      (item.example?.toLowerCase().includes(normalizedQuery) ?? false) ||
      (item.tags?.some((tag) => tag.toLowerCase().includes(normalizedQuery)) ??
        false)
    );
  });

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
  };

  const confirmWordDelete = (item: VocabularyItem) => {
    if (window.confirm(`Delete "${item.word}" from this list?`)) {
      onDeleteWord(item.id);
    }
  };

  return (
    <section className="detail" aria-labelledby="detail-title">
      <div className="mobile-back">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={17} />} onClick={onBack}>
          Lists
        </Button>
      </div>

      <header className="detail-header">
        <div className="detail-title">
          <p className="eyebrow">{list.language || "Vocabulary"}</p>
          <h1 id="detail-title">{list.title}</h1>
        </div>
        <div className="header-actions">
          <IconButton label="Share list" onClick={onShareList}>
            <Share2 size={18} />
          </IconButton>
          {hasWords ? (
            <IconButton label="Reset progress" onClick={onResetProgress}>
              <RotateCcw size={18} />
            </IconButton>
          ) : null}
          <IconButton label="Edit list" onClick={onEditList}>
            <Pencil size={18} />
          </IconButton>
          <IconButton label="Delete list" variant="danger" onClick={onDeleteList}>
            <Trash2 size={18} />
          </IconButton>
        </div>
      </header>

      <ProgressSummary items={list.items} />

      {hasWords && dueCount === 0 ? (
        <p className="muted">Nothing due — all caught up</p>
      ) : null}

      <div
        className="inline-actions quiz-direction-toggle"
        role="group"
        aria-label="Quiz direction"
      >
        <Button
          size="sm"
          variant={direction === "forward" ? "primary" : "ghost"}
          aria-pressed={direction === "forward"}
          onClick={() => onDirectionChange("forward")}
        >
          Word → Translation
        </Button>
        <Button
          size="sm"
          variant={direction === "reverse" ? "primary" : "ghost"}
          aria-pressed={direction === "reverse"}
          onClick={() => onDirectionChange("reverse")}
        >
          Translation → Word
        </Button>
      </div>

      <div className="mode-grid" aria-label="Study modes">
        {dueCount > 0 ? (
          <Button icon={<Clock size={18} />} onClick={() => onStartQuiz("test")}>
            Review ({dueCount})
          </Button>
        ) : null}
        <Button
          icon={<ClipboardCheck size={18} />}
          onClick={() => onStartQuiz("test")}
          disabled={!hasWords}
        >
          Test me
        </Button>
        <Button
          variant="secondary"
          icon={<Layers size={18} />}
          onClick={onStartFlashcards}
          disabled={!hasWords}
        >
          Flashcards
        </Button>
        <Button
          variant="secondary"
          icon={<Brain size={18} />}
          onClick={() => onStartQuiz("written")}
          disabled={!hasWords}
        >
          Written quiz
        </Button>
        <Button
          variant="secondary"
          icon={<ListChecks size={18} />}
          onClick={() => onStartQuiz("choice")}
          disabled={!hasChoiceSet}
        >
          Multiple choice
        </Button>
        <Button
          variant="secondary"
          icon={<Shuffle size={18} />}
          onClick={() => onStartQuiz("mixed")}
          disabled={!hasChoiceSet}
        >
          Mixed test
        </Button>
        <Button
          variant="secondary"
          icon={<BookOpen size={18} />}
          onClick={() => onStartQuiz("full-review")}
          disabled={!hasWords}
        >
          Full review
        </Button>
      </div>

      <TestHistory entries={list.testHistory} items={list.items} onReview={onReviewTest} />

      <section className="word-section" aria-labelledby="words-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Terms</p>
            <h2 id="words-heading">Words</h2>
          </div>
          <Button size="sm" icon={<Plus size={17} />} onClick={onAddWord}>
            Add word
          </Button>
        </div>

        {list.items.length ? (
          <>
            <input
              type="search"
              aria-label="Search words"
              placeholder="Search words"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div
              className="inline-actions"
              role="group"
              aria-label="Filter words by status"
            >
              {STATUS_FILTERS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={statusFilter === option.value ? "primary" : "ghost"}
                  aria-pressed={statusFilter === option.value}
                  onClick={() => setStatusFilter(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            {isFiltering ? (
              <p className="muted">
                {visibleItems.length} of {list.items.length} words
              </p>
            ) : null}
            {visibleItems.length ? (
              <>
                <div className="word-list">
                  {visibleItems.map((item) => (
                    <article className="word-row" key={item.id}>
                      <div className="word-copy">
                        <div className="word-pair">
                          <div className="word-side">
                            <strong>{item.word}</strong>
                            {speakButton(item.word, speechLangs.word)}
                          </div>
                          <div className="word-side">
                            <span>{item.translation}</span>
                            {speakButton(item.translation, speechLangs.translation)}
                          </div>
                        </div>
                        {item.note ? (
                          <p className="muted word-note" dir="auto">
                            {item.note}
                          </p>
                        ) : null}
                        {item.example ? (
                          <p className="muted word-note word-example" dir="auto">
                            {item.example}
                          </p>
                        ) : null}
                        {item.tags?.length ? (
                          <div className="tag-chips">
                            {item.tags.map((tag) => (
                              <span className="tag-chip" key={tag} dir="auto">
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="word-controls">
                        <StatusBadge status={item.status} />
                        <div className="inline-actions">
                          <IconButton
                            label={`Edit ${item.word}`}
                            onClick={() => onEditWord(item)}
                          >
                            <Pencil size={16} />
                          </IconButton>
                          <IconButton
                            label={`Delete ${item.word}`}
                            variant="danger"
                            onClick={() => confirmWordDelete(item)}
                          >
                            <Trash2 size={16} />
                          </IconButton>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="word-list-actions">
                  <Button variant="secondary" icon={<Plus size={18} />} onClick={onAddWord}>
                    Add word
                  </Button>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <Search size={28} />
                <h3>No words match your search</h3>
                <p className="muted">Try a different search or clear the filters.</p>
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <BookOpen size={28} />
            <h3>No words in this list</h3>
            <p className="muted">Add words here to start studying this list.</p>
            <Button icon={<Plus size={18} />} onClick={onAddWord}>
              Add word
            </Button>
          </div>
        )}
      </section>
    </section>
  );
}
