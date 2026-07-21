import { expect, test } from "@playwright/test";
import { createListWithTerms, gotoHome } from "./helpers";

const EXPORT_APP_ID = "aj-words";
const EXPORT_VERSION = 1;

const importInput = (page: Parameters<typeof gotoHome>[0]) =>
  page.getByLabel("Import AJ Words JSON file");

const exportFile = (lists: unknown[]) =>
  Buffer.from(
    JSON.stringify({
      app: EXPORT_APP_ID,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      lists
    })
  );

test("a file over the size limit is rejected before it is parsed", async ({
  page
}) => {
  await gotoHome(page);

  // Valid JSON, but past the 10 MB ceiling: the guard must fire on size, so
  // the tab never spends time parsing it.
  const padding = "x".repeat(11 * 1024 * 1024);
  await importInput(page).setInputFiles({
    name: "huge.json",
    mimeType: "application/json",
    buffer: exportFile([
      { id: "big", title: padding, language: "", items: [], testHistory: [] }
    ])
  });

  await expect(page.getByText(/over the .* import limit/)).toBeVisible();
});

test("an export carrying no lists is rejected", async ({ page }) => {
  await gotoHome(page);

  await importInput(page).setInputFiles({
    name: "empty.json",
    mimeType: "application/json",
    buffer: exportFile([])
  });

  await expect(
    page.getByText("This export does not contain any lists.")
  ).toBeVisible();
});

test("a card with an absurd FSRS stability imports and stays answerable", async ({
  page
}) => {
  await gotoHome(page);

  // stability: 1e308 used to make the next dueAt computation throw a
  // RangeError the first time this card was graded.
  await importInput(page).setInputFiles({
    name: "hostile-srs.json",
    mimeType: "application/json",
    buffer: exportFile([
      {
        id: "hostile-list",
        title: "Hostile SRS",
        language: "English / French",
        testHistory: [],
        items: [
          {
            id: "h1",
            word: "cat",
            translation: "chat",
            attempts: 3,
            correctCount: 2,
            wrongCount: 1,
            box: 2,
            stability: 1e308,
            difficulty: 5,
            dueAt: "2026-01-01T00:00:00.000Z"
          },
          {
            id: "h2",
            word: "dog",
            translation: "chien",
            attempts: 1,
            box: 1,
            stability: 1e308,
            difficulty: 5,
            // Unparseable date: must not survive normalization.
            dueAt: "banana"
          }
        ]
      }
    ])
  });

  await expect(page.getByText(/Imported 1 list/)).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Hostile SRS" })
  ).toBeVisible();

  // Grading the card is what used to throw; the quiz must survive it.
  await page.getByRole("button", { name: "Written quiz" }).click();
  await page.getByLabel("Answer", { exact: true }).fill("chat");
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.locator(".answer-feedback")).toBeVisible();

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("button", { name: /Next|Finish/ }).click();
  expect(errors).toEqual([]);
});

test("replacing existing lists asks for confirmation and names them", async ({
  page
}) => {
  await gotoHome(page);
  await createListWithTerms(page, "Overwrite me", [
    { word: "alpha", translation: "un" },
    { word: "beta", translation: "deux" }
  ]);

  // Grab the real id of the list we just made, then import a file reusing it.
  const listId = await page.evaluate(() => {
    const raw = window.localStorage.getItem("worddeck.v1.lists");
    const parsed = raw ? JSON.parse(raw) : {};
    const lists = Array.isArray(parsed) ? parsed : (parsed.lists ?? []);
    const match = lists.find(
      (list: { title?: string }) => list.title === "Overwrite me"
    );
    return match?.id ?? null;
  });
  expect(listId).not.toBeNull();

  await importInput(page).setInputFiles({
    name: "replacement.json",
    mimeType: "application/json",
    buffer: exportFile([
      {
        id: listId,
        title: "Overwrite me",
        language: "",
        testHistory: [],
        items: [{ id: "n1", word: "gamma", translation: "trois" }]
      }
    ])
  });

  // The destructive step is a real dialog naming the list, not a bare count.
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Replace existing lists?" })
  ).toBeVisible();
  await expect(dialog.getByText("Overwrite me")).toBeVisible();
  await expect(dialog.getByText(/2 words now/)).toBeVisible();

  // Cancelling leaves the original untouched.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Import cancelled.")).toBeVisible();
  await expect(page.getByText("alpha")).toBeVisible();
});
