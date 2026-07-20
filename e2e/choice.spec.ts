import { expect, test } from "@playwright/test";
import {
  answerMapFor,
  createListWithTerms,
  gotoHome,
  nextQuestion,
  readPrompt,
  startMode,
  type WordPair
} from "./helpers";

const WORDS: WordPair[] = [
  { word: "pomme", translation: "apple" },
  { word: "poire", translation: "pear" },
  { word: "prune", translation: "plum" },
  { word: "peche", translation: "peach" }
];

test("multiple choice shows a 4-option grid with correct/wrong highlighting", async ({
  page
}) => {
  await gotoHome(page);
  await createListWithTerms(page, "E2E Choice", WORDS);
  await startMode(page, "Multiple choice");

  const answers = answerMapFor(WORDS);
  const options = page.locator(".choice-option");
  await expect(options).toHaveCount(4);

  // Question 1: pick the correct option; it is highlighted as correct.
  let prompt = await readPrompt(page);
  let correct = answers.get(prompt) ?? "";
  await options.getByText(correct, { exact: true }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.locator(".choice-option-correct")).toHaveText(correct);
  await expect(page.locator(".choice-option-wrong")).toHaveCount(0);
  await nextQuestion(page);

  // Question 2: pick a wrong option; both highlights appear.
  prompt = await readPrompt(page);
  correct = answers.get(prompt) ?? "";
  const texts = (await options.allInnerTexts()).map((text) => text.trim());
  const wrong = texts.find((text) => text !== correct) ?? "";
  await options.getByText(wrong, { exact: true }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.locator(".choice-option-wrong")).toHaveText(wrong);
  await expect(page.locator(".choice-option-correct")).toHaveText(correct);
});

test("a 3-word list cannot use choice mode and falls back to written questions", async ({
  page
}) => {
  await gotoHome(page);
  await createListWithTerms(page, "E2E Trio", WORDS.slice(0, 3));

  // Fewer than 4 words: the choice-based modes are disabled outright.
  await expect(
    page.getByRole("button", { name: "Multiple choice" })
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Mixed test" })).toBeDisabled();

  // "Test me" alternates choice/written but falls back to all-written here.
  await startMode(page, "Test me");
  await expect(page.getByLabel("Answer", { exact: true })).toBeVisible();
  await expect(page.locator(".choice-grid")).toHaveCount(0);
});
