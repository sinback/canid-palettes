import { expect, test } from "@playwright/test";
import { enter, lastPair } from "./helpers";

test("the page explains each mode, including why rat mode is green", async ({ page }) => {
  await page.goto("/");
  const section = page.locator(".notes");
  await expect(page.locator("#about-modes")).toHaveText("The modes");
  await expect(section).toContainText("mode canid");
  await expect(section).toContainText("mode rat");
  await expect(section).toContainText("experimental");
  await expect(section).toContainText("no hue information, only brightness");
  await expect(section).toContainText("Why green rather than gray?");
  await expect(section).toContainText("UV");
});

test("what the page says about rat mode matches what the REPL does", async ({ page }) => {
  await page.goto("/");
  await enter(page, "mode rat");
  await enter(page, "000000");
  expect(await lastPair(page)).toEqual(["#000000", "#000000"]); // "black stays black"
  await enter(page, "ffffff");
  expect(await lastPair(page)).toEqual(["#ffffff", "#00ff00"]); // "white becomes full green (#00ff00)"
  await expect(page.locator("#about-modes ~ p", { hasText: "#00ff00" })).toHaveCount(1);

  // "Different colors of similar brightness come out the same": a blue, an orange and an olive
  // all land on the same green as mid-gray, and every output only has a green channel.
  for (const hex of ["1177ee", "bb7700", "778800", "808080"]) {
    await enter(page, hex);
    const [, out] = await lastPair(page);
    expect(out, hex).toBe("#008000");
  }
});
