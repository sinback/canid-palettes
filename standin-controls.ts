/**
 * standin-controls.ts — The two stand-in sliders for canid mode, shared by every page.
 *
 * The cone math fixes how much color a canid sees; these sliders choose which
 * human hues paint it (see simulateCanid in visual-systems.ts). The chosen values
 * are remembered in this browser, so both pages and a reload keep them.
 */

import { Rgb, delinearize, rgbToHex } from "./colorimetry";
import { hueOfWavelength } from "./spectra";
import {
  getCanidCoolStandIn,
  getCanidWarmStandIn,
  setCanidCoolStandIn,
  setCanidWarmStandIn,
} from "./visual-systems";

interface Side {
  key: "warm" | "cool";
  label: string;
  min: number;
  max: number;
  ends: [string, string];
  /** Slider value -> stand-in color, sRGB. */
  toRgb: (v: number) => Rgb;
  /** Stand-in color -> slider value (inverse of toRgb for colors it can make). */
  fromRgb: (rgb: Rgb) => number;
  apply: (rgb: Rgb) => void;
  current: () => Rgb;
  presets: [string, number | null][]; // [button label, wavelength in nm or null for the default]
}

// Warm: value is R minus G. 0 is the screen's yellow, positive is more orange.
// Cool: value is R minus G with B at full. 0 is the screen's blue, positive is
// more violet, negative is more cyan.
const SIDES: Side[] = [
  {
    key: "warm",
    label: "Stand-in for the canid’s “yellow”",
    min: -140,
    max: 170,
    ends: ["greener", "more orange"],
    toRgb: (v) => [255 + Math.min(0, v), 255 - Math.max(0, v), 0],
    fromRgb: ([r, g]) => r - g,
    apply: (rgb) => setCanidWarmStandIn(...rgb),
    current: getCanidWarmStandIn,
    presets: [["screen yellow", null], ["hue of 575 nm", 575], ["hue of 555 nm", 555]],
  },
  {
    key: "cool",
    label: "Stand-in for the canid’s “blue”",
    min: -255,
    max: 180,
    ends: ["more cyan", "more violet"],
    toRgb: (v) => [Math.max(0, v), Math.max(0, -v), 255],
    fromRgb: ([r, g]) => r - g,
    apply: (rgb) => setCanidCoolStandIn(...rgb),
    current: getCanidCoolStandIn,
    presets: [["screen blue", null], ["hue of 475 nm", 475], ["hue of 430 nm", 430]],
  },
];

const STORAGE_KEY = "canid-palettes:stand-ins";

function loadSaved(): Partial<Record<Side["key"], number>> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function save(values: Record<Side["key"], number>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Storage can be unavailable (private windows, blocked site data); the sliders still work.
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/**
 * Build both sliders inside `container` and call `onChange` whenever a stand-in
 * changes (including once at start-up if a saved setting was restored).
 */
export function mountStandInControls(container: HTMLElement, onChange: () => void): void {
  const saved = loadSaved();
  const values = { warm: 0, cool: 0 };

  const groups = SIDES.map((side) => {
    const slider = el("input", {
      id: `${side.key}-slider`,
      type: "range",
      min: String(side.min),
      max: String(side.max),
      step: "1",
      value: "0",
    });
    const swatch = el("span", { className: "standin-swatch", id: `${side.key}-swatch` });
    const hex = el("output", { id: `${side.key}-hex` });
    hex.htmlFor.add(slider.id);

    const set = (v: number, notify: boolean): void => {
      v = Math.max(side.min, Math.min(side.max, Math.round(v)));
      slider.value = String(v);
      side.apply(side.toRgb(v));
      values[side.key] = v;
      const shown = rgbToHex(...side.current());
      swatch.style.backgroundColor = shown;
      hex.textContent = shown;
      if (notify) {
        save(values);
        onChange();
      }
    };

    slider.addEventListener("input", () => set(Number(slider.value), true));

    const presets = el("div", { className: "presets" });
    for (const [label, nm] of side.presets) {
      const btn = el("button", { type: "button" }, label);
      btn.addEventListener("click", () => {
        const v = nm === null ? 0 : side.fromRgb(hueOfWavelength(nm).map(delinearize) as Rgb);
        set(v, true);
      });
      presets.append(btn);
    }

    const label = el("label", { htmlFor: slider.id }, side.label);
    const ends = el("div", { className: "ends" }, el("span", {}, side.ends[0]), el("span", {}, side.ends[1]));
    ends.setAttribute("aria-hidden", "true");

    set(typeof saved[side.key] === "number" ? saved[side.key]! : 0, false);
    return el("div", { className: "standin-group" }, label, el("div", { className: "row" }, slider, swatch, hex), ends, presets);
  });

  const note = el(
    "p",
    { className: "standin-note" },
    "The cone math says how much color a canid sees, not which of our hues to paint it with. " +
      "These sliders pick those hues, and that is purely a choice: wherever they sit, a canid " +
      "would still see the original and the simulated color as the same."
  );

  container.replaceChildren(el("div", { className: "standin-groups" }, ...groups), note);
  if (values.warm !== 0 || values.cool !== 0) onChange();
}
