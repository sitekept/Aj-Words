import { expect, test } from "@playwright/test";
import { createListWithTerms, gotoHome, startMode, type WordPair } from "./helpers";

const WORDS: WordPair[] = [
  { word: "un", translation: "one" },
  { word: "deux", translation: "two" },
  { word: "trois", translation: "three" },
  { word: "quatre", translation: "four" }
];

test("flashcards: assessments advance progress, undo rewinds, shuffle resets", async ({
  page
}) => {
  await gotoHome(page);
  await createListWithTerms(page, "E2E Cards", WORDS);
  await startMode(page, "Flashcards");

  const count = page.locator(".study-count");
  const progress = page.getByRole("progressbar");
  await expect(count).toHaveText("1 / 4");
  await expect(progress).toHaveAttribute("aria-valuenow", "0");

  // Assess two cards via the buttons; the counter and progress bar advance.
  await page.getByRole("button", { name: "Learning" }).click();
  await expect(count).toHaveText("2 / 4");
  await expect(progress).toHaveAttribute("aria-valuenow", "1");

  await page.getByRole("button", { name: "Mastered" }).click();
  await expect(count).toHaveText("3 / 4");
  await expect(progress).toHaveAttribute("aria-valuenow", "2");

  // Undo rewinds to the previous card.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(count).toHaveText("2 / 4");
  await expect(progress).toHaveAttribute("aria-valuenow", "1");

  // Toggling shuffle restarts the deck at card 1.
  await page.getByRole("button", { name: "Shuffle cards" }).click();
  await expect(count).toHaveText("1 / 4");
  await expect(progress).toHaveAttribute("aria-valuenow", "0");

  // Complete the deck; the summary tallies every assessment.
  for (const expected of ["2 / 4", "3 / 4", "4 / 4"]) {
    await page.getByRole("button", { name: "Mastered" }).click();
    await expect(count).toHaveText(expected);
  }
  await page.getByRole("button", { name: "Mastered" }).click();
  await expect(
    page.getByRole("heading", { name: "4 cards reviewed" })
  ).toBeVisible();
  await expect(
    page.locator(".flashcard-summary-card.mastered strong")
  ).toHaveText("4");

  // Undo from the summary rewinds both the counter and the tally.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(count).toHaveText("4 / 4");
  await page.getByRole("button", { name: "Mastered" }).click();
  await expect(
    page.getByRole("heading", { name: "4 cards reviewed" })
  ).toBeVisible();
  await expect(
    page.locator(".flashcard-summary-card.mastered strong")
  ).toHaveText("4");
});
