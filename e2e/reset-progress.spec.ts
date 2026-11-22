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

/** Answers a whole written quiz correctly, landing on the score screen. */
const completeQuiz = async (page: Parameters<typeof gotoHome>[0]) => {
  const answers = answerMapFor(WORDS);
  for (let index = 0; index < WORDS.length; index += 1) {
    const prompt = await readPrompt(page);
    await submitWrittenAnswer(page, answers.get(prompt) ?? "");
    await nextQuestion(page, index === WORDS.length - 1);
  }
  await expect(page.getByRole("heading", { name: "Résultat" })).toBeVisible();
};

test("resetting a list clears progress and history but keeps the words", async ({
  page
}) => {
  await gotoHome(page);
  await createListWithTerms(page, "Reset deck", WORDS);
  await startMode(page, "Quiz écrit");
  await completeQuiz(page);

  await page.getByRole("button", { name: "Retour" }).first().click();

  // Progress and a test history entry now exist.
  await expect(page.getByRole("heading", { name: "Reset deck" })).toBeVisible();
  await expect(page.locator(".history-row").first()).toBeVisible();

  await page.getByRole("button", { name: "Réinitialiser la progression" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Réinitialiser la progression ?" })
  ).toBeVisible();
  // The modal states the stakes and offers the backup the audit asked for.
  await expect(dialog.getByText(/Les 4 mots/)).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Exporter une sauvegarde" })
  ).toBeVisible();

  // Cancelling is a no-op.
  await dialog.getByRole("button", { name: "Annuler" }).click();
  await expect(page.locator(".history-row").first()).toBeVisible();

  await page.getByRole("button", { name: "Réinitialiser la progression" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Réinitialiser", exact: true })
    .click();

  await expect(page.getByText(/Progression réinitialisée pour/)).toBeVisible();
  // History gone, words intact, everything back to "new".
  await expect(page.locator(".history-row")).toHaveCount(0);
  for (const pair of WORDS) {
    await expect(page.getByText(pair.word, { exact: true })).toBeVisible();
  }

  const state = await page.evaluate(() => {
    const raw = window.localStorage.getItem("worddeck.v1.lists");
    const parsed = raw ? JSON.parse(raw) : [];
    const lists = Array.isArray(parsed) ? parsed : (parsed.lists ?? []);
    const list = lists.find((l: { title?: string }) => l.title === "Reset deck");
    return {
      items: list.items.length,
      testHistory: list.testHistory.length,
      anyAttempts: list.items.some((i: { attempts: number }) => i.attempts > 0),
      anyBox: list.items.some((i: { box: number }) => i.box > 0),
      anyFsrs: list.items.some(
        (i: { stability?: number }) => i.stability !== undefined
      ),
      statuses: [...new Set(list.items.map((i: { status: string }) => i.status))]
    };
  });

  expect(state).toEqual({
    items: 4,
    testHistory: 0,
    anyAttempts: false,
    anyBox: false,
    anyFsrs: false,
    statuses: ["new"]
  });
});

// AJ Words no longer bundles any builtin list, so the "resetting a builtin
// clears its overlay without forking a copy" case this test used to cover has
// no subject left; the write side of that overlay model is still unit-tested in
// lib/vocabulary-persistence.test.ts. What remains worth proving end to end is
// the other way progress is recorded — a flashcard swipe rather than a quiz —
// and that clearing it survives a reload.
test("resetting clears flashcard-recorded progress, and it stays cleared", async ({
  page
}) => {
  await gotoHome(page);
  await createListWithTerms(page, "Swipe deck", WORDS);

  await startMode(page, "Cartes mémo");
  await page.getByRole("button", { name: "Acquis" }).click();
  await page.getByRole("button", { name: "Retour" }).first().click();

  // The swipe was recorded.
  expect(
    await page.evaluate(() => {
      const raw = window.localStorage.getItem("worddeck.v1.lists");
      const lists = raw ? JSON.parse(raw) : [];
      return lists.some((l: { items?: Array<Record<string, unknown>> }) =>
        (l.items ?? []).some((i) => (i.box as number) > 0)
      );
    })
  ).toBe(true);

  await page.getByRole("button", { name: "Réinitialiser la progression" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Réinitialiser", exact: true })
    .click();
  await expect(page.getByText(/Progression réinitialisée pour/)).toBeVisible();

  // Same list, same title — resetting progress is not an edit, so nothing is
  // renamed and no copy is forked.
  await expect(
    page.getByRole("heading", { level: 1, name: "Swipe deck" })
  ).toBeVisible();

  const readState = () =>
    page.evaluate(() => {
      const raw = window.localStorage.getItem("worddeck.v1.lists");
      const lists = raw ? JSON.parse(raw) : [];
      return {
        anyCopy: lists.some((l: { title?: string }) =>
          (l.title ?? "").includes("copie locale")
        ),
        anyProgress: lists.some((l: { items?: Array<Record<string, unknown>> }) =>
          (l.items ?? []).some(
            (i) => (i.attempts as number) > 0 || (i.box as number) > 0
          )
        )
      };
    });

  expect(await readState()).toEqual({ anyCopy: false, anyProgress: false });

  // And it survives a reload: nothing rehydrates the cleared progress.
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Swipe deck" })
  ).toBeVisible();
  expect(await readState()).toEqual({ anyCopy: false, anyProgress: false });
});
