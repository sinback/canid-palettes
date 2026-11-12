/**
 * visual-systems.ts — Models of non-human visual systems.
 *
 * Each model describes an animal's photoreceptor complement and how it reduces a
 * stimulus (an sRGB color) to a percept, rendered back into sRGB so a human can
 * look at it. All models here are approximations, not measured transforms.
 *
 * Pure functions only: no Node or DOM APIs.
 */

import {
  Rgb,
  hexToRgb,
  rgbToHex,
  delinearize,
  rgbToXyz,
  xyzToRgb,
  xyzToLms,
  lmsToXyz,
} from "./colorimetry";

// ── Canid (dichromat) ─────────────────────────────────────────────────────────

/**
 * Simulate canid dichromacy.
 *
 * Dogs/coyotes have two cone types:
 *   S-cone: ~430nm  (similar to human S)
 *   L-cone: ~555nm  (between human M at 530nm and human L at 560nm)
 *
 * We collapse human L and M into a single weighted canid-L response,
 * then reconstruct as a dichromat (L = M = canidL).
 */
export function simulateCanid(r: number, g: number, b: number): Rgb {
  const [x, y, z] = rgbToXyz(r, g, b);
  const [l, m, s] = xyzToLms(x, y, z);

  // Canid L-cone ~555nm sits closer to human M (530nm) than human L (560nm)
  const canidL = l * 0.35 + m * 0.65;

  // Dichromat projection: both L and M channels carry canidL
  const [nx, ny, nz] = lmsToXyz(canidL, canidL, s);
  return xyzToRgb(nx, ny, nz);
}

// ── Rat (monochromat, experimental) ───────────────────────────────────────────

/**
 * Simulate rat monochromacy (M-cone only, ignoring UV S-cones).
 *
 * Rats have an M-cone peaking at ~530nm (similar to the HPE M-cone basis).
 * Ignoring UV S-cones, they are effectively monochromats — every color
 * reduces to a single brightness dimension.
 *
 * We normalize the M-cone activation against D65 white so the full input
 * range maps faithfully to the full output range. The result is displayed
 * as a green-tinted grayscale: black → (0,0,0), white → (0,255,0).
 *
 * Note: routing through lmsToXyz(0, m, 0) is incorrect — pure M-cone
 * stimulation is outside the sRGB gamut (requires negative X in XYZ), so
 * the round-trip produces a ×2.29 scale factor that clips at ~43% brightness,
 * erasing distinctions between mid-bright and bright colors.
 */

// M-cone activation for D65 white — used to normalize rat output
const M_WHITE = (() => {
  const [x, y, z] = rgbToXyz(255, 255, 255);
  return xyzToLms(x, y, z)[1];
})();

export function simulateRat(r: number, g: number, b: number): Rgb {
  const [x, y, z] = rgbToXyz(r, g, b);
  const [, m] = xyzToLms(x, y, z);

  // Normalize to [0, 1] relative to white, then encode as linear green
  const mNorm = Math.max(0, Math.min(1, m / M_WHITE));
  return [0, delinearize(mNorm), 0];
}

// ── Mode registry ─────────────────────────────────────────────────────────────

export type Mode = "canid" | "rat";

export const MODES: Record<Mode, {
  label: string;
  /** One or two plain-English sentences, shown when the user switches to this mode. */
  description: string;
  simulate: (r: number, g: number, b: number) => Rgb;
}> = {
  canid: {
    label: "canid",
    description:
      "Canids have two cone types, so reds, oranges and greens blur toward yellow-olive while blues stay distinct from yellows.",
    simulate: simulateCanid,
  },
  rat: {
    label: "rat",
    description:
      "Only one color channel is modeled, so every color becomes a brightness level, drawn here as green: black stays black and white becomes full green.",
    simulate: simulateRat,
  },
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
