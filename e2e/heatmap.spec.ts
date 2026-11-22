import { expect, test } from "@playwright/test";
import {
  answerMapFor,
  createListWithTerms,
  gotoHome,
  nextQuestion,
  readPrompt,
  startMode,
  submitWrittenAnswer,
  type WordPair
} from "./helpers";

const WORDS: WordPair[] = [
  { word: "bonjour", translation: "hello" },
  { word: "merci", translation: "thanks" },
  { word: "chien", translation: "dog" },
  { word: "chat", translation: "cat" }
];

test("finishing a quiz fills the home activity heatmap", async ({ page }) => {
  await gotoHome(page);

  // Empty state before any review activity exists.
  await expect(
    page.getByText("Votre activité de révision apparaîtra ici.")
  ).toBeVisible();

  await createListWithTerms(page, "Heatmap deck", WORDS);
  await startMode(page, "Quiz écrit");

  const answers = answerMapFor(WORDS);
  for (let index = 0; index < WORDS.length; index += 1) {
    const prompt = await readPrompt(page);
    await submitWrittenAnswer(page, answers.get(prompt) ?? "");
    await nextQuestion(page, index === WORDS.length - 1);
  }
  await expect(page.getByRole("heading", { name: "Résultat" })).toBeVisible();

  // Back home via the always-present brand button (the header "Home" label is
  // hidden on mobile). The heatmap now reflects the reviews just logged.
  await page.locator("button.brand-button").click();
  await expect(page.getByText(/sur les \d+ dernières semaines/)).toBeVisible();
});

test("the daily goal is opt-in and shows today's progress", async ({ page }) => {
  await gotoHome(page);

  await page.getByRole("button", { name: "Définir un objectif quotidien" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Objectif quotidien" })
  ).toBeVisible();

  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(dialog).toBeHidden();

  // With the goal enabled, the home readout shows today's progress.
  await expect(page.getByText(/révisions aujourd'hui/)).toBeVisible();
});
