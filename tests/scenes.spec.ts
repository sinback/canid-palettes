import { expect, Page, test } from "@playwright/test";
import { rgbToHex } from "../colorimetry";
import { simulateCanid, setCanidWarmStandIn } from "../visual-systems";

// The real images in images/ are not checked in, so these tests serve a small
// generated PNG in their place. It has four colors and one transparent pixel.
const FIXTURE: [number, number, number, number][] = [
  [232, 184, 64, 255], [232, 184, 64, 255], [170, 187, 204, 255], [255, 0, 0, 255],
  [128, 128, 128, 255], [232, 184, 64, 255], [170, 187, 204, 255], [10, 200, 30, 0],
];
const FIXTURE_W = 4, FIXTURE_H = 2;

async function fixturePng(page: Page): Promise<Buffer> {
  await page.goto("about:blank");
  const dataUrl = await page.evaluate(([pixels, w, h]) => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(w, h);
    img.data.set(pixels.flat());
    ctx.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  }, [FIXTURE, FIXTURE_W, FIXTURE_H] as const);
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

async function openWithFixture(page: Page): Promise<void> {
  const png = await fixturePng(page);
  await page.route("**/images/*.png", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: png })
  );
  await page.goto("/scenes.html");
  await page.locator("body[data-ready]").waitFor();
}

/** Pixels of the simulated canvas in the given scene, as [r, g, b, a]. */
async function outputPixels(page: Page, scene: string): Promise<number[][]> {
  return page.locator(`${scene} canvas.simulated`).evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    const out: number[][] = [];
    for (let i = 0; i < d.length; i += 4) out.push([d[i], d[i + 1], d[i + 2], d[i + 3]]);
    return out;
  });
}

function expected(): number[][] {
  return FIXTURE.map(([r, g, b, a]) => (a === 0 ? [0, 0, 0, 0] : [...simulateCanid(r, g, b), a]));
}

test.afterEach(() => setCanidWarmStandIn());

test("each scene's output matches simulateCanid pixel by pixel", async ({ page }) => {
  await openWithFixture(page);
  for (const scene of ["#scene-1", "#scene-2"]) {
    const px = await outputPixels(page, scene);
    // Transparent pixels stay transparent; their color does not matter.
    expect(px.map((p) => (p[3] === 0 ? [0, 0, 0, 0] : p))).toEqual(expected());
  }
});

test("the palette strip lists each visible color once, most-used first", async ({ page }) => {
  await openWithFixture(page);
  const strip = page.locator("#scene-1 .palette");
  await expect(strip.locator(".count")).toHaveText("4 colors");
  const entries = await strip.locator("li.entry").evaluateAll((els) =>
    els.map((el) => [(el as HTMLElement).dataset.original, (el as HTMLElement).dataset.simulated])
  );
  expect(entries.map((e) => e[0])).toEqual(["#e8b840", "#aabbcc", "#ff0000", "#808080"]);
  for (const [from, to] of entries) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(from!.slice(i, i + 2), 16));
    expect(to).toBe(rgbToHex(...simulateCanid(r, g, b)));
  }
});

test("moving a slider repaints both scenes from the new stand-in", async ({ page }) => {
  await openWithFixture(page);
  const before = await outputPixels(page, "#scene-2");
  await page.locator("#warm-slider").fill("55");
  await expect(page.locator("#warm-hex")).toHaveText("#ffc800");

  setCanidWarmStandIn(255, 200, 0);
  await expect.poll(() => outputPixels(page, "#scene-1").then((px) => px[0])).toEqual([...simulateCanid(232, 184, 64), 255]);
  const after = await outputPixels(page, "#scene-2");
  expect(after[0]).not.toEqual(before[0]);
  expect(after[4]).toEqual(before[4]); // gray stays gray
  await expect(page.locator("#scene-2 .palette li.entry").first()).toHaveAttribute(
    "data-simulated", rgbToHex(...simulateCanid(232, 184, 64))
  );
});

test("the slider setting is shared with the REPL page", async ({ page }) => {
  await openWithFixture(page);
  await page.getByRole("button", { name: "hue of 475 nm" }).click();
  await page.goto("/");
  await expect(page.locator("#cool-hex")).toHaveText("#008dff");
});

test("a missing image shows a message instead of breaking the page", async ({ page }) => {
  await page.route("**/images/glade2.png", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto("/scenes.html");
  await page.locator("body[data-ready]").waitFor();
  await expect(page.locator("#scene-2 .missing")).toContainText("images/glade2.png");
  await expect(page.locator("#warm-slider")).toBeVisible();
});

test("the REPL page links to the scene preview", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Preview pixel-art scenes" }).click();
  await expect(page).toHaveURL(/scenes\.html$/);
});
