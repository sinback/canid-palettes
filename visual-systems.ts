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

/**
 * Simulate canid dichromacy.
 *
 * A canid's color world has two dimensions (S catch and L catch) and ours has
 * three, so we must choose which human colors stand in for canid colors. We use
 * mixes of the screen's yellow (red + green together) and its blue. That family
 * runs through black, every gray and white, and it is the usual choice for
 * showing dichromat vision (Viénot, Brettel & Mollon 1999).
 *
 * For each input we find the yellow/blue mix that gives the canid's cones
 * exactly the same two catches as the input. To a canid the input and the output
 * are the same color; to a human, the output has lost precisely the differences
 * a canid cannot see.
 */
export function simulateCanid(r: number, g: number, b: number): Rgb {
  const [s, l] = canidConeCatches(r, g, b);

  // Catches produced by one unit of yellow (R = G = 1) and one unit of blue.
  const yellowS = CANID_S[0] + CANID_S[1], blueS = CANID_S[2];
  const yellowL = CANID_L[0] + CANID_L[1], blueL = CANID_L[2];

  // Solve   yellow * yellowS + blue * blueS = s
  //         yellow * yellowL + blue * blueL = l
  const det = yellowS * blueL - blueS * yellowL;
  let yellow = (s * blueL - blueS * l) / det;
  let blue = (yellowS * l - s * yellowL) / det;

  // A few saturated inputs (pure red, cyan) need slightly less than no blue, or
  // slightly more than full blue, which a screen cannot show. Keep the L catch,
  // which carries most of the brightness, and let the S catch be a little off.
  if (blue < 0 || blue > 1) {
    blue = clamp01(blue);
    yellow = (l - blue * blueL) / yellowL;
  }

  const y = delinearize(yellow);
  return [y, y, delinearize(blue)];
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
