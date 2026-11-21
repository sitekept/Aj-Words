import { expect, test } from "@playwright/test";
import { gotoHome } from "./helpers";

test("export downloads a JSON file that can be re-imported", async ({ page }) => {
  await gotoHome(page);

  // Export triggers a download of the tagged JSON payload.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^aj-words-.*\.json$/);
  await expect(page.getByText(/\d+ listes? exportées?/)).toBeVisible();

  const filePath = await download.path();

  // Re-import the very file we just exported. Every list in it already exists
  // under the same id, so this goes through the replace confirmation rather
  // than importing straight away.
  await page
    .getByLabel("Importer un fichier JSON AJ Words")
    .setInputFiles(filePath);
  const replaceDialog = page.getByRole("dialog");
  await expect(
    replaceDialog.getByRole("heading", { name: "Remplacer des listes existantes ?" })
  ).toBeVisible();
  await replaceDialog.getByRole("button", { name: "Remplacer" }).click();
  await expect(page.getByText(/\d+ listes? importées?/)).toBeVisible();
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
