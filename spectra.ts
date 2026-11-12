/**
 * spectra.ts — Light as a spectrum, and photoreceptors that catch it.
 *
 * This is where wavelengths live. Three ingredients:
 *
 *   1. A photoreceptor's sensitivity curve, generated from its peak wavelength.
 *   2. The spectrum of light a screen emits for each of its R, G and B primaries.
 *   3. "Catch": multiply a spectrum by a sensitivity curve, wavelength by wavelength,
 *      and add up. That total is how strongly the receptor responds.
 *
 * Pure functions only: no Node or DOM APIs.
 */

import { CIE_1931_2DEG } from "./cie1931";
import { Mat3, Vec3, LINEAR_RGB_TO_XYZ, invertMat3, mulMat3 } from "./colorimetry";

/** A value at each wavelength in WAVELENGTHS. */
export type Spectrum = number[];

/** The wavelength grid, in nm: 380 to 780 in 5 nm steps (the visible range). */
export const WAVELENGTHS: number[] = CIE_1931_2DEG.map((row) => row[0]);

// ── 1. Photoreceptor sensitivity from a peak wavelength ───────────────────────

/**
 * Sensitivity of a visual pigment at one wavelength, given only the pigment's
 * peak wavelength. Returns roughly 1 at the peak, falling toward 0 either side.
 *
 * Visual pigments all share nearly the same curve shape, slid along the wavelength
 * axis, so one template with one knob (the peak) describes any of them. This is
 * the template of Govardovskii et al. (2000), "In search of the visual pigment
 * template", for vitamin-A1 pigments (the kind mammals have). It has two parts:
 *
 *   - the main hump (the "alpha band"): a lopsided bell around the peak, steep on
 *     the long-wavelength side and gentler on the short side;
 *   - a second, smaller bump (the "beta band") far toward the violet/UV end,
 *     about a quarter of the main hump's height.
 */
export function pigmentSensitivity(peakNm: number, nm: number): number {
  // Main hump. The shape depends only on the ratio peak / wavelength.
  const x = peakNm / nm;
  const a = 0.8795 + 0.0459 * Math.exp(-((peakNm - 300) ** 2) / 11940);
  const mainHump =
    1 /
    (Math.exp(69.7 * (a - x)) +
      Math.exp(28 * (0.922 - x)) +
      Math.exp(-14.9 * (1.104 - x)) +
      0.674);

  // Second bump: a small bell whose position and width follow the main peak.
  const bumpPeak = 189 + 0.315 * peakNm;
  const bumpWidth = -40.5 + 0.195 * peakNm;
  const secondBump = 0.26 * Math.exp(-(((nm - bumpPeak) / bumpWidth) ** 2));

  return mainHump + secondBump;
}

/** The whole sensitivity curve for a pigment with the given peak. */
export function pigmentSpectrum(peakNm: number): Spectrum {
  return WAVELENGTHS.map((nm) => pigmentSensitivity(peakNm, nm));
}

// ── 2. What the screen emits ──────────────────────────────────────────────────

/**
 * The screen's three native light emitters, each modelled as a bell curve:
 * [peak wavelength in nm, width in nm at half height].
 *
 * These are typical of a modern wide-gamut panel. A hex color does not say which
 * screen it is shown on, so this is an assumption — but the simulated colors turn
 * out to barely depend on it (swapping in measured CRT or LCD spectra moves
 * results by a hex step or two).
 */
export const DISPLAY_EMITTERS: readonly (readonly [number, number])[] = [
  [630, 40], // red
  [530, 40], // green
  [460, 20], // blue
];

function bell(peakNm: number, widthAtHalfHeight: number): Spectrum {
  const sigma = widthAtHalfHeight / (2 * Math.sqrt(2 * Math.log(2)));
  return WAVELENGTHS.map((nm) => Math.exp(-0.5 * ((nm - peakNm) / sigma) ** 2));
}

/** XYZ of a spectrum, using the CIE 1931 colour-matching functions. */
export function spectrumToXyz(spectrum: Spectrum): Vec3 {
  const xyz: Vec3 = [0, 0, 0];
  CIE_1931_2DEG.forEach((row, i) => {
    xyz[0] += spectrum[i] * row[1];
    xyz[1] += spectrum[i] * row[2];
    xyz[2] += spectrum[i] * row[3];
  });
  return xyz;
}

/**
 * The spectrum emitted for each sRGB primary at full strength: [red, green, blue].
 *
 * A wide-gamut screen showing sRGB does not light one emitter per primary; it
 * mixes a little of the others in so that the color lands exactly on the sRGB
 * primary. We solve for that mix, so these spectra reproduce sRGB exactly: the
 * XYZ of each one equals the matching column of LINEAR_RGB_TO_XYZ, and equal
 * amounts of all three make D65 white.
 */
export const DISPLAY_PRIMARIES: [Spectrum, Spectrum, Spectrum] = (() => {
  const emitters = DISPLAY_EMITTERS.map(([peak, width]) => bell(peak, width));
  const e = emitters.map(spectrumToXyz);
  // Columns are the XYZ of each emitter.
  const emitterToXyz: Mat3 = [
    [e[0][0], e[1][0], e[2][0]],
    [e[0][1], e[1][1], e[2][1]],
    [e[0][2], e[1][2], e[2][2]],
  ];
  // mix[j][k] = how much of emitter j goes into sRGB primary k.
  const mix = mulMat3(invertMat3(emitterToXyz), LINEAR_RGB_TO_XYZ);
  const primary = (k: number): Spectrum =>
    WAVELENGTHS.map(
      (_, i) => mix[0][k] * emitters[0][i] + mix[1][k] * emitters[1][i] + mix[2][k] * emitters[2][i]
    );
  return [primary(0), primary(1), primary(2)];
})();

/** The spectrum the screen emits for a linear RGB color (each channel 0..1). */
export function displaySpectrum(linearRgb: Vec3): Spectrum {
  const [r, g, b] = DISPLAY_PRIMARIES;
  return WAVELENGTHS.map((_, i) => linearRgb[0] * r[i] + linearRgb[1] * g[i] + linearRgb[2] * b[i]);
}

// ── 3. Catch ──────────────────────────────────────────────────────────────────

/**
 * How strongly a photoreceptor with the given peak responds to a spectrum.
 *
 * Spectra here are in energy units, but a pigment counts photons, and a
 * long-wavelength photon carries less energy than a short-wavelength one — so
 * the same energy means more photons at longer wavelengths. Multiplying by the
 * wavelength converts energy to photon count.
 */
export function catchOf(spectrum: Spectrum, peakNm: number): number {
  let total = 0;
  WAVELENGTHS.forEach((nm, i) => {
    total += spectrum[i] * nm * pigmentSensitivity(peakNm, nm);
  });
  return total;
}

/**
 * A receptor's response to the screen, as three weights [r, g, b] to apply to a
 * linear RGB color. Scaled so the weights sum to 1: white gives a catch of
 * exactly 1 and black gives 0.
 *
 * Because light adds up, the catch for any color is just the weighted sum of
 * the catches for the three primaries — so the wavelength-by-wavelength sum only
 * has to be done three times, here, and not once per color.
 */
export function displayCatchWeights(peakNm: number): Vec3 {
  const w = DISPLAY_PRIMARIES.map((p) => catchOf(p, peakNm));
  const white = w[0] + w[1] + w[2];
  return [w[0] / white, w[1] / white, w[2] / white];
}
