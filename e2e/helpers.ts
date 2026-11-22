import { expect, type Page } from "@playwright/test";

export interface WordPair {
  word: string;
  translation: string;
}

/**
 * Loads the app and waits for hydration. The library heading is visible on
 * both desktop and mobile whenever no list is selected.
 */
export const gotoHome = async (page: Page) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Listes de mots" })).toBeVisible();
};

/**
 * Creates a local list through the "Nouvelle liste" modal, seeding words via the
 * Quizlet-paste textarea (tab-separated pairs) in one shot. Lands on the
 * list detail view.
 */
export const createListWithTerms = async (
  page: Page,
  title: string,
  pairs: WordPair[]
) => {
  await page.getByRole("button", { name: "Nouvelle liste" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Créer une liste" })
  ).toBeVisible();
  await dialog.getByLabel("Nom de la liste").fill(title);
  if (pairs.length) {
    await dialog
      .getByLabel("Lignes importées")
      .fill(pairs.map((pair) => `${pair.word}\t${pair.translation}`).join("\n"));
  }
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: title })
  ).toBeVisible();
};

/** Adds one word through the "Ajouter un mot" modal on the current list. */
export const addWordViaModal = async (page: Page, pair: WordPair) => {
  await page.getByRole("button", { name: "Ajouter un mot" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Ajouter un mot" })
  ).toBeVisible();
  // Substring label match: the visible label text ends with the required "*".
  // Scoped to the dialog, "Mot" and "Traduction" are each unambiguous.
  await dialog.getByLabel("Mot").fill(pair.word);
  await dialog.getByLabel("Traduction").fill(pair.translation);
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(dialog).toBeHidden();
};

/** Starts a study mode from the list detail's mode grid. */
export const startMode = async (page: Page, name: string | RegExp) => {
  await page.getByRole("button", { name, exact: typeof name === "string" }).click();
};

/** The current quiz question's prompt text. */
export const quizPrompt = (page: Page) =>
  page.locator(".question-card").getByRole("heading", { level: 2 });

/**
 * Question order is random (the session pool is shuffled), so the expected
 * answer must always be derived from the displayed prompt via a lookup map.
 */
export const answerMapFor = (
  pairs: WordPair[],
  direction: "forward" | "reverse" = "forward"
) =>
  new Map(
    pairs.map((pair) =>
      direction === "forward"
        ? [pair.word, pair.translation]
        : [pair.translation, pair.word]
    )
  );

/** Two consecutive animation frames — lets pending React commits paint. */
const settleFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );

/**
 * Reads the prompt only once it is stable across two frames. QuizRunner
 * rebuilds (and reshuffles) its question set in a mount effect, so the very
 * first prompt shown can be replaced moments after the quiz view appears.
 */
export const readPrompt = async (page: Page) => {
  let prompt = (await quizPrompt(page).innerText()).trim();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await settleFrames(page);
    const again = (await quizPrompt(page).innerText()).trim();
    if (again === prompt) {
      return prompt;
    }
    prompt = again;
  }
  return prompt;
};

/** Types the given answer into the written input and submits it. */
export const submitWrittenAnswer = async (page: Page, answer: string) => {
  await page.getByLabel("Réponse", { exact: true }).fill(answer);
  await page.getByRole("button", { name: "Valider" }).click();
};

/** Advances past the feedback panel ("Suivant", or "Terminer" on the last). */
export const nextQuestion = async (page: Page, last = false) => {
  await page
    .getByRole("button", { name: last ? "Terminer" : "Suivant" })
    .click();
  if (!last) {
    // The same commit that shows the next question clears the feedback panel,
    // so waiting here prevents reading the previous question's prompt.
    await expect(feedback(page)).toBeHidden();
  }
};

export const feedback = (page: Page) => page.locator(".answer-feedback");
