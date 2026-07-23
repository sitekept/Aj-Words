"use client";

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import { ArrowLeft, CheckCircle2, Circle, Volume2, XCircle } from "lucide-react";
import { Button, IconButton, cx } from "@/components/ui";
import { checkAnswer, diffAnswer } from "@/lib/answer-matching";
import { buildOptions, canUseChoice, shuffle } from "@/lib/quiz-options";
import { getClozePrompt, isClozeText } from "@/lib/cloze";
import { canSpeak, resolveSpeechLangs, speak } from "@/lib/speech";
import { useSpeechVoices } from "@/lib/useSpeechVoices";
import { isDue } from "@/lib/srs";
import type {
  QuizAttempt,
  QuizDirection,
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
  /** What the user is shown. */
  prompt: string;
  /** What their input is graded against. */
  answer: string;
  isCloze: boolean;
}

interface QuizRunnerProps {
  direction: QuizDirection;
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
  "full-review": "Full review"
};

// Cloze items store a sentence with a blank in `translation` and the missing
// word in `word`; the quiz always shows the sentence and asks for the word,
// regardless of direction. Everything else follows the requested direction.
const describePromptAnswer = (
  item: VocabularyItem,
  direction: QuizDirection
): Pick<BuiltQuestion, "prompt" | "answer" | "isCloze"> => {
  if (isClozeText(item.translation)) {
    return {
      prompt: getClozePrompt(item.translation),
      answer: item.word,
      isCloze: true
    };
  }

  return direction === "reverse"
    ? { prompt: item.translation, answer: item.word, isCloze: false }
    : { prompt: item.word, answer: item.translation, isCloze: false };
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
  choiceAvailable: boolean
): QuizQuestionType => {
  if (mode === "choice") {
    return choiceAvailable ? "choice" : "written";
  }

  if (mode === "written") {
    return "written";
  }

  return index % 2 === 0 && choiceAvailable ? "choice" : "written";
};

