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

// Cloze is triggered purely by the content: a run of two or more underscores
// in the translation (lib/cloze.ts). It used to be exercised through a bundled
// Hebrew sentence-completion list; those ship no more, so the fixture is built
// here. Four distinct answers keep "Choix multiple" enabled, which is the
// precondition this test needs in order to prove cloze overrides it.
const CLOZE_WORDS: WordPair[] = [
  { word: "livre", translation: "Je lis un ______ tous les soirs." },
  { word: "stylo", translation: "Il écrit avec un ______ bleu." },
  { word: "table", translation: "Les assiettes sont sur la ______." },
  { word: "porte", translation: "Ferme la ______ en sortant." }
];

test("reverse direction prompts with the translation and grades the word", async ({
  page
}) => {
  await gotoHome(page);
  await createListWithTerms(page, "E2E Reverse", WORDS);

  const reverseToggle = page.getByRole("button", {
    name: "Traduction → Mot"
  });
  await reverseToggle.click();
  await expect(reverseToggle).toHaveAttribute("aria-pressed", "true");

  await startMode(page, "Quiz écrit");
  await expect(page.getByText("Tapez le mot")).toBeVisible();

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
  await createListWithTerms(page, "E2E Cloze", CLOZE_WORDS);

  await startMode(page, "Choix multiple");

  // Cloze questions override the mode: typed input, no option grid.
  await expect(page.getByText("Complétez la phrase")).toBeVisible();
  await expect(page.getByLabel("Réponse", { exact: true })).toBeVisible();
  await expect(page.locator(".choice-grid")).toHaveCount(0);

  // Blank runs are normalized to a six-underscore blank in the prompt.
  await expect(quizPrompt(page)).toContainText("______");
});
