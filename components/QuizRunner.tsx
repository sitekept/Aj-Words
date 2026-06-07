"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Circle, XCircle } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { isDue } from "@/lib/srs";
import type {
  QuizAttempt,
  QuizMode,
  QuizQuestionType,
  QuizSessionState,
  VocabularyItem,
  WordList
} from "@/types/vocabulary";

interface BuiltQuestion {
  item: VocabularyItem;
  type: QuizQuestionType;
  options?: string[];
}

interface QuizRunnerProps {
  initialSession: QuizSessionState | null;
  list: WordList;
  mode: QuizMode;
  onBack: () => void;
  onAttemptFinalized: (attempt: QuizAttempt) => void;
  onFinish: (attempts: QuizAttempt[]) => void;
  onSessionChange: (session: QuizSessionState) => void;
}

const modeTitles: Record<QuizMode, string> = {
  written: "Written quiz",
  choice: "Multiple choice",
  mixed: "Mixed test",
  test: "Test me",
  "full-review": "Full review",
  "review-due": "Daily review"
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
    Array.from(
      new Set(
        items
          .filter((candidate) => candidate.id !== item.id)
          .map((candidate) => candidate.translation)
          .filter(Boolean)
      )
    )
  ).slice(0, 3);

  return shuffle(Array.from(new Set([item.translation, ...wrongAnswers]))).slice(0, 4);
};

const getAdaptivePriority = (item: VocabularyItem) => {
  const parsedLastWrongTime = item.lastWrongAt
    ? new Date(item.lastWrongAt).getTime()
    : 0;
  const lastWrongTime = Number.isFinite(parsedLastWrongTime)
    ? parsedLastWrongTime
    : 0;
  const recentWrongBoost = lastWrongTime ? lastWrongTime / 100000000 : 0;

  if (item.wrongStreak > 0) {
    return 100000 + item.wrongStreak * 2000 + item.wrongCount * 100 + recentWrongBoost;
  }

  if (item.lastWrongAt && item.status !== "mastered") {
    return 90000 + item.wrongCount * 120 + recentWrongBoost;
  }

  if (item.status === "learning") {
    return 70000 + item.wrongCount * 150 - item.correctStreak * 50;
  }

  if (item.status === "new") {
    return 50000 - item.attempts * 100;
  }

  return 1000 + item.wrongCount * 50;
};

const getSessionItems = (
  items: VocabularyItem[],
  mode: QuizMode,
  now: string
) => {
  if (mode === "full-review") {
    return shuffle(items);
  }

  // "review-due": strictly only due cards (button is disabled when none are due).
  if (mode === "review-due") {
    return shuffle(items.filter((item) => isDue(item, now)));
  }

  // Prioritize cards that are due for spaced-repetition review (this re-includes
  // mastered-but-due cards). Fall back to any non-mastered card, then to all,
  // so a session is never empty.
  const dueItems = items.filter((item) => isDue(item, now));
  const activeItems = items.filter((item) => item.status !== "mastered");
  const pool = dueItems.length
    ? dueItems
    : activeItems.length
      ? activeItems
      : items;

  return shuffle(pool).sort((first, second) => {
    const firstDue = first.dueAt ? new Date(first.dueAt).getTime() : 0;
    const secondDue = second.dueAt ? new Date(second.dueAt).getTime() : 0;
    if (firstDue !== secondDue) {
      return firstDue - secondDue;
    }
    return getAdaptivePriority(second) - getAdaptivePriority(first);
  });
};

const getQuestionType = (
  mode: QuizMode,
  index: number,
  canUseChoice: boolean
): QuizQuestionType => {
  if (mode === "choice") {
    return canUseChoice ? "choice" : "written";
  }

  if (mode === "written" || mode === "review-due") {
    return "written";
  }

  return index % 2 === 0 && canUseChoice ? "choice" : "written";
};

const buildQuestions = (list: WordList, mode: QuizMode): BuiltQuestion[] => {
  const now = new Date().toISOString();
  const items = getSessionItems(list.items, mode, now);
  const canUseChoice = list.items.length >= 4;

  return items.map((item, index) => {
    const type = getQuestionType(mode, index, canUseChoice);

    return {
      item,
      type,
      options: type === "choice" ? buildOptions(item, list.items) : undefined
    };
  });
};

