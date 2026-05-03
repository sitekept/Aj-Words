"use client";

import { useMemo } from "react";
import { ArrowLeft, CheckCircle2, ListChecks, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui";
import type { QuizAttempt, QuizMode, VocabularyItem, WordList } from "@/types/vocabulary";

interface ScoreScreenProps {
  attempts: QuizAttempt[];
  list: WordList;
  mode: QuizMode;
  onBack: () => void;
  onRepeat: () => void;
}

const modeLabels: Record<QuizMode, string> = {
  written: "Written quiz",
  choice: "Multiple choice",
  mixed: "Mixed test",
  test: "Test me"
};

const questionTypeLabels = {
  written: "Written",
  choice: "Multiple choice"
};

export function ScoreScreen({
  attempts,
  list,
  mode,
  onBack,
  onRepeat
}: ScoreScreenProps) {
  const correct = attempts.filter((attempt) => attempt.isCorrect);
  const mistakes = attempts.filter((attempt) => !attempt.isCorrect);
  const percent = attempts.length
    ? Math.round((correct.length / attempts.length) * 100)
    : 0;

  const reviewWords = useMemo(() => {
    const seen = new Set<string>();
    return mistakes
      .map((attempt) => list.items.find((item) => item.id === attempt.itemId))
      .filter((item): item is VocabularyItem => {
        if (!item || seen.has(item.id)) {
          return false;
        }
        seen.add(item.id);
        return true;
      });
  }, [list.items, mistakes]);

  return (
    <section className="study-view score-view" aria-labelledby="score-title">
      <header className="study-header">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={17} />} onClick={onBack}>
          Back
        </Button>
        <div>
          <p className="eyebrow">{modeLabels[mode]}</p>
          <h1 id="score-title">Score</h1>
        </div>
        <span className="study-count">{percent}%</span>
      </header>

      <div className="score-hero">
        <div className="score-ring" aria-label={`${percent} percent correct`}>
          <span>{percent}</span>
          <small>%</small>
        </div>
        <div>
          <h2>
            {correct.length} of {attempts.length} correct
          </h2>
          <p>
            {mistakes.length
              ? `${mistakes.length} ${mistakes.length === 1 ? "word" : "words"} to review`
              : "All answers correct"}
          </p>
        </div>
      </div>

      <div className="score-actions">
        <Button icon={<RotateCcw size={18} />} variant="secondary" onClick={onRepeat}>
          Repeat
        </Button>
      </div>

      <div className="result-grid">
        <section className="result-panel" aria-labelledby="correct-heading">
          <h2 id="correct-heading">
            <CheckCircle2 size={18} /> Correct answers
          </h2>
          {correct.length ? (
            <ul className="result-list">
              {correct.map((attempt) => (
                <li key={`${attempt.itemId}-${attempt.prompt}-correct`}>
                  <strong>{attempt.prompt}</strong>
                  <span>{attempt.correctAnswer}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No correct answers yet.</p>
          )}
        </section>

        <section className="result-panel" aria-labelledby="mistakes-heading">
          <h2 id="mistakes-heading">
            <XCircle size={18} /> Mistakes
          </h2>
          {mistakes.length ? (
            <ul className="result-list">
              {mistakes.map((attempt) => (
                <li key={`${attempt.itemId}-${attempt.prompt}-wrong`}>
                  <strong>{attempt.prompt}</strong>
                  <span>
                    {attempt.userAnswer || "No answer"} / {attempt.correctAnswer}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No mistakes.</p>
          )}
        </section>
      </div>

      <section className="test-review-panel" aria-labelledby="test-review-heading">
        <h2 id="test-review-heading">
          <ListChecks size={18} /> Test review
        </h2>
        <ol className="attempt-list">
          {attempts.map((attempt, index) => (
            <li
              className={`attempt-card ${attempt.isCorrect ? "correct" : "wrong"}`}
              key={`${attempt.itemId}-${attempt.prompt}-${index}`}
            >
              <div className="attempt-top">
                <div>
                  <small>{questionTypeLabels[attempt.questionType]}</small>
                  <strong>{attempt.prompt}</strong>
                </div>
                <span
                  className={`attempt-result ${attempt.isCorrect ? "correct" : "wrong"}`}
                >
                  {attempt.isCorrect ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                  {attempt.isCorrect ? "Correct" : "Mistake"}
                </span>
              </div>
              <dl className="attempt-answers">
                <div>
                  <dt>Your answer</dt>
                  <dd>{attempt.userAnswer || "No answer"}</dd>
                </div>
                <div>
                  <dt>Correct answer</dt>
                  <dd>{attempt.correctAnswer}</dd>
                </div>
              </dl>
              {!attempt.isCorrect ? (
                <p className="correction">
                  Correction: <strong>{attempt.prompt}</strong> = {attempt.correctAnswer}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section className="review-panel" aria-labelledby="review-heading">
        <h2 id="review-heading">Words to review</h2>
        {reviewWords.length ? (
          <div className="review-chips">
            {reviewWords.map((item) => (
              <span key={item.id}>
                {item.word} / {item.translation}
              </span>
            ))}
          </div>
        ) : (
          <p className="muted">No review words.</p>
        )}
      </section>
    </section>
  );
}
