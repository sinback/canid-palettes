import { expect, test } from "@playwright/test";
import { GOLDEN_CANID, GOLDEN_RAT, allPairs, enter, lastPair, pairs } from "./helpers";

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/");
  // Checked in afterEach: fails the test if anything threw or logged an error in the page.
  (page as any).__errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as any).__errors).toEqual([]);
});

test("shows the banner and a canid prompt", async ({ page }) => {
  await expect(page.locator("#log")).toContainText("Animal Vision Translator");
  await expect(page.locator("#log")).toContainText("Available modes: canid, rat");
  await expect(page.locator("#prompt")).toHaveText("[canid] hex>");
  await expect(page).toHaveTitle(/canid-palettes/);
});

test("translates a color and echoes the input like a terminal", async ({ page }) => {
  await enter(page, "#e8b840");
  await expect(page.locator("#log .line.echo").last()).toHaveText("[canid] hex> #e8b840");
  await expect(pairs(page)).toHaveCount(1);
  await expect(pairs(page).first()).toContainText("#e8b840");
  await expect(pairs(page).first()).toContainText("#c4c43f");
  await expect(page.locator("#input")).toHaveValue("");
  await expect(page.locator("#input")).toBeFocused();
});

test("swatches are painted with the original and simulated colors", async ({ page }) => {
  await enter(page, "e8b840");
  const colors = await pairs(page).first().locator(".swatch").evaluateAll((els) =>
    els.map((el) => getComputedStyle(el).backgroundColor)
  );
  expect(colors).toEqual(["rgb(232, 184, 64)", "rgb(196, 196, 63)"]);
});

test("canid golden values", async ({ page }) => {
  for (const [orig] of GOLDEN_CANID) await enter(page, orig);
  expect(await allPairs(page)).toEqual(GOLDEN_CANID);
});

test("accepts 3-digit hex, no '#', and uppercase", async ({ page }) => {
  await enter(page, "#abc");
  expect(await lastPair(page)).toEqual(["#aabbcc", "#b7b7cc"]);
  await enter(page, "AABBCC");
  expect(await lastPair(page)).toEqual(["#aabbcc", "#b7b7cc"]);
});

test("invalid input shows an error and the session keeps working", async ({ page }) => {
  await enter(page, "zzz");
  await expect(page.locator("#log")).toContainText("Invalid hex color: #zzzzzz");
  await expect(pairs(page)).toHaveCount(0);
  await enter(page, "e8b840");
  await expect(pairs(page)).toHaveCount(1);
});

test("empty input does nothing but echo", async ({ page }) => {
  await enter(page, "   ");
  await expect(page.locator("#log")).not.toContainText("Invalid hex color");
  await expect(pairs(page)).toHaveCount(0);
});

test("several colors on one line give one row each; bad tokens are reported", async ({ page }) => {
  await enter(page, "e8b840, d4931f nope 5c3b0d");
  expect(await allPairs(page)).toEqual([
    ["#e8b840", "#c4c43f"],
    ["#d4931f", "#a4a41c"],
    ["#5c3b0d", "#44440c"],
  ]);
  await expect(page.locator("#log")).toContainText("Invalid hex color: #nope");
});

test("mode rat switches the prompt and renders green-only output", async ({ page }) => {
  await enter(page, "mode rat");
  await expect(page.locator("#prompt")).toHaveText("[rat] hex>");
  await expect(page.locator("#log")).toContainText("Switched to rat mode. History cleared.");
  for (const [orig] of GOLDEN_RAT) await enter(page, orig);
  expect(await allPairs(page)).toEqual(GOLDEN_RAT);
});

test("mode with an unknown name is rejected and keeps the current mode", async ({ page }) => {
  await enter(page, "mode nope");
  await expect(page.locator("#log")).toContainText("Unknown mode 'nope'. Available: canid, rat");
  await expect(page.locator("#prompt")).toHaveText("[canid] hex>");
  // Names inherited from Object.prototype must not count as modes.
  await enter(page, "mode constructor");
  await expect(page.locator("#log")).toContainText("Unknown mode 'constructor'");
  await expect(page.locator("#prompt")).toHaveText("[canid] hex>");
});

test("coolors prints a link with originals and simulated colors interleaved", async ({ page }) => {
  await enter(page, "e8b840 d4931f");
  await enter(page, "coolors");
  const link = page.locator("#log .line.link a");
  await expect(link).toHaveText("https://coolors.co/e8b840-c4c43f-d4931f-a4a41c");
  await expect(link).toHaveAttribute("href", "https://coolors.co/e8b840-c4c43f-d4931f-a4a41c");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
});

test("coolors with no colors says so", async ({ page }) => {
  await enter(page, "coolors");
  await expect(page.locator("#log")).toContainText("No colors yet.");
  await expect(page.locator("#log .line.link")).toHaveCount(0);
});

test("clear forgets history for coolors but keeps the scrollback", async ({ page }) => {
  await enter(page, "e8b840");
  await enter(page, "clear");
  await expect(page.locator("#log")).toContainText("Cleared.");
  await expect(pairs(page)).toHaveCount(1);
  await enter(page, "coolors");
  await expect(page.locator("#log")).toContainText("No colors yet.");
});