const hydrateQuestions = (
  list: WordList,
  session: QuizSessionState | null
): BuiltQuestion[] => {
  if (!session?.questions.length) {
    return [];
  }

  const itemsById = new Map(list.items.map((item) => [item.id, item]));

  return session.questions.flatMap((question) => {
    const item = itemsById.get(question.itemId);

    return item
      ? [{
          item,
          type: question.type,
          options: question.options
        }]
      : [];
  });
};

const createInitialState = (
  list: WordList,
  mode: QuizMode,
  session: QuizSessionState | null
) => {
  const savedQuestions = hydrateQuestions(list, session);
  const questions = savedQuestions.length ? savedQuestions : buildQuestions(list, mode);
  const validQuestionIds = new Set(questions.map((question) => question.item.id));
  const attempts =
    session?.attempts.filter((attempt) => validQuestionIds.has(attempt.itemId)) ?? [];
  const feedback =
    session?.feedback && validQuestionIds.has(session.feedback.itemId)
      ? session.feedback
      : null;
  const safeIndex =
    session && questions.length
      ? Math.min(Math.max(0, session.index), questions.length - 1)
      : 0;

  return {
    attempts,
    feedback,
    index: safeIndex,
    questions,
    selectedAnswer: session?.selectedAnswer ?? "",
    typedAnswer: session?.typedAnswer ?? ""
  };
};

const serializeQuestions = (questions: BuiltQuestion[]) =>
  questions.map((question) => ({
    itemId: question.item.id,
    type: question.type,
    options: question.options
  }));

export function QuizRunner({
  initialSession,
  list,
  mode,
  onBack,
  onAttemptFinalized,
  onFinish,
  onSessionChange
}: QuizRunnerProps) {
  const [sessionState, setSessionState] = useState(() =>
    createInitialState(list, mode, initialSession)
  );
  const { attempts, feedback, index, questions, selectedAnswer, typedAnswer } =
    sessionState;
  const current = questions[index];

  useEffect(() => {
    setSessionState(createInitialState(list, mode, initialSession));
    // Progress updates replace the list object; resetting here would restart the quiz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSession, list.id, mode]);

  useEffect(() => {
    if (!questions.length) {
      return;
    }

    onSessionChange({
      attempts,
      feedback,
      index,
      listId: list.id,
      mode,
      questions: serializeQuestions(questions),
      selectedAnswer,
      typedAnswer,
      updatedAt: new Date().toISOString()
    });
  }, [
    attempts,
    feedback,
    index,
    list.id,
    mode,
    onSessionChange,
    questions,
    selectedAnswer,
    typedAnswer
  ]);

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

    setSessionState((value) => ({
      ...value,
      attempts: [...value.attempts, attempt],
      feedback: attempt
    }));
  };

  const handleNext = () => {
    const latestAttempts =
      feedback && !attempts.some((attempt) => attempt.itemId === feedback.itemId)
        ? [...attempts, feedback]
        : attempts;

    if (feedback) {
      onAttemptFinalized(feedback);
    }

    if (index === questions.length - 1) {
      onFinish(latestAttempts);
      return;
    }

    setSessionState((value) => ({
      ...value,
      feedback: null,
      index: value.index + 1,
      selectedAnswer: "",
      typedAnswer: ""
    }));
  };

  const markCurrentAnswerCorrect = () => {
    if (
      !feedback ||
      feedback.isCorrect ||
      feedback.questionType !== "written" ||
      mode === "test"
    ) {
      return;
    }

    const correctedAttempt = {
      ...feedback,
      isCorrect: true
    };

    setSessionState((value) => ({
      ...value,
      attempts: value.attempts.map((attempt) =>
        attempt === feedback ||
        (attempt.itemId === feedback.itemId &&
          attempt.prompt === feedback.prompt &&
          attempt.userAnswer === feedback.userAnswer)
          ? correctedAttempt
          : attempt
      ),
      feedback: correctedAttempt
    }));
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
  const canMarkRight =
    Boolean(feedback) &&
    !feedback?.isCorrect &&
    feedback?.questionType === "written" &&
    mode !== "test";
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
                onClick={() =>
                  setSessionState((value) => ({
                    ...value,
                    selectedAnswer: option
                  }))
                }
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
              onChange={(event) =>
                setSessionState((value) => ({
                  ...value,
                  typedAnswer: event.target.value
                }))
              }
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
            <>
              {canMarkRight ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={markCurrentAnswerCorrect}
                >
                  J&apos;avais raison
                </Button>
              ) : null}
              <Button type="button" onClick={handleNext}>
                {index === questions.length - 1 ? "Finish" : "Next"}
              </Button>
            </>
          )}
        </div>
      </form>
    </section>
  );
}
