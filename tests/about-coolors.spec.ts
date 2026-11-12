import { expect, test } from "@playwright/test";
import { enter } from "./helpers";

test("the page explains what the coolors command links to", async ({ page }) => {
  await page.goto("/");
  const section = page.locator(".notes", { has: page.locator("#about-coolors") });
  await expect(page.locator("#about-coolors")).toHaveText("About the coolors command");

  const link = section.getByRole("link", { name: "Coolors" });
  await expect(link).toHaveAttribute("href", "https://coolors.co");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);

  await expect(section).toContainText("third-party");
  await expect(section).toContainText("not affiliated with Coolors or its maintainer");
  await expect(section).toContainText("some of its other features are paid");
});

test("the explanation is consistent with the URL the command actually builds", async ({ page }) => {
  await page.goto("/");
  await enter(page, "e8b840");
  await enter(page, "coolors");
  // original, simulated, ... as the page text says
  await expect(page.locator("#log .line.link a")).toHaveText("https://coolors.co/e8b840-b3c943");
  await expect(page.locator("#about-coolors + p")).toContainText("original, simulated");
});
