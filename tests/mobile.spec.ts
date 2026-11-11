import { expect, test } from "@playwright/test";
import { allPairs, enter } from "./helpers";

test("works at phone width without horizontal scrolling", async ({ page }) => {
  await page.goto("/");
  await enter(page, "e8b840 d4931f 5c3b0d 1c1b17");
  expect(await allPairs(page)).toHaveLength(4);
  await enter(page, "coolors");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);

  const box = await page.locator("#terminal").boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
});

test("does not auto-focus the prompt on touch devices (no surprise keyboard)", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#input")).not.toBeFocused();
});

test("example chips work by tap", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "a palette" }).tap();
  expect(await allPairs(page)).toHaveLength(4);
});
