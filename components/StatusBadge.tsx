import type { LearningStatus } from "@/types/vocabulary";

const labels: Record<LearningStatus, string> = {
  new: "New",
  learning: "Learning",
  mastered: "Mastered"
};

export function StatusBadge({ status }: { status: LearningStatus }) {
  return <span className={`status-badge status-${status}`}>{labels[status]}</span>;
}
