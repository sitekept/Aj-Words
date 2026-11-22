import { expect, test } from "@playwright/test";
import { createListWithTerms, gotoHome } from "./helpers";

test("export downloads a JSON file that can be re-imported", async ({ page }) => {
  await gotoHome(page);
  // A local list of our own, so the exported file holds both kinds: the bundled
  // (public) list a fresh install always has, and a local one. Re-importing it
  // then exercises both import rules at once.
  await createListWithTerms(page, "Round trip", [
    { word: "alpha", translation: "un" },
    { word: "beta", translation: "deux" }
  ]);

  // Export triggers a download of the tagged JSON payload.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^aj-words-.*\.json$/);
  await expect(page.getByText(/\d+ listes? exportées?/)).toBeVisible();

  const filePath = await download.path();

  // Re-import the very file we just exported. The local list already exists
  // under the same id, so this goes through the replace confirmation rather
  // than importing straight away.
  await page
    .getByLabel("Importer un fichier JSON AJ Words")
    .setInputFiles(filePath);
  const replaceDialog = page.getByRole("dialog");
  await expect(
    replaceDialog.getByRole("heading", { name: "Remplacer des listes existantes ?" })
  ).toBeVisible();
  // Named, and only the local one: a bundled list is never replaced.
  await expect(replaceDialog.getByText("Round trip")).toBeVisible();
  await replaceDialog.getByRole("button", { name: "Remplacer" }).click();
  await expect(page.getByText(/\d+ listes? importées?/)).toBeVisible();

  // The bundled list in that same file took the other path: importing a public
  // id forks a local copy (`createLocalCopy`) instead of overwriting the shared
  // definition. Read from storage rather than the screen, so the assertion holds
  // at both viewports.
  const titles = await page.evaluate(() => {
    const raw = window.localStorage.getItem("worddeck.v1.lists");
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const lists = Array.isArray(parsed) ? parsed : [];
    return (lists as Array<{ title?: string }>).map((list) => list.title ?? "");
  });
  expect(titles.filter((title) => title.includes("copie locale"))).toHaveLength(1);
});

test("importing a file that is not an AJ Words export shows an error", async ({
  page
}) => {
  await gotoHome(page);
  const importInput = page.getByLabel("Importer un fichier JSON AJ Words");

  // Valid JSON, wrong shape.
  await importInput.setInputFiles({
    name: "not-an-export.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify("definitely not an export"))
  });
  await expect(
    page.getByText("Ce fichier n'est pas un export AJ Words valide.")
  ).toBeVisible();

  // Not JSON at all.
  await importInput.setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("this is {{ not json")
  });
  await expect(
    page.getByText("Ce fichier n'est pas du JSON valide.")
  ).toBeVisible();
});
