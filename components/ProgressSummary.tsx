import { BellRing, CheckCircle2, Circle, Clock3 } from "lucide-react";
import { countDue } from "@/lib/srs";
import { getProgress } from "@/lib/vocabulary-storage";
import type { VocabularyItem } from "@/types/vocabulary";

interface ProgressSummaryProps {
  items: VocabularyItem[];
  compact?: boolean;
}

export function ProgressSummary({ items, compact }: ProgressSummaryProps) {
  const progress = getProgress(items);
  const dueCount = countDue(items, new Date().toISOString());
  const masteredWidth = progress.total
    ? `${(progress.mastered / progress.total) * 100}%`
    : "0%";
  const learningWidth = progress.total
    ? `${(progress.learning / progress.total) * 100}%`
    : "0%";
  const freshWidth = progress.total
    ? `${(progress.fresh / progress.total) * 100}%`
    : "0%";

  return (
    <div className={compact ? "progress compact" : "progress"}>
      <div className="progress-track" aria-hidden="true">
        <span className="progress-mastered" style={{ width: masteredWidth }} />
        <span className="progress-learning" style={{ width: learningWidth }} />
        <span className="progress-new" style={{ width: freshWidth }} />
      </div>
      <dl className="progress-stats" aria-label="Learning progress">
        <div>
          <dt>
            <CheckCircle2 size={14} /> Mastered
          </dt>
          <dd>{progress.mastered}</dd>
        </div>
        <div>
          <dt>
            <Clock3 size={14} /> Learning
          </dt>
          <dd>{progress.learning}</dd>
        </div>
        <div>
          <dt>
            <Circle size={14} /> New
          </dt>
          <dd>{progress.fresh}</dd>
        </div>
      </dl>
      {dueCount > 0 ? (
        <p className="due-badge" aria-live="polite">
          <BellRing size={13} aria-hidden="true" />
          {dueCount} due for review
        </p>
      ) : null}
    </div>
  );
}