const buildQuestions = (
  list: WordList,
  mode: QuizMode,
  direction: QuizDirection
): BuiltQuestion[] => {
  const now = new Date().toISOString();
  const items = getSessionItems(list.items, mode, now);
  // Distinct answers on the graded side, not card count: four cards sharing
  // three translations cannot fill four options.
  const choiceAvailable = canUseChoice(list.items, direction);

  return items.map((item, index) => {
    const promptAnswer = describePromptAnswer(item, direction);
    // Cloze sentences are typed-input by nature: they override the mode's
    // choice/written alternation for that question only.
    const type = promptAnswer.isCloze
      ? "written"
      : getQuestionType(mode, index, choiceAvailable);

    return {
      item,
      type,
      options:
        type === "choice" ? buildOptions(item, list.items, direction) : undefined,
      ...promptAnswer
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

  // The saved run's direction governs prompts/answers, not the current toggle.
  const direction: QuizDirection = session.direction ?? "forward";
  const itemsById = new Map(list.items.map((item) => [item.id, item]));

  return session.questions.flatMap((question) => {
    const item = itemsById.get(question.itemId);

    if (!item) {
      return [];
    }

    const promptAnswer = describePromptAnswer(item, direction);

    return [{
      item,
      // Stored options stay authoritative for choice questions; cloze always
      // grades typed input, even in sessions saved before cloze existed.
      type: promptAnswer.isCloze ? ("written" as const) : question.type,
      options: promptAnswer.isCloze ? undefined : question.options,
      ...promptAnswer
    }];
  });
};

const createInitialState = (
  list: WordList,
  mode: QuizMode,
  session: QuizSessionState | null,
  direction: QuizDirection
) => {
  // A resumed run keeps the direction it was started with; the toggle only
  // affects fresh runs. Sessions without the field predate directions.
  const effectiveDirection = session ? session.direction ?? "forward" : direction;
  const savedQuestions = hydrateQuestions(list, session);
  const questions = savedQuestions.length
    ? savedQuestions
    : buildQuestions(list, mode, effectiveDirection);
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
    direction: effectiveDirection,
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
  direction,
  initialSession,
  list,
  mode,
  onBack,
  onAttemptFinalized,
  onFinish,
  onSessionChange
}: QuizRunnerProps) {
  const [sessionState, setSessionState] = useState(() =>
    createInitialState(list, mode, initialSession, direction)
  );
  const {
    attempts,
    direction: sessionDirection,
    feedback,
    index,
    questions,
    selectedAnswer,
    typedAnswer
  } = sessionState;
  const current = questions[index];

  // 0 until mounted on a speech-capable browser; bumps once voices load.
  const speechVersion = useSpeechVoices();
  const speechLangs = resolveSpeechLangs(list.language);
  // Direction-aware prompt language: forward prompts are words, reverse
  // prompts are translations. Cloze prompts are sentences that the item's
  // word completes, so they share the word side's language (the bundled
  // cloze sentences are English in the "English / Hebrew" lists).
  const promptLang = current
    ? current.isCloze || sessionDirection !== "reverse"
      ? speechLangs.word
      : speechLangs.translation
    : undefined;

  // altAnswers are alternatives for the translation side, so they apply only
  // when the graded answer IS the translation: forward, non-cloze questions.
  // Reverse and cloze questions grade against item.word, where translation
  // alternatives must not count.
  const altAnswersFor = (question: BuiltQuestion) =>
    sessionDirection === "forward" && !question.isCloze
      ? question.item.altAnswers
      : undefined;

  // The useState initializer already built this state; skipping the mount run
  // keeps the first question from being rebuilt (and reshuffled) after paint.
  const skipResetRef = useRef(true);

  useEffect(() => {
    if (skipResetRef.current) {
      skipResetRef.current = false;
      return;
    }

    setSessionState(createInitialState(list, mode, initialSession, direction));
    // Progress updates replace the list object; resetting here would restart the quiz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction, initialSession, list.id, mode]);

  useEffect(() => {
    if (!questions.length) {
      return;
    }

    onSessionChange({
      attempts,
      direction: sessionDirection,
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
    sessionDirection,
    typedAnswer
  ]);

  // Arrow keys move within the radiogroup and select as they go, which is the
  // expected behaviour for radios and keeps aria-checked in step with focus.
  const moveChoiceFocus = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    optionIndex: number
  ) => {
    const options = current?.options;
    if (!options?.length) {
      return;
    }

    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) {
      return;
    }

    event.preventDefault();
    const nextIndex = (optionIndex + step + options.length) % options.length;
    setSessionState((value) => ({
      ...value,
      selectedAnswer: options[nextIndex]
    }));

    const group = event.currentTarget.parentElement;
    const buttons = group?.querySelectorAll<HTMLButtonElement>("[role='radio']");
    buttons?.[nextIndex]?.focus();
  };

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
      prompt: current.prompt,
      correctAnswer: current.answer,
      userAnswer,
      // Choice options are verbatim strings; written answers get tolerant matching.
      isCorrect:
        current.type === "choice"
          ? userAnswer === current.answer
          : checkAnswer(userAnswer, current.answer, altAnswersFor(current)).verdict !==
            "incorrect",
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

  // Recomputed at render (pure and deterministic), so the QuizAttempt schema
  // and saved sessions stay unchanged.
  const feedbackCheck =
    feedback && feedback.questionType === "written"
      ? checkAnswer(feedback.userAnswer, feedback.correctAnswer, altAnswersFor(current))
      : null;
  const typoMessage =
    feedback?.isCorrect && feedbackCheck?.verdict === "correct-typo"
      ? `Correct — small typo. Watch the spelling: ${feedbackCheck.matchedAnswer}`
      : null;
  const diffSegments =
    feedback && !feedback.isCorrect && feedbackCheck
      ? diffAnswer(feedback.userAnswer, feedbackCheck.matchedAnswer)
      : null;

  // What a screen reader hears after each check: the verdict, the expected
  // answer when it was missed, and where we are in the deck. Empty between
  // questions so the next verdict always registers as a change.
  const liveAnnouncement = feedback
    ? [
        typoMessage ??
          (feedback.isCorrect
            ? "Correct."
            : `Incorrect. The answer is ${feedback.correctAnswer}.`),
        `Question ${index + 1} of ${questions.length}.`
      ].join(" ")
    : "";

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

      {/* Mounted for the whole quiz, empty until there is something to say.
          A live region created in the same commit as its content is not
          reliably announced — the region has to already exist for the
          insertion to register as a change. */}
      <p className="sr-only" role="status" aria-live="polite">
        {liveAnnouncement}
      </p>

      <form className="question-card" onSubmit={handleSubmit}>
        <p className="eyebrow">
          {current.isCloze
            ? "Complete the sentence"
            : current.type === "choice"
              ? sessionDirection === "reverse"
                ? "Choose the word"
                : "Choose the translation"
              : sessionDirection === "reverse"
                ? "Type the word"
                : "Type the translation"}
        </p>
        <div className="quiz-prompt">
          <h2 className={cx(current.isCloze && "cloze-prompt")} dir="auto">
            {current.prompt}
          </h2>
          {speechVersion > 0 && promptLang && canSpeak(promptLang) ? (
            <IconButton
              label={`Listen to "${current.prompt}"`}
              onClick={() => speak(current.prompt, promptLang)}
            >
              <Volume2 size={17} />
            </IconButton>
          ) : null}
        </div>

        {current.type === "choice" ? (
          // A radiogroup, not a group of toggles: exactly one answer can be
          // chosen. That also makes the whole set one Tab stop, with arrow
          // keys moving between options, instead of four separate stops.
          <div
            className="choice-grid"
            role="radiogroup"
            aria-label="Answer options"
          >
            {current.options?.map((option, optionIndex) => {
              const selected = selectedAnswer === option;
              // Roving tabindex: the selected option is the group's entry
              // point, falling back to the first when nothing is chosen yet.
              const isTabStop = selectedAnswer ? selected : optionIndex === 0;

              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={isTabStop ? 0 : -1}
                  className={cx(
                    "choice-option",
                    selected && "choice-option-selected",
                    answered && option === current.answer && "choice-option-correct",
                    answered &&
                      selected &&
                      option !== current.answer &&
                      "choice-option-wrong"
                  )}
                  disabled={answered}
                  onKeyDown={(event) => moveChoiceFocus(event, optionIndex)}
                  onClick={() =>
                    setSessionState((value) => ({
                      ...value,
                      selectedAnswer: option
                    }))
                  }
                >
                  <Circle size={15} aria-hidden="true" />
                  {option}
                </button>
              );
            })}
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
            className={cx(
              "answer-feedback",
              feedback.isCorrect ? "correct" : "wrong",
              typoMessage && "quiz-feedback-typo"
            )}
          >
            {feedback.isCorrect ? (
              <CheckCircle2 size={18} aria-hidden="true" />
            ) : (
              <XCircle size={18} aria-hidden="true" />
            )}
            <span>
              {typoMessage ??
                (feedback.isCorrect
                  ? "Correct"
                  : `Answer: ${feedback.correctAnswer}`)}
            </span>
          </div>
        ) : null}

        {diffSegments ? (
          <p className="answer-diff" dir="auto">
            {diffSegments.map((segment, segmentIndex) => (
              <span key={segmentIndex} className={`diff-${segment.kind}`}>
                {segment.char}
              </span>
            ))}
          </p>
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
