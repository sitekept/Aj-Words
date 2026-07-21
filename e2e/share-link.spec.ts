import { expect, test } from "@playwright/test";
import { createListWithTerms, gotoHome, type WordPair } from "./helpers";

const WORDS: WordPair[] = [
  { word: "bonjour", translation: "hello" },
  { word: "merci", translation: "thanks" }
];

test("share by link round-trips a list into a confirmed import", async ({
  page
}) => {
  // Capture clipboard writes without relying on clipboard permissions: the
  // override always resolves and records the copied text.
  await page.addInitScript(() => {
    const store: string[] = [];
    (window as unknown as { __copied: string[] }).__copied = store;
    if (navigator.clipboard) {
      const original = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = async (text: string) => {
        store.push(text);
        try {
          await original(text);
        } catch {
          /* permissions may be denied in the test context; the copy is still recorded */
        }
      };
    }
  });

  await gotoHome(page);
  await createListWithTerms(page, "Shareable deck", WORDS);

  // Share the open list; its URL is copied to the clipboard.
  await page.getByRole("button", { name: "Share list" }).click();
  await expect(page.getByText(/Share link copied/)).toBeVisible();

  const url = await page.evaluate(
    () => (window as unknown as { __copied: string[] }).__copied.at(-1) ?? ""
  );
  expect(url).toContain("#share=");

  // Open the link the way a recipient would (force a full load, not a hash-only
  // navigation, so the reception effect runs).
  await page.goto("about:blank");
  await page.goto(url);

  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Import shared list" })
  ).toBeVisible();
  await expect(dialog.getByText("Shareable deck")).toBeVisible();

  await dialog.getByRole("button", { name: "Import" }).click();
  await expect(page.getByText(/Imported 1 list/)).toBeVisible();
});
