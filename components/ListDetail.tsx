import {
  ArrowLeft,
  BookOpen,
  Brain,
  ClipboardCheck,
  Layers,
  ListChecks,
  Pencil,
  Plus,
  Shuffle,
  Trash2
} from "lucide-react";
import { ProgressSummary } from "@/components/ProgressSummary";
import { StatusBadge } from "@/components/StatusBadge";
import { TestHistory } from "@/components/TestHistory";
import { Button, IconButton } from "@/components/ui";
import type {
  QuizMode,
  TestHistoryEntry,
  VocabularyItem,
  WordList
} from "@/types/vocabulary";

interface ListDetailProps {
  list: WordList;
  onAddWord: () => void;
  onBack: () => void;
  onDeleteList: () => void;
  onDeleteWord: (itemId: string) => void;
  onEditList: () => void;
  onEditWord: (item: VocabularyItem) => void;
  onReviewTest: (entry: TestHistoryEntry) => void;
  onStartFlashcards: () => void;
  onStartQuiz: (mode: QuizMode) => void;
}

export function ListDetail({
  list,
  onAddWord,
  onBack,
  onDeleteList,
  onDeleteWord,
  onEditList,
  onEditWord,
  onReviewTest,
  onStartFlashcards,
  onStartQuiz
}: ListDetailProps) {
  const hasWords = list.items.length > 0;
  const hasChoiceSet = list.items.length >= 4;

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
          <IconButton label="Edit list" onClick={onEditList}>
            <Pencil size={18} />
          </IconButton>
          <IconButton label="Delete list" variant="danger" onClick={onDeleteList}>
            <Trash2 size={18} />
          </IconButton>
        </div>
      </header>

      <ProgressSummary items={list.items} />

      <div className="mode-grid" aria-label="Study modes">
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

      <TestHistory entries={list.testHistory} onReview={onReviewTest} />

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
            <div className="word-list">
              {list.items.map((item) => (
                <article className="word-row" key={item.id}>
                  <div className="word-copy">
                    <div className="word-pair">
                      <strong>{item.word}</strong>
                      <span>{item.translation}</span>
                    </div>
                  </div>
                  <div className="word-controls">
                    <StatusBadge status={item.status} />
                    <div className="inline-actions">
                      <IconButton label={`Edit ${item.word}`} onClick={() => onEditWord(item)}>
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
