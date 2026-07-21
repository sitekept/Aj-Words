import { expect, test } from "@playwright/test";
import { gotoHome } from "./helpers";

test("export downloads a JSON file that can be re-imported", async ({ page }) => {
  await gotoHome(page);

  // Export triggers a download of the tagged JSON payload.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^aj-words-.*\.json$/);
  await expect(page.getByText(/Exported \d+ lists/)).toBeVisible();

  const filePath = await download.path();

  // Re-import the very file we just exported.
  await page
    .getByLabel("Import AJ Words JSON file")
    .setInputFiles(filePath);
  await expect(page.getByText(/Imported \d+ lists/)).toBeVisible();
});

test("importing a file that is not an AJ Words export shows an error", async ({
  page
}) => {
  await gotoHome(page);
  const importInput = page.getByLabel("Import AJ Words JSON file");

  // Valid JSON, wrong shape.
  await importInput.setInputFiles({
    name: "not-an-export.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify("definitely not an export"))
  });
  await expect(
    page.getByText("This file is not a valid AJ Words export.")
  ).toBeVisible();

  // Not JSON at all.
  await importInput.setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("this is {{ not json")
  });
  await expect(
    page.getByText("This file is not valid JSON.")
  ).toBeVisible();
});
