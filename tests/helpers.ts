import { expect, Locator, Page } from "@playwright/test";

/** Type a line into the REPL prompt and press Enter. */
export async function enter(page: Page, text: string): Promise<void> {
  await page.locator("#input").fill(text);
  await page.locator("#input").press("Enter");
}

export const pairs = (page: Page): Locator => page.locator("#log .line.pair");

/** All [original, simulated] hex pairs currently in the scrollback, in order. */
export async function allPairs(page: Page): Promise<[string, string][]> {
  return pairs(page).evaluateAll((els) =>
    els.map((el) => [
      (el as HTMLElement).dataset.original!,
      (el as HTMLElement).dataset.simulated!,
    ] as [string, string])
  );
}

export async function lastPair(page: Page): Promise<[string, string]> {
  const all = await allPairs(page);
  expect(all.length).toBeGreaterThan(0);
  return all[all.length - 1];
}

/**
 * Golden values from the spectral model in spectra.ts / visual-systems.ts. They guard
 * against accidental changes in the math; tests/colorimetry.spec.ts checks the math itself.
 */
export const GOLDEN_CANID: [string, string][] = [
  ["#e8b840", "#c4c43f"],
  ["#d4931f", "#a4a41c"],
  ["#5c3b0d", "#44440c"],
  ["#1c1b17", "#1b1b17"],
  ["#aabbcc", "#b7b7cc"],
];

export const GOLDEN_RAT: [string, string][] = [
  ["#e8b840", "#00a100"],
  ["#ffffff", "#00ff00"],
  ["#000000", "#000000"],
];
