import { expect, test } from "@playwright/test";

// The service worker only registers on production builds (localhost counts as
// a registrable host), which is why the suite runs against `npm run start`.
test("production service worker serves the app shell offline", async ({
  context,
  page
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Listes de mots" })).toBeVisible();

  // Registration happens on window load; wait for the worker to activate.
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return Boolean(registration.active);
  });

  // Storage persistence API is exposed (the store requests it on hydrate).
  expect(
    await page.evaluate(() => navigator.storage?.persisted?.() !== undefined)
  ).toBe(true);

  // Reload once so the now-controlling worker caches the shell and assets.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Listes de mots" })).toBeVisible();

  // An aj-words cache exists and holds the navigation shell.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const keys = await caches.keys();
          const name = keys.find((key) => key.startsWith("aj-words"));
          if (!name) {
            return false;
          }
          const cache = await caches.open(name);
          return Boolean(await cache.match("/"));
        }),
      { timeout: 15_000 }
    )
    .toBe(true);

  // Go offline: the cached shell still renders and lists still open.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Listes de mots" })).toBeVisible();

  // The seeded demo list is the one list a fresh install always has. Anchored
  // regex: the card button's accessible name starts with the title, while the
  // per-list "Modifier ..."/"Supprimer ..." icon buttons do not.
  const demoTitle = "Démo — anglais › français";
  await page.getByRole("button", { name: new RegExp(`^${demoTitle}`) }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: demoTitle })
  ).toBeVisible();
});
