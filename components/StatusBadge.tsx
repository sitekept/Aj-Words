import type { LearningStatus } from "@/types/vocabulary";

// Values only: the keys are persisted `status` data and also feed the
// `status-${status}` CSS class, so they must stay in English.
const labels: Record<LearningStatus, string> = {
  new: "Nouveau",
  learning: "En cours",
  mastered: "Acquis"
};

export function StatusBadge({ status }: { status: LearningStatus }) {
  return <span className={`status-badge status-${status}`}>{labels[status]}</span>;
}
