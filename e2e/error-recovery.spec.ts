import { expect, test } from "@playwright/test";
import { createListWithTerms, gotoHome, type WordPair } from "./helpers";

const WORDS: WordPair[] = [
  { word: "bonjour", translation: "hello" },
  { word: "merci", translation: "thanks" }
];

// The error screen offers a rescue download as the one recovery path for a
// tester whose app just crashed. It wrote the bare localStorage array, which
// parseExportPayload rejects — so the file was silently unimportable and the
// offer was hollow. This pins the round trip: what the rescue path writes must
// go back in through the normal Import action.
test("the rescue export format round-trips through Import", async ({ page }) => {
  await gotoHome(page);
  await createListWithTerms(page, "Rescue deck", WORDS);

  // Reproduce exactly what app/error.tsx writes, from the same storage key.
  const rescueFile = await page.evaluate(() => {
    const raw = window.localStorage.getItem("worddeck.v1.lists");
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return JSON.stringify({
      app: "aj-words",
      version: 1,
      lists: Array.isArray(parsed) ? parsed : []
    });
  });

  // Wipe everything, as if restoring onto a clean browser.
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await page
    .getByLabel("Importer un fichier JSON AJ Words")
    .setInputFiles({
      name: "aj-words-secours.json",
      mimeType: "application/json",
      buffer: Buffer.from(rescueFile)
    });

  // No confirmation here, and that is the point: the wiped browser holds only
  // the bundled list, whose id forks a local copy rather than being replaced,
  // and "Rescue deck" collides with nothing. A rescue onto a clean browser
  // restores straight away — the replace path is covered in
  // import-hardening.spec.ts.
  await expect(page.getByText(/listes? importées?/)).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Rescue deck" })
  ).toBeVisible();
  for (const pair of WORDS) {
    await expect(
      page.locator(".word-list").getByText(pair.word, { exact: true })
    ).toBeVisible();
  }
});

// A list exported before the bundled lists were retired carries a retired id.
// importLists re-ids it so the load-time migration does not delete it, and
// that new id has to be DETERMINISTIC: with a random one, importing the same
// file twice would add a second copy instead of replacing the first.
test("re-importing a pre-removal export twice does not duplicate it", async ({
  page
}) => {
  const oldExport = JSON.stringify({
    app: "aj-words",
    version: 1,
    lists: [
      {
        id: "0b43895e-5ce3-409a-b1ac-4f989fba0dae",
        title: "Mots Darija",
        language: "Darija",
        createdAt: "2026-04-30T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
        testHistory: [],
        items: [
          {
            id: "d1",
            word: "sali",
            translation: "prier",
            status: "mastered",
            attempts: 9,
            correctCount: 8,
            wrongCount: 1,
            correctStreak: 5,
            wrongStreak: 0,
            box: 5,
            dueAt: "2026-12-20T00:00:00.000Z",
            createdAt: "2026-04-30T00:00:00.000Z",
            updatedAt: "2026-10-01T00:00:00.000Z"
          }
        ]
      }
    ]
  });

  const importFile = async () => {
    await page
      .getByLabel("Importer un fichier JSON AJ Words")
      .setInputFiles({
        name: "aj-words-ancien-export.json",
        mimeType: "application/json",
        buffer: Buffer.from(oldExport)
      });
  };

  await gotoHome(page);
  await importFile();
  await expect(
    page.getByRole("heading", { level: 1, name: "Mots Darija" })
  ).toBeVisible();

  // Second import of the same file: it now matches the first by id, so it goes
  // through the replace confirmation instead of adding a copy. Driven straight
  // from the file input, which is in the DOM on every view — the "Accueil"
  // button is hidden below 760px.
  await importFile();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Remplacer des listes existantes ?" })
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Remplacer" }).click();

  const stored = await page.evaluate(() => {
    const raw = window.localStorage.getItem("worddeck.v1.lists");
    const lists = raw ? JSON.parse(raw) : [];
    return lists
      .filter((l: { title?: string }) => l.title === "Mots Darija")
      .map((l: { id: string; items: Array<{ box: number }> }) => ({
        id: l.id,
        box: l.items[0]?.box
      }));
  });

  // Exactly one copy, and its progress survived both round trips.
  expect(stored).toHaveLength(1);
  expect(stored[0].box).toBe(5);
  expect(stored[0].id).not.toBe("0b43895e-5ce3-409a-b1ac-4f989fba0dae");
});
