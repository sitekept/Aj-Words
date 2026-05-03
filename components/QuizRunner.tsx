"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Circle, XCircle } from "lucide-react";
import { Button, cx } from "@/components/ui";
import type {
  QuizAttempt,
  QuizMode,
  QuizQuestionType,
  VocabularyItem,
  WordList
} from "@/types/vocabulary";

interface BuiltQuestion {
  item: VocabularyItem;
  type: QuizQuestionType;
  options?: string[];
}

interface QuizRunnerProps {
  list: WordList;
  mode: QuizMode;
  onBack: () => void;
  onFinish: (attempts: QuizAttempt[]) => void;
}

const modeTitles: Record<QuizMode, string> = {
  written: "Written quiz",
  choice: "Multiple choice",
  mixed: "Mixed test",
  test: "Test me"
};

const shuffle = <T,>(values: T[]) => {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
};

const normalizeAnswer = (value: string) =>
  value.trim().toLocaleLowerCase().replace(/\s+/g, " ");

const buildOptions = (item: VocabularyItem, items: VocabularyItem[]) => {
  const wrongAnswers = shuffle(
    items
      .filter((candidate) => candidate.id !== item.id)
      .map((candidate) => candidate.translation)
      .filter(Boolean)
  ).slice(0, 3);

  return shuffle([item.translation, ...wrongAnswers]).slice(0, 4);
};

const buildQuestions = (list: WordList, mode: QuizMode): BuiltQuestion[] => {
  const items = shuffle(list.items);
  const canUseChoice = list.items.length >= 4;

  return items.map((item, index) => {
    const type: QuizQuestionType =
      mode === "mixed" || mode === "test"
        ? index % 2 === 0 && canUseChoice
          ? "choice"
          : "written"
        : mode;

    return {
      item,
      type,
      options: type === "choice" ? buildOptions(item, list.items) : undefined
    };
  });
};

export function QuizRunner({ list, mode, onBack, onFinish }: QuizRunnerProps) {
  const questions = useMemo(() => buildQuestions(list, mode), [list, mode]);
  const [index, setIndex] = useState(0);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [feedback, setFeedback] = useState<QuizAttempt | null>(null);
  const current = questions[index];

  useEffect(() => {
    setIndex(0);
    setTypedAnswer("");
    setSelectedAnswer("");
    setAttempts([]);
    setFeedback(null);
  }, [list.id, mode]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (!current || feedback) {
      return;
    }

    const userAnswer = current.type === "choice" ? selectedAnswer : typedAnswer;
    if (!userAnswer.trim()) {
      return;
    }

    const attempt: QuizAttempt = {
      itemId: current.item.id,
      questionType: current.type,
      prompt: current.item.word,
      correctAnswer: current.item.translation,
      userAnswer,
      isCorrect: normalizeAnswer(userAnswer) === normalizeAnswer(current.item.translation),
      options: current.options
    };

    setAttempts((value) => [...value, attempt]);
    setFeedback(attempt);
  };

  const handleNext = () => {
    const latestAttempts =
      feedback && !attempts.some((attempt) => attempt.itemId === feedback.itemId)
        ? [...attempts, feedback]
        : attempts;

    if (index === questions.length - 1) {
      onFinish(latestAttempts);
      return;
    }

    setIndex((value) => value + 1);
    setTypedAnswer("");
    setSelectedAnswer("");
    setFeedback(null);
  };

  if (!current) {
    return (
      <section className="study-view">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={17} />} onClick={onBack}>
          Back
        </Button>
        <div className="empty-state">
          <h2>No questions</h2>
        </div>
      </section>
    );
  }

  const answered = Boolean(feedback);
  const canSubmit =
    current.type === "choice" ? Boolean(selectedAnswer) : Boolean(typedAnswer.trim());

  return (
    <section className="study-view quiz-view" aria-labelledby="quiz-title">
      <header className="study-header">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={17} />} onClick={onBack}>
          Back
        </Button>
        <div>
          <p className="eyebrow">{list.title}</p>
          <h1 id="quiz-title">{modeTitles[mode]}</h1>
        </div>
        <span className="study-count">
          {index + 1} / {questions.length}
        </span>
      </header>

      <form className="question-card" onSubmit={handleSubmit}>
        <p className="eyebrow">
          {current.type === "choice" ? "Choose the translation" : "Type the translation"}
        </p>
        <h2>{current.item.word}</h2>

        {current.type === "choice" ? (
          <div className="choice-grid" role="group" aria-label="Answer options">
            {current.options?.map((option) => (
              <button
                key={option}
                type="button"
                className={cx(
                  "choice-option",
                  selectedAnswer === option && "choice-option-selected",
                  answered &&
                    option === current.item.translation &&
                    "choice-option-correct",
                  answered &&
                    selectedAnswer === option &&
                    option !== current.item.translation &&
                    "choice-option-wrong"
                )}
                disabled={answered}
                aria-pressed={selectedAnswer === option}
                onClick={() => setSelectedAnswer(option)}
              >
                <Circle size={15} />
                {option}
              </button>
            ))}
          </div>
        ) : (
          <label className="field quiz-answer" htmlFor="written-answer">
            <span>Answer</span>
            <input
              id="written-answer"
              value={typedAnswer}
              disabled={answered}
              autoComplete="off"
              onChange={(event) => setTypedAnswer(event.target.value)}
            />
          </label>
        )}

        {feedback ? (
          <div
            className={cx("answer-feedback", feedback.isCorrect ? "correct" : "wrong")}
            aria-live="polite"
          >
            {feedback.isCorrect ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            <span>
              {feedback.isCorrect
                ? "Correct"
                : `Answer: ${feedback.correctAnswer}`}
            </span>
          </div>
        ) : null}

        <div className="quiz-actions">
          {!answered ? (
            <Button type="submit" disabled={!canSubmit}>
              Check
            </Button>
          ) : (
            <Button type="button" onClick={handleNext}>
              {index === questions.length - 1 ? "Finish" : "Next"}
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
