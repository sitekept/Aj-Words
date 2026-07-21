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
  await expect(page.getByRole("heading", { name: "Score" })).toBeVisible();
};

test("resetting a list clears progress and history but keeps the words", async ({
  page
}) => {
  await gotoHome(page);
  await createListWithTerms(page, "Reset deck", WORDS);
  await startMode(page, "Written quiz");
  await completeQuiz(page);

  await page.getByRole("button", { name: "Back" }).first().click();

  // Progress and a test history entry now exist.
  await expect(page.getByRole("heading", { name: "Reset deck" })).toBeVisible();
  await expect(page.locator(".history-row").first()).toBeVisible();

  await page.getByRole("button", { name: "Reset progress" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Reset progress?" })
  ).toBeVisible();
  // The modal states the stakes and offers the backup the audit asked for.
  await expect(dialog.getByText(/4 words/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Export backup" })).toBeVisible();

  // Cancelling is a no-op.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".history-row").first()).toBeVisible();

  await page.getByRole("button", { name: "Reset progress" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Reset progress" })
    .click();

  await expect(page.getByText(/Progress reset for/)).toBeVisible();
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

// Progress is not content: recording it never forks a builtin list, so
// clearing it must not either — it just empties the stored overlay.
test("resetting a builtin list clears its progress without forking a copy", async ({
  page
}) => {
  await gotoHome(page);

  // Open the first bundled list and study one card via flashcards.
  await page.locator(".list-card-main").first().click();
  const title = await page.getByRole("heading", { level: 1 }).innerText();
  await startMode(page, "Flashcards");
  await page.getByRole("button", { name: "Mastered" }).click();
  await page.getByRole("button", { name: "Back" }).first().click();

  const before = await page.evaluate(() => {
    const raw = window.localStorage.getItem("worddeck.v1.lists");
    const parsed = raw ? JSON.parse(raw) : [];
    const lists = Array.isArray(parsed) ? parsed : (parsed.lists ?? []);
    return { storedLists: lists.length };
  });
  expect(before.storedLists).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Reset progress" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Reset progress" })
    .click();
  await expect(page.getByText(/Progress reset for/)).toBeVisible();

  // Still the same builtin list, viewed under its own title — editing a
  // builtin forks a "(local copy)", resetting progress must not.
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  expect(title).not.toContain("local copy");

  const after = await page.evaluate(() => {
    const raw = window.localStorage.getItem("worddeck.v1.lists");
    const parsed = raw ? JSON.parse(raw) : [];
    const lists = Array.isArray(parsed) ? parsed : (parsed.lists ?? []);
    return {
      anyLocalCopy: lists.some((l: { title?: string }) =>
        (l.title ?? "").includes("local copy")
      ),
      // Whatever overlay survives must carry no progress at all.
      anyStoredProgress: lists.some((l: { items?: Array<Record<string, unknown>> }) =>
        (l.items ?? []).some(
          (i) => (i.attempts as number) > 0 || (i.box as number) > 0
        )
      )
    };
  });
  expect(after.anyLocalCopy).toBe(false);
  expect(after.anyStoredProgress).toBe(false);

  // And it survives a reload: nothing rehydrates the cleared progress.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  expect(
    await page.evaluate(() => {
      const raw = window.localStorage.getItem("worddeck.v1.lists");
      const parsed = raw ? JSON.parse(raw) : [];
      const lists = Array.isArray(parsed) ? parsed : (parsed.lists ?? []);
      return lists.some((l: { items?: Array<Record<string, unknown>> }) =>
        (l.items ?? []).some((i) => (i.attempts as number) > 0)
      );
    })
  ).toBe(false);
});
