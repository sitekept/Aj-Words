"use client";

import { useEffect, useState } from "react";
import { Flame, Target } from "lucide-react";

import { Button, IconButton, Modal, cx } from "@/components/ui";
import {
  readActivityLog,
  readTodayCount,
  type ActivityLog
} from "@/lib/activity-log";
import {
  DAILY_GOAL_BOUNDS,
  readDailyGoal,
  writeDailyGoal,
  type DailyGoal
} from "@/lib/daily-goal";
import { activityHeatmap, activityStreak } from "@/lib/stats";

interface ActivityHeatmapProps {
  /** Bumped by the parent after any review so the grid re-reads storage. */
  refreshToken: number;
}

const WEEKS = 26; // ~6 months — comfortable on a sidebar without scrolling.

const formatDay = (date: string): string => {
  const parsed = new Date(`${date}T00:00:00`);
  if (!Number.isFinite(parsed.getTime())) {
    return date;
  }
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(parsed);
};

export function ActivityHeatmap({ refreshToken }: ActivityHeatmapProps) {
  // Read storage only after mount (and on each review) so SSR and the first
  // client render match, and the grid refreshes when the parent bumps the token.
  const [nowIso, setNowIso] = useState<string | null>(null);
  const [log, setLog] = useState<ActivityLog>({});
  const [goal, setGoal] = useState<DailyGoal>({
    enabled: false,
    target: DAILY_GOAL_BOUNDS.default
  });
  const [goalOpen, setGoalOpen] = useState(false);

  useEffect(() => {
    setNowIso(new Date().toISOString());
    setLog(readActivityLog());
    setGoal(readDailyGoal());
  }, [refreshToken]);

  if (!nowIso) {
    return <section className="heatmap" aria-hidden="true" />;
  }

  const heat = activityHeatmap(log, nowIso, WEEKS);
  const streak = activityStreak(log, nowIso);
  const todayCount = readTodayCount(nowIso);
  const goalMet = goal.enabled && todayCount >= goal.target;

  const saveGoal = (next: DailyGoal) => {
    writeDailyGoal(next);
    setGoal(readDailyGoal());
    setGoalOpen(false);
  };

  return (
    <section className="heatmap" aria-labelledby="heatmap-title">
      <header className="heatmap-header">
        <div className="heatmap-heading">
          <h2 id="heatmap-title">Activity</h2>
          <p className="heatmap-subtitle">
            {heat.totalReviews > 0
              ? `${heat.totalReviews} reviews over the last ${WEEKS} weeks`
              : "Your review activity will show up here."}
          </p>
        </div>
        <div className="heatmap-stats">
          {streak > 0 ? (
            <span className="heatmap-streak" title={`${streak}-day streak`}>
              <Flame size={16} aria-hidden="true" />
              {streak}
            </span>
          ) : null}
          <IconButton
            label={goal.enabled ? "Edit daily goal" : "Set a daily goal"}
            variant={goal.enabled ? "secondary" : "ghost"}
            onClick={() => setGoalOpen(true)}
          >
            <Target size={18} />
          </IconButton>
        </div>
      </header>

      {goal.enabled ? (
        <p
          className={cx("heatmap-goal", goalMet && "heatmap-goal-met")}
          aria-live="polite"
        >
          {goalMet
            ? `Daily goal reached — ${todayCount}/${goal.target} today. Nice.`
            : `${todayCount}/${goal.target} reviews today`}
        </p>
      ) : null}

      {/* Time flows left→right regardless of page direction. */}
      <div className="heatmap-grid" dir="ltr" role="img"
        aria-label={
          heat.totalReviews > 0
            ? `Activity heatmap, ${heat.totalReviews} reviews total`
            : "Activity heatmap, no reviews yet"
        }
      >
        {heat.weeks.map((week, weekIndex) => (
          <div className="heatmap-week" key={weekIndex}>
            {week.days.map((day, dayIndex) =>
              day.inRange ? (
                <span
                  key={day.date || dayIndex}
                  className="heatmap-cell"
                  data-intensity={day.intensity}
                  title={`${formatDay(day.date)}: ${day.count} ${
                    day.count === 1 ? "review" : "reviews"
                  }`}
                />
              ) : (
                <span
                  key={`pad-${weekIndex}-${dayIndex}`}
                  className="heatmap-cell heatmap-cell-empty"
                  aria-hidden="true"
                />
              )
            )}
          </div>
        ))}
      </div>

      <div className="heatmap-legend" dir="ltr" aria-hidden="true">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span
            key={level}
            className="heatmap-cell"
            data-intensity={level}
          />
        ))}
        <span>More</span>
      </div>

      <DailyGoalModal
        open={goalOpen}
        goal={goal}
        onClose={() => setGoalOpen(false)}
        onSave={saveGoal}
      />
    </section>
  );
}

interface DailyGoalModalProps {
  open: boolean;
  goal: DailyGoal;
  onClose: () => void;
  onSave: (goal: DailyGoal) => void;
}

function DailyGoalModal({ open, goal, onClose, onSave }: DailyGoalModalProps) {
  const [enabled, setEnabled] = useState(goal.enabled);
  const [target, setTarget] = useState(String(goal.target));

  useEffect(() => {
    if (open) {
      setEnabled(goal.enabled);
      setTarget(String(goal.target));
    }
  }, [open, goal.enabled, goal.target]);

  const parsedTarget = Number.parseInt(target, 10);
  const validTarget = Number.isFinite(parsedTarget)
    ? Math.min(DAILY_GOAL_BOUNDS.max, Math.max(DAILY_GOAL_BOUNDS.min, parsedTarget))
    : DAILY_GOAL_BOUNDS.default;

  return (
    <Modal
      open={open}
      title="Daily goal"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave({ enabled, target: validTarget })}>
            Save
          </Button>
        </>
      }
    >
      <p className="modal-lead">
        A gentle target, not a chore. Missing a day never breaks anything — there
        is no streak debt to repay.
      </p>
      <label className="field field-checkbox">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        <span>Show a daily review goal</span>
      </label>
      <label className="field" htmlFor="daily-goal-target">
        <span>Reviews per day</span>
        <input
          id="daily-goal-target"
          type="number"
          inputMode="numeric"
          min={DAILY_GOAL_BOUNDS.min}
          max={DAILY_GOAL_BOUNDS.max}
          value={target}
          disabled={!enabled}
          onChange={(event) => setTarget(event.target.value)}
        />
        <small className="field-hint">
          Between {DAILY_GOAL_BOUNDS.min} and {DAILY_GOAL_BOUNDS.max}.
        </small>
      </label>
    </Modal>
  );
}
