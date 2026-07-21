/**
 * Keyboard and screen-reader contract for every modal, enforced by the shared
 * Modal primitive in components/ui.tsx: focus moves into the dialog, Tab is
 * trapped inside it, the background is inert, Escape closes, and focus returns
 * to whatever opened it.
 *
 * Each modal has different content (text fields, a number field, an upload
 * button), so each is checked rather than trusting the primitive alone.
 */
import { expect, test, type Page } from "@playwright/test";
import { createListWithTerms, gotoHome, type WordPair } from "./helpers";

const WORDS: WordPair[] = [
  { word: "bonjour", translation: "hello" },
  { word: "merci", translation: "thanks" }
];

/** Focus is inside the dialog, and the page behind it is inert. */
const expectIsolated = async (page: Page) => {
  const state = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const shell = document.querySelector<HTMLElement>(".app-shell");
    return {
      hasDialog: Boolean(dialog),
      focusInside: Boolean(dialog?.contains(document.activeElement)),
      backgroundInert: shell?.inert === true,
      scrollLocked: document.body.style.overflow === "hidden"
    };
  });
  expect(state).toEqual({
    hasDialog: true,
    focusInside: true,
    backgroundInert: true,
    scrollLocked: true
  });
};

/** Tabbing all the way round never escapes the dialog. */
const expectTabTrapped = async (page: Page) => {
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() =>
      Boolean(
        document
          .querySelector('[role="dialog"]')
          ?.contains(document.activeElement)
      )
    );
    expect(inside, `focus left the dialog after ${i + 1} tabs`).toBe(true);
  }
};

/** Escape closes, clears inert and scroll lock, and restores focus. */
const expectEscapeRestores = async (page: Page, triggerName: string) => {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  const after = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".app-shell");
    return {
      inertCleared: shell?.inert === false,
      scrollRestored: document.body.style.overflow === "",
      focusedText: document.activeElement?.textContent?.trim() ?? "",
      focusedLabel: document.activeElement?.getAttribute("aria-label") ?? ""
    };
  });

  expect(after.inertCleared).toBe(true);
  expect(after.scrollRestored).toBe(true);
  expect(`${after.focusedText} ${after.focusedLabel}`).toContain(triggerName);
};

test("list form modal is keyboard-isolated and restores focus", async ({
  page
}) => {
  await gotoHome(page);
  await page.getByRole("button", { name: "New list" }).click();

  await expectIsolated(page);
  // Opens on the first field, not on the close button.
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("list-title");
  await expectTabTrapped(page);
  await expectEscapeRestores(page, "New list");
});

test("word form modal is keyboard-isolated and restores focus", async ({
  page
}) => {
  await gotoHome(page);
  await createListWithTerms(page, "Modal deck", WORDS);

  await page.getByRole("button", { name: "Add word" }).first().click();
  await expectIsolated(page);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("word");
  // This modal holds a file-upload control, which must not break the cycle.
  await expectTabTrapped(page);
  await expectEscapeRestores(page, "Add word");
});

test("daily goal modal is keyboard-isolated and restores focus", async ({
  page
}) => {
  await gotoHome(page);

  const trigger = page.getByRole("button", { name: /daily goal/ });
  const triggerName = (await trigger.getAttribute("aria-label")) ?? "";
  await trigger.click();

  await expectIsolated(page);
  await expectTabTrapped(page);
  await expectEscapeRestores(page, triggerName);
});

test("shared-list import modal is keyboard-isolated", async ({ page }) => {
  await page.addInitScript(() => {
    const store: string[] = [];
    (window as unknown as { __copied: string[] }).__copied = store;
    if (navigator.clipboard) {
      navigator.clipboard.writeText = async (text: string) => {
        store.push(text);
      };
    }
  });

  await gotoHome(page);
  await createListWithTerms(page, "Shared deck", WORDS);
  await page.getByRole("button", { name: "Share list" }).click();
  await expect(page.getByText(/Share link copied/)).toBeVisible();

  const url = await page.evaluate(
    () => (window as unknown as { __copied: string[] }).__copied.at(-1) ?? ""
  );
  await page.goto("about:blank");
  await page.goto(url);

  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Import shared list" })
  ).toBeVisible();

  // This one is opened by a URL fragment rather than a button, so there is no
  // trigger to restore focus to — only isolation and the trap apply.
  await expectIsolated(page);
  await expectTabTrapped(page);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(
    await page.evaluate(() => ({
      inertCleared: document.querySelector<HTMLElement>(".app-shell")?.inert === false,
      scrollRestored: document.body.style.overflow === ""
    }))
  ).toEqual({ inertCleared: true, scrollRestored: true });
});
