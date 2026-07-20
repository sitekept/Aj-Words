import { expect, test } from "@playwright/test";
import {
  answerMapFor,
  createListWithTerms,
  feedback,
  gotoHome,
  nextQuestion,
  readPrompt,
  startMode,
  submitWrittenAnswer,
  type WordPair
} from "./helpers";

const WORDS: WordPair[] = [
  { word: "chien", translation: "dog" },
  { word: "bonjour", translation: "hello" },
  { word: "deja", translation: "déjà" },
  { word: "merci", translation: "thanks" }
];

test("written quiz: verdicts, diff, manual override, and final score", async ({
  page
}) => {
  await gotoHome(page);
  await createListWithTerms(page, "E2E Written", WORDS);
  await startMode(page, "Written quiz");

  await expect(page.locator(".study-count")).toHaveText("1 / 4");
  const answers = answerMapFor(WORDS);

  // Question order is random; branch on the displayed prompt.
  for (let index = 0; index < WORDS.length; index += 1) {
    const prompt = await readPrompt(page);

    if (prompt === "deja") {
      // Accent-stripped answer for an accented translation is accepted.
      await submitWrittenAnswer(page, "deja");
      await expect(feedback(page)).toContainText("Correct");
    } else if (prompt === "bonjour") {
      // One-character typo lands in the "small typo" verdict.
      await submitWrittenAnswer(page, "helo");
      await expect(feedback(page)).toContainText("small typo");
    } else if (prompt === "chien") {
      // Wrong answer: correction line + character diff, then manual override.
      await submitWrittenAnswer(page, "completely wrong");
      await expect(feedback(page)).toContainText("Answer: dog");
      await expect(page.locator(".answer-diff")).toBeVisible();

      await page.getByRole("button", { name: "J'avais raison" }).click();
      await expect(feedback(page)).toContainText("Correct");
      await expect(page.locator(".answer-diff")).toBeHidden();
      await expect(
        page.getByRole("button", { name: "J'avais raison" })
      ).toBeHidden();
    } else {
      // Exact answer.
      await submitWrittenAnswer(page, answers.get(prompt) ?? "");
      await expect(feedback(page)).toContainText("Correct");
    }

    await nextQuestion(page, index === WORDS.length - 1);
  }

  // Score screen totals: the override flipped the miss, so 4 of 4.
  await expect(page.getByRole("heading", { name: "Score" })).toBeVisible();
  await expect(page.getByText("4 of 4 correct")).toBeVisible();
  await expect(page.locator(".study-count")).toHaveText("100%");
});