test("switching modes clears history", async ({ page }) => {
  await enter(page, "e8b840");
  await enter(page, "mode rat");
  await enter(page, "coolors");
  await expect(page.locator("#log")).toContainText("No colors yet.");
});

test("commands are case-insensitive", async ({ page }) => {
  await enter(page, "MODE RAT");
  await expect(page.locator("#prompt")).toHaveText("[rat] hex>");
  await enter(page, "HELP");
  await expect(page.locator("#log")).toContainText("print a coolors.co URL");
});

test("help lists the commands", async ({ page }) => {
  await enter(page, "help");
  for (const text of ["mode <name>", "coolors", "clear", "quit"]) {
    await expect(page.locator("#log")).toContainText(text);
  }
});

test("quit explains itself instead of closing anything", async ({ page }) => {
  await enter(page, "quit");
  await expect(page.locator("#log")).toContainText("Nothing to quit");
  await enter(page, "e8b840");
  await expect(pairs(page)).toHaveCount(1);
});

test("arrow keys walk through input history and restore the draft", async ({ page }) => {
  const input = page.locator("#input");
  await enter(page, "e8b840");
  await enter(page, "d4931f");
  await input.fill("half-typed");
  await input.press("ArrowUp");
  await expect(input).toHaveValue("d4931f");
  await input.press("ArrowUp");
  await expect(input).toHaveValue("e8b840");
  await input.press("ArrowUp"); // already at the oldest entry
  await expect(input).toHaveValue("e8b840");
  await input.press("ArrowDown");
  await expect(input).toHaveValue("d4931f");
  await input.press("ArrowDown");
  await expect(input).toHaveValue("half-typed");
});

test("pasting one color per line becomes a single line of colors", async ({ page }) => {
  await page.locator("#input").focus();
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text", "e8b840\nd4931f\r\n5c3b0d\n");
    document.getElementById("input")!.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })
    );
  });
  await expect(page.locator("#input")).toHaveValue("e8b840 d4931f 5c3b0d");
  await page.locator("#input").press("Enter");
  await expect(pairs(page)).toHaveCount(3);
});

test("example chips run in the REPL", async ({ page }) => {
  await page.getByRole("button", { name: "#e8b840" }).click();
  await expect(page.locator("#log .line.echo").last()).toHaveText("[canid] hex> #e8b840");
  expect(await lastPair(page)).toEqual(["#e8b840", "#c4c43f"]);

  await page.getByRole("button", { name: "mode rat" }).click();
  await expect(page.locator("#prompt")).toHaveText("[rat] hex>");
});

test("clicking the terminal focuses the prompt", async ({ page }) => {
  await page.locator("h1").click();
  await expect(page.locator("#input")).not.toBeFocused();
  await page.locator("#log .line.title").click();
  await expect(page.locator("#input")).toBeFocused();
});

test("output stays scrolled to the newest line", async ({ page }) => {
  for (let i = 0; i < 25; i++) await enter(page, "e8b840");
  const atBottom = await page.locator("#terminal").evaluate(
    (el) => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 40
  );
  expect(atBottom).toBe(true);
});

test("user input is rendered as text, never as HTML", async ({ page }) => {
  await enter(page, "<img src=x onerror=window.__pwned=1>");
  await expect(page.locator("#log img")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
});

test("the stand-in slider repaints canid rows and feeds the coolors link", async ({ page }) => {
  await enter(page, "e8b840 aabbcc");
  const slider = page.locator("#standin-slider");
  await expect(page.locator("#standin-hex")).toHaveText("#ffff00");

  await slider.fill("60");
  await expect(page.locator("#standin-hex")).toHaveText("#ffc300");
  const [[, warm], [, cool]] = await allPairs(page);
  expect(warm).not.toBe("#c4c43f");
  expect(parseInt(warm.slice(1, 3), 16)).toBeGreaterThan(parseInt(warm.slice(3, 5), 16));
  expect(cool).toBe("#b7b7cc"); // cool colors do not use the warm stand-in
  await expect(pairs(page).first().locator(".swatch").last()).toHaveAttribute("title", warm);

  await enter(page, "coolors");
  await expect(page.locator("#log .line.link a")).toHaveText(
    `https://coolors.co/e8b840-${warm.slice(1)}-aabbcc-b7b7cc`
  );

  await page.getByRole("button", { name: "screen yellow" }).click();
  await expect(slider).toHaveValue("0");
  expect((await allPairs(page))[0]).toEqual(["#e8b840", "#c4c43f"]);

  await page.getByRole("button", { name: "hue of 575 nm" }).click();
  await expect(page.locator("#standin-hex")).toHaveText("#ffdb00");
});

test("the stand-in slider is hidden in rat mode", async ({ page }) => {
  await expect(page.locator("#standin")).toBeVisible();
  await enter(page, "mode rat");
  await expect(page.locator("#standin")).toBeHidden();
  await enter(page, "mode canid");
  await expect(page.locator("#standin")).toBeVisible();
});
