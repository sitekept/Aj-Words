import { CheckCircle2, Eye, History } from "lucide-react";
import { Button } from "@/components/ui";
import { dueByDay, hardestWords, sessionSuccessSeries } from "@/lib/stats";
import type { QuizMode, TestHistoryEntry, VocabularyItem } from "@/types/vocabulary";

interface TestHistoryProps {
  entries: TestHistoryEntry[];
  items?: VocabularyItem[];
  onReview: (entry: TestHistoryEntry) => void;
}

const modeLabels: Record<QuizMode, string> = {
  written: "Written",
  choice: "Multiple choice",
  mixed: "Mixed",
  test: "Test me",
  "full-review": "Full review"
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));

export function TestHistory({ entries, items, onReview }: TestHistoryProps) {
  const latestEntries = entries.slice(0, 8);

  // Compact stats over the full history/list (charts are pure CSS; the data
  // helpers live in lib/stats.ts). Each block only renders when it has data.
  const sessions = sessionSuccessSeries(entries);
  const hardest = items ? hardestWords(items) : [];
  const dueBuckets = items ? dueByDay(items, new Date().toISOString()) : [];
  const dueTotal = dueBuckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const maxDue = Math.max(...dueBuckets.map((bucket) => bucket.count), 1);
  const hasStats = sessions.length > 0 || hardest.length > 0 || dueTotal > 0;

  const latestScore = sessions.length ? sessions[sessions.length - 1].score : 0;
  const dueSummary = dueBuckets
    .filter((bucket) => bucket.count > 0)
    .map((bucket) => `${bucket.label}: ${bucket.count}`)
    .join(", ");

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

      {hasStats ? (
        <div className="stats-panel">
          {sessions.length ? (
            <div className="stats-block">
              <h3>Progress</h3>
              <div
                className="stats-chart-scroll"
                role="img"
                aria-label={`Score per session, oldest to newest, across ${sessions.length} ${
                  sessions.length === 1 ? "session" : "sessions"
                }. Latest score ${latestScore} percent.`}
              >
                <div
                  className="stats-bars"
                  data-scrollable={sessions.length > 15 || undefined}
                  aria-hidden="true"
                >
                  {sessions.map((point) => (
                    <span
                      key={point.id}
                      className="stats-bar"
                      style={{ height: `${Math.max(point.score, 4)}%` }}
                      title={`${point.score}% — ${formatDate(point.createdAt)}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {hardest.length ? (
            <div className="stats-block">
              <h3>Hardest words</h3>
              <ul className="stats-chip-list" aria-label="Most-missed words">
                {hardest.map(({ item, wrongCount }) => (
                  <li className="stats-chip" key={item.id}>
                    <span dir="auto">{item.word}</span>
                    <span
                      className="stats-chip-count"
                      aria-label={`missed ${wrongCount} ${wrongCount === 1 ? "time" : "times"}`}
                    >
                      ✗{wrongCount}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {dueTotal > 0 ? (
            <div className="stats-block">
              <h3>Due next 7 days</h3>
              <div
                className="stats-due"
                role="img"
                aria-label={`${dueTotal} ${
                  dueTotal === 1 ? "card" : "cards"
                } due in the next 7 days. ${dueSummary}.`}
              >
                <div className="stats-due-bars" aria-hidden="true">
                  {dueBuckets.map((bucket) => (
                    <div
                      className="stats-due-col"
                      key={bucket.date}
                      title={`${bucket.count} due ${bucket.label}`}
                    >
                      <strong>{bucket.count}</strong>
                      <span className="stats-due-meter">
                        <span
                          className="stats-due-bar"
                          style={{
                            height: bucket.count
                              ? `${Math.max((bucket.count / maxDue) * 100, 8)}%`
                              : "0%"
                          }}
                        />
                      </span>
                      <small>{bucket.label}</small>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

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
