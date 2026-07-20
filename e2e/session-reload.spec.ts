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
  { word: "nord", translation: "north" },
  { word: "sud", translation: "south" },
  { word: "est", translation: "east" },
  { word: "ouest", translation: "west" }
];

test("an in-progress written quiz resumes after a reload", async ({ page }) => {
  await gotoHome(page);
  await createListWithTerms(page, "E2E Resume", WORDS);

  const answers = answerMapFor(WORDS);
  await startMode(page, "Written quiz");
  const count = page.locator(".study-count");
  await expect(count).toHaveText("1 / 4");

  // Answer the first two questions correctly.
  for (const expected of ["2 / 4", "3 / 4"]) {
    const prompt = await readPrompt(page);
    await submitWrittenAnswer(page, answers.get(prompt) ?? "");
    await expect(feedback(page)).toContainText("Correct");
    await nextQuestion(page);
    await expect(count).toHaveText(expected);
  }

  // Reload mid-session: the app returns to the list detail.
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "E2E Resume" })
  ).toBeVisible();

  // Re-entering the written quiz resumes at question 3 of the same session.
  await startMode(page, "Written quiz");
  await expect(count).toHaveText("3 / 4");

  // Finish the remaining questions; the earlier attempts are intact.
  for (const last of [false, true]) {
    const prompt = await readPrompt(page);
    await submitWrittenAnswer(page, answers.get(prompt) ?? "");
    await expect(feedback(page)).toContainText("Correct");
    await nextQuestion(page, last);
  }

  await expect(page.getByRole("heading", { name: "Score" })).toBeVisible();
  await expect(page.getByText("4 of 4 correct")).toBeVisible();
});
