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

// Labels only: the keys are persisted QuizMode / QuizQuestionType values.
const modeLabels: Record<QuizMode, string> = {
  written: "Quiz écrit",
  choice: "Choix multiple",
  mixed: "Test mixte",
  test: "Me tester",
  "full-review": "Révision complète"
};

const questionTypeLabels = {
  written: "Écrit",
  choice: "Choix multiple"
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

  const progressInsights = useMemo(() => {
    const attemptedIds = new Set(attempts.map((attempt) => attempt.itemId));
    const correctIds = new Set(
      attempts
        .filter((attempt) => attempt.isCorrect)
        .map((attempt) => attempt.itemId)
    );
    const attemptedWords = list.items.filter((item) => attemptedIds.has(item.id));

    return {
      frequentErrors: attemptedWords
        .filter((item) => item.wrongStreak > 0 || item.wrongCount >= 2)
        .sort((first, second) => second.wrongCount - first.wrongCount)
        .slice(0, 4),
      learningWords: attemptedWords
        .filter((item) => item.status === "learning")
        .sort((first, second) => second.wrongStreak - first.wrongStreak)
        .slice(0, 4),
      masteredWords: attemptedWords
        .filter((item) => item.status === "mastered" && correctIds.has(item.id))
        .slice(0, 4)
    };
  }, [attempts, list.items]);

  return (
    <section className="study-view score-view" aria-labelledby="score-title">
      <header className="study-header">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={17} />} onClick={onBack}>
          Retour
        </Button>
        <div>
          <p className="eyebrow">{modeLabels[mode]}</p>
          <h1 id="score-title">Résultat</h1>
        </div>
        <span className="study-count">{percent}%</span>
      </header>

      <div className="score-hero">
        <div className="score-ring" aria-label={`${percent} pour cent de bonnes réponses`}>
          <span>{percent}</span>
          <small>%</small>
        </div>
        <div>
          <h2>
            {correct.length} bonne{correct.length > 1 ? "s" : ""} réponse
            {correct.length > 1 ? "s" : ""} sur {attempts.length}
          </h2>
          <p>
            {mistakes.length
              ? `${mistakes.length} ${mistakes.length <= 1 ? "mot à revoir" : "mots à revoir"}`
              : "Tout est juste"}
          </p>
        </div>
      </div>

      <div className="score-actions">
        <Button icon={<RotateCcw size={18} />} variant="secondary" onClick={onRepeat}>
          Recommencer
        </Button>
      </div>

      <section className="progress-insights" aria-labelledby="progress-insights-heading">
        <h2 id="progress-insights-heading">Point de progression</h2>
        <div className="insight-grid">
          <article className="insight-card">
            <strong>{progressInsights.frequentErrors.length}</strong>
            <span>Erreurs fréquentes</span>
            <p>
              {progressInsights.frequentErrors.length
                ? progressInsights.frequentErrors
                    .map((item) => item.word)
                    .join(", ")
                : "Aucune erreur répétée détectée."}
            </p>
          </article>
          <article className="insight-card">
            <strong>{progressInsights.learningWords.length}</strong>
            <span>Encore en cours</span>
            <p>
              {progressInsights.learningWords.length
                ? progressInsights.learningWords
                    .map((item) => item.word)
                    .join(", ")
                : "Aucun mot en cours d\u2019apprentissage dans ce résultat."}
            </p>
          </article>
          <article className="insight-card">
            <strong>{progressInsights.masteredWords.length}</strong>
            <span>Acquis maintenant</span>
            <p>
              {progressInsights.masteredWords.length
                ? progressInsights.masteredWords
                    .map((item) => item.word)
                    .join(", ")
                : "Aucun nouveau mot acquis pour l\u2019instant."}
            </p>
          </article>
        </div>
      </section>

      <div className="result-grid">
        <section className="result-panel" aria-labelledby="correct-heading">
          <h2 id="correct-heading">
            <CheckCircle2 size={18} /> Bonnes réponses
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
            <p className="muted">Aucune bonne réponse pour l&rsquo;instant.</p>
          )}
        </section>

        <section className="result-panel" aria-labelledby="mistakes-heading">
          <h2 id="mistakes-heading">
            <XCircle size={18} /> Erreurs
          </h2>
          {mistakes.length ? (
            <ul className="result-list">
              {mistakes.map((attempt) => (
                <li key={`${attempt.itemId}-${attempt.prompt}-wrong`}>
                  <strong>{attempt.prompt}</strong>
                  <span>
                    {attempt.userAnswer || "Pas de réponse"} / {attempt.correctAnswer}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Aucune erreur.</p>
          )}
        </section>
      </div>

      <section className="test-review-panel" aria-labelledby="test-review-heading">
        <h2 id="test-review-heading">
          <ListChecks size={18} /> Détail des réponses
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
                  {attempt.isCorrect ? "Correct" : "Erreur"}
                </span>
              </div>
              <dl className="attempt-answers">
                <div>
                  <dt>Votre réponse</dt>
                  <dd>{attempt.userAnswer || "Pas de réponse"}</dd>
                </div>
                <div>
                  <dt>Bonne réponse</dt>
                  <dd>{attempt.correctAnswer}</dd>
                </div>
              </dl>
              {!attempt.isCorrect ? (
                <p className="correction">
                  Correction : <strong>{attempt.prompt}</strong> = {attempt.correctAnswer}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section className="review-panel" aria-labelledby="review-heading">
        <h2 id="review-heading">Mots à revoir</h2>
        {reviewWords.length ? (
          <div className="review-chips">
            {reviewWords.map((item) => (
              <span key={item.id}>
                {item.word} / {item.translation}
              </span>
            ))}
          </div>
        ) : (
          <p className="muted">Aucun mot à revoir.</p>
        )}
      </section>
    </section>
  );
}
