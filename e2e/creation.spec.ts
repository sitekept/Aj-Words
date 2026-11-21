import { expect, test } from "@playwright/test";
import { addWordViaModal, gotoHome, type WordPair } from "./helpers";

const WORDS: WordPair[] = [
  { word: "rouge", translation: "red" },
  { word: "bleu", translation: "blue" },
  { word: "vert", translation: "green" },
  { word: "jaune", translation: "yellow" }
];

test("create a list, add words, and survive a reload", async ({ page }) => {
  await gotoHome(page);

  // Create an empty list via the "Nouvelle liste" modal.
  await page.getByRole("button", { name: "Nouvelle liste" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nom de la liste").fill("E2E Colors");
  await dialog.getByLabel("Langue").fill("Français");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "E2E Colors" })
  ).toBeVisible();

  // Add four words through the "Ajouter un mot" modal.
  for (const pair of WORDS) {
    await addWordViaModal(page, pair);
  }

  // All rows are visible.
  const wordList = page.locator(".word-list");
  for (const pair of WORDS) {
    await expect(wordList.getByText(pair.word, { exact: true })).toBeVisible();
    await expect(
      wordList.getByText(pair.translation, { exact: true })
    ).toBeVisible();
  }

  // The selection is mirrored to the ?list= URL param.
  expect(page.url()).toContain("?list=");

  // Reload: the same list is still selected and its words persisted.
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "E2E Colors" })
  ).toBeVisible();
  for (const pair of WORDS) {
    await expect(
      page.locator(".word-list").getByText(pair.word, { exact: true })
    ).toBeVisible();
  }
});
