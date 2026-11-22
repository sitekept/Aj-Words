import { expect, test } from "@playwright/test";
import { gotoHome } from "./helpers";

// The mailto link is the only channel a beta tester has to report anything, and
// the version label is the only way to know which build a report refers to. If
// either silently disappears, the beta goes blind without any other test
// failing — hence this one.
test("the build label and the feedback link are on screen", async ({ page }) => {
  await gotoHome(page);

  await expect(page.getByText(/^Version /)).toBeVisible();

  const feedback = page.getByRole("link", { name: "Donner mon avis" });
  await expect(feedback).toBeVisible();

  const href = (await feedback.getAttribute("href")) ?? "";
  expect(href.startsWith("mailto:")).toBe(true);
  // The body carries what a tester cannot be expected to supply themselves.
  expect(decodeURIComponent(href)).toContain("Version :");
  expect(decodeURIComponent(href)).toContain("Navigateur :");

  // A mailto must not open a new tab: the browser hands it to the mail client
  // and would leave an empty tab behind.
  expect(await feedback.getAttribute("target")).toBeNull();
});
