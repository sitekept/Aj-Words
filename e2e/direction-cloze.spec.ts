import { expect, test } from "@playwright/test";
import {
  answerMapFor,
  createListWithTerms,
  feedback,
  gotoHome,
  quizPrompt,
  readPrompt,
  startMode,
  submitWrittenAnswer,
  type WordPair
} from "./helpers";

const WORDS: WordPair[] = [
  { word: "livre", translation: "book" },
  { word: "stylo", translation: "pen" },
  { word: "table", translation: "desk" },
  { word: "porte", translation: "door" }
];

// 48/48 items in this builtin list are cloze sentences (unit 2's variant has
// one non-cloze item, so unit 3 keeps the spec deterministic).
const CLOZE_LIST_TITLE = "יחידה 3- השלמת משפטים";

test("reverse direction prompts with the translation and grades the word", async ({
  page
}) => {
  await gotoHome(page);
  await createListWithTerms(page, "E2E Reverse", WORDS);

  const reverseToggle = page.getByRole("button", {
    name: "Translation → Word"
  });
  await reverseToggle.click();
  await expect(reverseToggle).toHaveAttribute("aria-pressed", "true");

  await startMode(page, "Written quiz");
  await expect(page.getByText("Type the word")).toBeVisible();

  // The prompt is a translation; grading expects the word side.
  const reverseAnswers = answerMapFor(WORDS, "reverse");
  const prompt = await readPrompt(page);
  expect(Array.from(reverseAnswers.keys())).toContain(prompt);

  await submitWrittenAnswer(page, reverseAnswers.get(prompt) ?? "");
  await expect(feedback(page)).toContainText("Correct");
});

test("cloze list forces written input even in multiple-choice mode", async ({
  page
}) => {
  await gotoHome(page);
  // Anchored regex: the card button's accessible name starts with the title,
  // while the per-list "Edit ..."/"Delete ..." icon buttons do not.
  await page
    .getByRole("button", { name: new RegExp(`^${CLOZE_LIST_TITLE}`) })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: CLOZE_LIST_TITLE })
  ).toBeVisible();

  await startMode(page, "Multiple choice");

  // Cloze questions override the mode: typed input, no option grid.
  await expect(page.getByText("Complete the sentence")).toBeVisible();
  await expect(page.getByLabel("Answer", { exact: true })).toBeVisible();
  await expect(page.locator(".choice-grid")).toHaveCount(0);

  // Blank runs are normalized to a six-underscore blank in the prompt.
  await expect(quizPrompt(page)).toContainText("______");
});
