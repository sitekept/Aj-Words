import { expect, test } from "@playwright/test";
import { gotoHome, quizPrompt, startMode } from "./helpers";

// The curated-library build (NEXT_PUBLIC_CURATED_LIBRARY=1) is what beta testers
// actually get: the lists ship in the bundle and every path that would add,
// change or remove list content is gone. These specs run against their own
// production server — see the second `webServer` in playwright.config.ts.
//
// The other 15 spec files cover the authoring build, where that UI is present.

const BUNDLED_TITLE = "Anglais › français — les bases";
const BUNDLED_ID = "starter-en-fr-v1";

/** The bundled list's card in the library, by its anchored accessible name. */
const bundledCard = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: new RegExp(`^${BUNDLED_TITLE}`) });

const openBundledList = async (page: import("@playwright/test").Page) => {
  await bundledCard(page).click();
  await expect(
    page.getByRole("heading", { level: 1, name: BUNDLED_TITLE })
  ).toBeVisible();
};

/**
 * A card that is no longer untouched. One "Acquis" swipe advances the Leitner
 * box by one, which is "En cours" — mastery takes several, so asserting on the
 * mastered badge would be asserting the wrong thing.
 */
const advancedBadge = (page: import("@playwright/test").Page) =>
  page.locator(".status-badge:not(.status-new)").first();

/** Progress the store holds for the bundled list, read straight from storage. */
const bundledProgress = (page: import("@playwright/test").Page) =>
  page.evaluate((listId) => {
    const raw = window.localStorage.getItem("worddeck.v1.lists");
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const lists = Array.isArray(parsed) ? parsed : [];
    const match = (
      lists as Array<{ id?: string; items?: Array<{ box?: number }> }>
    ).find((list) => list.id === listId);
    return {
      stored: Boolean(match),
      advanced: (match?.items ?? []).filter((item) => (item.box ?? 0) > 0).length
    };
  }, BUNDLED_ID);

test("the library ships its lists and nothing can change them", async ({
  page
}) => {
  await gotoHome(page);

  // The bundled list is there to study.
  await expect(bundledCard(page)).toBeVisible();

  // Nothing in the top bar adds or moves content. "Exporter" and "Importer" are
  // gone together: an export nobody can import back is a dead end, and import
  // is the path this build exists to close. "Synchroniser" goes too — a cloud
  // pull adds lists, so it is an inbound content path like any other, and
  // lib/useCloudSync.ts gates it on the mode rather than trusting the
  // deployment's env vars. (With no Supabase vars set, as in CI, that button is
  // absent anyway; this assertion bites on a machine that has them.)
  for (const name of ["Nouvelle liste", "Importer", "Exporter", "Synchroniser"]) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
  // The file input is not merely hidden behind a button — it is not rendered.
  await expect(page.getByLabel("Importer un fichier JSON AJ Words")).toHaveCount(
    0
  );
  // Per-list edit and delete.
  await expect(
    page.getByRole("button", { name: `Modifier ${BUNDLED_TITLE}` })
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: `Supprimer ${BUNDLED_TITLE}` })
  ).toHaveCount(0);

  await openBundledList(page);

  // Nothing on the list itself either. Sharing goes too: it is the outbound half
  // of the same import path.
  for (const name of [
    "Ajouter un mot",
    "Modifier la liste",
    "Supprimer la liste",
    "Partager la liste"
  ]) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
  // No per-word edit or delete on any of the 20 cards.
  await expect(page.getByRole("button", { name: /^Modifier / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Supprimer / })).toHaveCount(0);

  // Resetting progress stays: that is progress, not content, and starting a list
  // over is an ordinary study move.
  await expect(
    page.getByRole("button", { name: "Réinitialiser la progression" })
  ).toBeVisible();
});

test("a bundled list is studiable, and the progress survives a reload", async ({
  page
}) => {
  await gotoHome(page);
  await openBundledList(page);

  // A quiz actually runs on bundled content — the library is not a dead screen.
  await startMode(page, "Quiz écrit");
  await expect(quizPrompt(page)).not.toBeEmpty();
  await page.getByRole("button", { name: "Retour" }).first().click();

  // Record progress the cheapest way: one flashcard swipe writes a real SRS box.
  await startMode(page, "Cartes mémo");
  await page.getByRole("button", { name: "Acquis" }).click();
  await page.getByRole("button", { name: "Retour" }).first().click();

  await expect(
    page.getByRole("heading", { level: 1, name: BUNDLED_TITLE })
  ).toBeVisible();
  await expect(advancedBadge(page)).toBeVisible();
  expect(await bundledProgress(page)).toEqual({ stored: true, advanced: 1 });

  // THE regression test. A bundled list is persisted as a progress OVERLAY:
  // only the items whose progress changed, and only their id + progress — no
  // word, no translation. That is byte for byte the shape the orphaned-overlay
  // backstop in lib/retired-lists.ts hunts for, so before it learned to spare
  // live builtins it deleted this on every single load, silently.
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: BUNDLED_TITLE })
  ).toBeVisible();
  await expect(advancedBadge(page)).toBeVisible();
  expect(await bundledProgress(page)).toEqual({ stored: true, advanced: 1 });

  // And again, because the first reload is the one that writes the overlay back:
  // a filter that ate it would do so on the load after that.
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: BUNDLED_TITLE })
  ).toBeVisible();
  expect(await bundledProgress(page)).toEqual({ stored: true, advanced: 1 });
});

test("a share link imports nothing", async ({ page }) => {
  await gotoHome(page);
  const before = await page.evaluate(() => {
    const raw = window.localStorage.getItem("worddeck.v1.lists");
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.length : 0;
  });

  // `#share=` is the only inbound content path that is not a button, so hiding
  // buttons would have left it open. The token does not even need to be valid:
  // a build that honours the fragment shows a modal or an error notice, and a
  // build that ignores it shows neither.
  await page.goto("/#share=ZmFrZS10b2tlbg");
  await expect(
    page.getByRole("heading", { name: "Listes de mots" })
  ).toBeVisible();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".transfer-notice")).toHaveCount(0);

  const after = await page.evaluate(() => {
    const raw = window.localStorage.getItem("worddeck.v1.lists");
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.length : 0;
  });
  expect(after).toBe(before);
});
