import { expect, test } from "@playwright/test";
import { MODES, MODE_NAMES } from "../visual-systems";
import { enter } from "./helpers";

test("switching modes explains the new mode in plain English", async ({ page }) => {
  await page.goto("/");
  await enter(page, "mode rat");
  const log = page.locator("#log");
  await expect(log).toContainText("Switched to rat mode. History cleared.");
  await expect(log).toContainText("every color becomes a brightness level, drawn here as green");

  await enter(page, "mode canid");
  await expect(log).toContainText("Switched to canid mode. History cleared.");
  await expect(log).toContainText("reds, oranges and greens blur toward yellow-olive");
});

test("the explanation follows the confirmation line", async ({ page }) => {
  await page.goto("/");
  await enter(page, "mode rat");
  const notes = await page.locator("#log .line.note").allInnerTexts();
  const i = notes.indexOf("Switched to rat mode. History cleared.");
  expect(i).toBeGreaterThan(-1);
  expect(notes[i + 1]).toBe(MODES.rat.description);
});

test("an unknown mode does not print any description", async ({ page }) => {
  await page.goto("/");
  await enter(page, "mode nope");
  await expect(page.locator("#log")).toContainText("Unknown mode 'nope'");
  await expect(page.locator("#log")).not.toContainText("brightness level");
});

test("every registered mode has a non-empty, single-paragraph description", () => {
  for (const mode of MODE_NAMES) {
    const d = MODES[mode].description;
    expect(d.trim().length, mode).toBeGreaterThan(20);
    expect(d, mode).not.toMatch(/\n/);
  }
});
