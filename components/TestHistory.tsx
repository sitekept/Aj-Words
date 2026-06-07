import { CheckCircle2, Eye, History } from "lucide-react";
import { Button } from "@/components/ui";
import type { QuizMode, TestHistoryEntry } from "@/types/vocabulary";

interface TestHistoryProps {
  entries: TestHistoryEntry[];
  onReview: (entry: TestHistoryEntry) => void;
}

const modeLabels: Record<QuizMode, string> = {
  written: "Written",
  choice: "Multiple choice",
  mixed: "Mixed",
  test: "Test me",
  "full-review": "Full review",
  "review-due": "Daily review"
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));

export function TestHistory({ entries, onReview }: TestHistoryProps) {
  const latestEntries = entries.slice(0, 8);

  return (
    <section className="test-history-section" aria-labelledby="test-history-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Results</p>
          <h2 id="test-history-heading">
            <History size={20} /> Test history
          </h2>
        </div>
      </div>

      {latestEntries.length ? (
        <div className="history-list">
          {latestEntries.map((entry) => (
            <article className="history-row" key={entry.id}>
              <div className="history-score" aria-label={`${entry.score} percent`}>
                <strong>{entry.score}</strong>
                <span>%</span>
              </div>
              <div className="history-meta">
                <strong>{modeLabels[entry.mode]}</strong>
                <span>
                  <CheckCircle2 size={14} />
                  {entry.correctCount} / {entry.total} correct
                </span>
                <small>{formatDate(entry.createdAt)}</small>
              </div>
              <Button
                variant="secondary"
                size="sm"
                icon={<Eye size={16} />}
                onClick={() => onReview(entry)}
              >
                Review
              </Button>
            </article>
          ))}
        </div>
      ) : (
        <div className="history-empty">
          <p className="muted">No test history yet.</p>
        </div>
      )}
    </section>
  );
}
