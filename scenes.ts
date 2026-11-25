/**
 * scenes.ts — Browser front-end for the scene preview page (scenes.html).
 *
 * Shows each pixel-art image next to its canid simulation. Pixel art has a small
 * palette, so each image is turned into a palette (its distinct colors) plus, for
 * every pixel, which palette entry it uses. When a stand-in slider moves, only the
 * palette is re-simulated and the output image is repainted from it.
 */

import { Rgb, rgbToHex } from "./colorimetry";
import { mountStandInControls } from "./standin-controls";
import { simulateCanid } from "./visual-systems";

interface Scene {
  width: number;
  height: number;
  /** Distinct colors, most-used first. */
  palette: Rgb[];
  /** How many palette entries appear in visible (not fully transparent) pixels. */
  visible: number;
  /** For every pixel, its index into `palette`. */
  pixelColor: Uint32Array;
  /** The output image; its alpha channel is copied from the source once. */
  output: ImageData;
  outputCanvas: HTMLCanvasElement;
  paletteList: HTMLUListElement;
}

const scenes: Scene[] = [];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// ── Loading an image into a palette + index ───────────────────────────────────

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

function indexColors(pixels: ImageData): { palette: Rgb[]; visible: number; pixelColor: Uint32Array } {
  const { data } = pixels;
  const count = data.length / 4;
  const keyToSlot = new Map<number, number>();
  const keys: number[] = [];
  const uses: number[] = [];
  const slotOf = new Uint32Array(count);

  for (let i = 0; i < count; i++) {
    const key = (data[4 * i] << 16) | (data[4 * i + 1] << 8) | data[4 * i + 2];
    let slot = keyToSlot.get(key);
    if (slot === undefined) {
      slot = keys.length;
      keyToSlot.set(key, slot);
      keys.push(key);
      uses.push(0);
    }
    // Fully transparent pixels do not count as "using" a color.
    if (data[4 * i + 3] > 0) uses[slot]++;
    slotOf[i] = slot;
  }

  // Sort most-used first, then renumber the pixels to match.
  const order = keys.map((_, slot) => slot).sort((a, b) => uses[b] - uses[a]);
  const renumber = new Uint32Array(keys.length);
  order.forEach((slot, rank) => (renumber[slot] = rank));
  for (let i = 0; i < count; i++) slotOf[i] = renumber[slotOf[i]];

  const palette = order.map((slot): Rgb => [(keys[slot] >> 16) & 255, (keys[slot] >> 8) & 255, keys[slot] & 255]);
  // Colors used only by fully transparent pixels sort last and are not shown.
  const visible = order.filter((slot) => uses[slot] > 0).length;
  return { palette, visible, pixelColor: slotOf };
}

// ── Building one scene ────────────────────────────────────────────────────────

function pane(label: string, canvas: HTMLCanvasElement): HTMLElement {
  return el("div", { className: "pane" }, el("div", { className: "pane-label" }, label), canvas);
}

async function buildScene(figure: HTMLElement): Promise<void> {
  const src = figure.dataset.src!;
  let img: HTMLImageElement;
  try {
    img = await loadImage(src);
  } catch {
    figure.append(
      el("div", { className: "missing" }, `Could not load ${src}. Put a PNG at that path in the project and run npm run serve again.`)
    );
    return;
  }

  const width = img.naturalWidth, height = img.naturalHeight;
  const original = el("canvas", { width, height, className: "original" });
  const ctx = original.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const pixels = ctx.getImageData(0, 0, width, height);

  const outputCanvas = el("canvas", { width, height, className: "simulated" });
  const output = new ImageData(width, height);
  for (let i = 3; i < pixels.data.length; i += 4) output.data[i] = pixels.data[i];

  const { palette, visible, pixelColor } = indexColors(pixels);
  const paletteList = el("ul", { className: "palette" });

  original.setAttribute("aria-label", `${src}, original`);
  outputCanvas.setAttribute("aria-label", `${src}, as a canid sees it`);

  const pair = el("div", { className: "pair" }, pane("original", original), pane("canid", outputCanvas));
  figure.append(pair, paletteList);

  // Scale up by a whole number of screen pixels when there is room, so every
  // art pixel stays the same size; otherwise shrink to fit.
  const fit = (): void => {
    const available = (pair.clientWidth - 12) / 2;
    const scale = available >= width ? Math.floor(available / width) : available / width;
    for (const c of [original, outputCanvas]) c.style.width = `${width * scale}px`;
  };
  new ResizeObserver(fit).observe(pair);
  fit();

  const scene: Scene = { width, height, palette, visible, pixelColor, output, outputCanvas, paletteList };
  scenes.push(scene);
  render(scene);
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function render(scene: Scene): void {
  const simulated = scene.palette.map((c) => simulateCanid(...c));

  const out = scene.output.data;
  const index = scene.pixelColor;
  for (let i = 0; i < index.length; i++) {
    const [r, g, b] = simulated[index[i]];
    out[4 * i] = r;
    out[4 * i + 1] = g;
    out[4 * i + 2] = b;
  }
  scene.outputCanvas.getContext("2d")!.putImageData(scene.output, 0, 0);

  const entries = scene.palette.slice(0, scene.visible).map((c, i) => {
    const from = rgbToHex(...c), to = rgbToHex(...simulated[i]);
    const top = el("span");
    const bottom = el("span");
    top.style.backgroundColor = from;
    bottom.style.backgroundColor = to;
    const li = el("li", { className: "entry", title: `${from} → ${to}` }, top, bottom);
    li.dataset.original = from;
    li.dataset.simulated = to;
    return li;
  });
  const n = scene.visible;
  scene.paletteList.replaceChildren(
    el("li", { className: "count" }, `${n} color${n === 1 ? "" : "s"}`),
    ...entries
  );
}

// ── Boot ──────────────────────────────────────────────────────────────────────

mountStandInControls(document.getElementById("standin") as HTMLElement, () => scenes.forEach(render));

const ready = Promise.all(
  [...document.querySelectorAll<HTMLElement>(".scene[data-src]")].map(buildScene)
);
ready.then(() => document.body.setAttribute("data-ready", ""));
