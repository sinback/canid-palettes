/**
 * visual-systems.ts — Models of non-human visual systems.
 *
 * Each model describes an animal's cone types by their peak wavelengths, works out
 * how strongly each cone responds to a color on screen (see spectra.ts), and then
 * renders that response back into sRGB so a human can look at it.
 *
 * The cone responses are derived from the physics. The rendering step is a
 * convention: there is no way to know what a color "feels like" to another animal.
 *
 * Pure functions only: no Node or DOM APIs.
 */

import { Rgb, Vec3, hexToRgb, rgbToHex, linearize, delinearize } from "./colorimetry";
import { displayCatchWeights } from "./spectra";

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const toLinear = (r: number, g: number, b: number): Vec3 => [linearize(r), linearize(g), linearize(b)];

// ── Canid (dichromat) ─────────────────────────────────────────────────────────

/**
 * Peak wavelengths of the two dog cone pigments, in nm
 * (Neitz, Geist & Jacobs 1989; Jacobs et al. 1993). Other canids measured so far
 * are within a few nm of these.
 */
export const CANID_CONE_PEAKS = { s: 429, l: 555 } as const;

const CANID_S = displayCatchWeights(CANID_CONE_PEAKS.s);
const CANID_L = displayCatchWeights(CANID_CONE_PEAKS.l);

/**
 * How strongly the two canid cones respond to an sRGB color on screen: [S, L].
 * Each is 0 for black and 1 for white.
 */
export function canidConeCatches(r: number, g: number, b: number): [number, number] {
  const rgb = toLinear(r, g, b);
  return [dot(CANID_S, rgb), dot(CANID_L, rgb)];
}

// The stand-in colors: which human colors we use to paint what a canid sees.
// Linear RGB, largest channel 1. See simulateCanid.
const SCREEN_YELLOW: Vec3 = [1, 1, 0];
const SCREEN_BLUE: Vec3 = [0, 0, 1];

let warmStandIn: Vec3 = SCREEN_YELLOW;
const coolStandIn: Vec3 = SCREEN_BLUE;

/**
 * Choose the color that stands in for the warm side of canid vision (the "yellow"
 * a canid sees in reds, oranges, yellows and greens). Takes sRGB [0, 255]; only the
 * hue matters, so the color is scaled to full strength. Call with no arguments to
 * go back to the default, the screen's own yellow.
 *
 * This is a free choice, not a fact about canids: whichever stand-in is used,
 * the output still gives a canid's cones the same catches as the input.
 */
export function setCanidWarmStandIn(r?: number, g?: number, b?: number): void {
  if (r === undefined || g === undefined || b === undefined) {
    warmStandIn = SCREEN_YELLOW;
    return;
  }
  const rgb = toLinear(r, g, b);
  const highest = Math.max(...rgb);
  const scaled: Vec3 = [rgb[0] / highest, rgb[1] / highest, rgb[2] / highest];
  // The warm stand-in must excite the L cone more than the S cone, relative to white.
  if (!(highest > 0) || dot(CANID_S, scaled) >= dot(CANID_L, scaled)) {
    throw new Error("The warm stand-in must be a warm color (red, orange, yellow or green)");
  }
  warmStandIn = scaled;
}

/** The current warm stand-in as sRGB [0, 255]. */
export function getCanidWarmStandIn(): Rgb {
  return [delinearize(warmStandIn[0]), delinearize(warmStandIn[1]), delinearize(warmStandIn[2])];
}

/**
 * Simulate canid dichromacy.
 *
 * A canid's color world has two dimensions (S catch and L catch) and ours has
 * three, so we must choose which human colors stand in for canid colors. Every
 * output is a gray plus some amount of one of two stand-in colors: a warm one
 * (by default the screen's yellow, red + green together) for colors that excite
 * the L cone more than white does, and a cool one (the screen's blue) for colors
 * that excite the S cone more. This is the usual way of showing dichromat vision
 * (Brettel, Viénot & Mollon 1997; Viénot, Brettel & Mollon 1999).
 *
 * For each input we find the gray + stand-in mix that gives the canid's cones
 * exactly the same two catches as the input. To a canid the input and the output
 * are the same color; to a human, the output has lost precisely the differences
 * a canid cannot see.
 *
 * Which hues to use as stand-ins is a choice. The cone curves cannot settle it:
 * they are exactly what says a canid cannot tell the candidates apart.
 */
export function simulateCanid(r: number, g: number, b: number): Rgb {
  const [s, l] = canidConeCatches(r, g, b);

  // White gives catches of exactly (1, 1), so s < l means "warmer than gray".
  const standIn = s <= l ? warmStandIn : coolStandIn;
  const standInS = dot(CANID_S, standIn), standInL = dot(CANID_L, standIn);

  // Solve   gray + amount * standInS = s
  //         gray + amount * standInL = l
  let amount = (s - l) / (standInS - standInL);
  let gray = s - amount * standInS;

  // A few saturated inputs fall outside what the screen can show. In both cases
  // keep the L catch, which carries most of the brightness, and let the S catch
  // be a little off.
  if (gray < 0) {
    // More vivid than the stand-in itself: use the pure stand-in.
    gray = 0;
    amount = l / standInL;
  }
  if (gray + amount > 1) {
    // Brighter than the stand-in can get: trade some of it for white.
    amount = (1 - l) / (1 - standInL);
    gray = 1 - amount;
  }

  return [
    delinearize(gray + amount * standIn[0]),
    delinearize(gray + amount * standIn[1]),
    delinearize(gray + amount * standIn[2]),
  ];
}

// ── Rat (monochromat, experimental) ───────────────────────────────────────────

/**
 * Peak wavelengths of the two rat cone pigments, in nm (Jacobs, Fenwick & Williams 2001).
 *
 * Most rat cones hold the ~509 nm pigment. The rest hold a pigment peaking in
 * the ultraviolet, at about 359 nm.
 */
export const RAT_CONE_PEAKS = { uv: 359, m: 509 } as const;

const RAT_M = displayCatchWeights(RAT_CONE_PEAKS.m);

/**
 * Simulate rat vision as a single brightness channel: the M cone only.
 *
 * The UV cone is left out because a screen emits almost no light it can catch,
 * so on a screen a rat is very nearly a monochromat. Every color reduces to one
 * number, the M-cone catch, which is 0 for black and 1 for white.
 *
 * The result is displayed as a green-tinted grayscale: black → (0,0,0),
 * white → (0,255,0).
 */
export function simulateRat(r: number, g: number, b: number): Rgb {
  const m = dot(RAT_M, toLinear(r, g, b));
  return [0, delinearize(m), 0];
}

// ── Mode registry ─────────────────────────────────────────────────────────────

export type Mode = "canid" | "rat";

export const MODES: Record<Mode, {
  label: string;
  simulate: (r: number, g: number, b: number) => Rgb;
}> = {
  canid: { label: "canid", simulate: simulateCanid },
  rat:   { label: "rat",   simulate: simulateRat   },
};

export const MODE_NAMES = Object.keys(MODES) as Mode[];

export function isMode(s: string): s is Mode {
  return Object.prototype.hasOwnProperty.call(MODES, s);
}

// ── translateHex ──────────────────────────────────────────────────────────────

export function translateHex(
  hex: string,
  mode: Mode = "canid"
): { original: string; simulated: string } {
  const [r, g, b] = hexToRgb(hex);
  const [sr, sg, sb] = MODES[mode].simulate(r, g, b);
  return {
    original: rgbToHex(r, g, b),
    simulated: rgbToHex(sr, sg, sb),
  };
}
