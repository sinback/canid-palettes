import { expect, test } from "@playwright/test";
import {
  LINEAR_RGB_TO_XYZ,
  XYZ_TO_LINEAR_RGB,
  delinearize,
  hexToRgb,
  linearize,
  mulMat3,
  mulMat3Vec3,
  invertMat3,
  rgbToHex,
  rgbToXyz,
  xyzToRgb,
} from "../colorimetry";
import {
  DISPLAY_PRIMARIES,
  WAVELENGTHS,
  displayCatchWeights,
  displaySpectrum,
  catchOf,
  pigmentSensitivity,
  spectrumToXyz,
} from "../spectra";
import {
  CANID_CONE_PEAKS,
  RAT_CONE_PEAKS,
  canidConeCatches,
  simulateCanid,
  simulateRat,
} from "../visual-systems";

// Pure math tests: no browser involved.

/** A 9x9x9 grid of sRGB colors covering the whole cube, corners included. */
const GRID: [number, number, number][] = [];
const STEPS = [0, 32, 64, 96, 128, 160, 192, 224, 255];
for (const r of STEPS) for (const g of STEPS) for (const b of STEPS) GRID.push([r, g, b]);

// ── Conversions undo one another ──────────────────────────────────────────────

test("hex -> rgb -> hex is the identity", () => {
  for (const [r, g, b] of GRID) {
    const hex = rgbToHex(r, g, b);
    expect(hexToRgb(hex)).toEqual([r, g, b]);
    expect(rgbToHex(...hexToRgb(hex))).toBe(hex);
  }
  expect(hexToRgb("#abc")).toEqual(hexToRgb("aabbcc"));
});

test("linearize -> delinearize is the identity for every 8-bit value", () => {
  for (let v = 0; v <= 255; v++) expect(delinearize(linearize(v))).toBe(v);
});

test("rgb -> xyz -> rgb is the identity", () => {
  for (const [r, g, b] of GRID) expect(xyzToRgb(...rgbToXyz(r, g, b))).toEqual([r, g, b]);
});

test("the XYZ matrices are inverses of each other", () => {
  for (const product of [
    mulMat3(LINEAR_RGB_TO_XYZ, XYZ_TO_LINEAR_RGB),
    mulMat3(XYZ_TO_LINEAR_RGB, LINEAR_RGB_TO_XYZ),
  ]) {
    product.forEach((row, i) =>
      row.forEach((v, j) => expect(v).toBeCloseTo(i === j ? 1 : 0, 12))
    );
  }
});

test("invertMat3 undoes an arbitrary matrix and rejects a singular one", () => {
  const m: [[number, number, number], [number, number, number], [number, number, number]] =
    [[2, -1, 0.5], [0.25, 3, -2], [1, 0.5, 4]];
  const v: [number, number, number] = [0.3, -1.7, 2.2];
  const back = mulMat3Vec3(invertMat3(m), mulMat3Vec3(m, v));
  back.forEach((x, i) => expect(x).toBeCloseTo(v[i], 12));
  expect(() => invertMat3([[1, 2, 3], [2, 4, 6], [0, 1, 0]])).toThrow();
});

test("white is the D65 white point", () => {
  const [x, y, z] = rgbToXyz(255, 255, 255);
  expect(x).toBeCloseTo(0.9505, 3);
  expect(y).toBeCloseTo(1.0, 3);
  expect(z).toBeCloseTo(1.089, 3);
});

// ── Pigment sensitivity curves ────────────────────────────────────────────────

test("a pigment's sensitivity curve peaks at its peak wavelength", () => {
  for (const peak of [CANID_CONE_PEAKS.s, RAT_CONE_PEAKS.m, CANID_CONE_PEAKS.l, 600]) {
    let best = 0, bestNm = 0;
    for (let nm = 380; nm <= 780; nm++) {
      const s = pigmentSensitivity(peak, nm);
      if (s > best) { best = s; bestNm = nm; }
    }
    expect(Math.abs(bestNm - peak)).toBeLessThanOrEqual(1);
    expect(best).toBeCloseTo(1, 1);
  }
});

test("sensitivity falls faster toward red than toward blue", () => {
  const peak = CANID_CONE_PEAKS.l;
  expect(pigmentSensitivity(peak, peak + 60)).toBeLessThan(pigmentSensitivity(peak, peak - 60));
});

// ── Screen model ──────────────────────────────────────────────────────────────

test("the modelled screen primaries reproduce sRGB exactly", () => {
  DISPLAY_PRIMARIES.forEach((spectrum, k) => {
    const xyz = spectrumToXyz(spectrum);
    xyz.forEach((v, i) => expect(v).toBeCloseTo(LINEAR_RGB_TO_XYZ[i][k], 9));
  });
});

test("the modelled screen never emits negative light", () => {
  for (const spectrum of DISPLAY_PRIMARIES) {
    expect(spectrum).toHaveLength(WAVELENGTHS.length);
    for (const v of spectrum) expect(v).toBeGreaterThanOrEqual(0);
  }
});

test("catch weights agree with summing over the full spectrum", () => {
  const peak = CANID_CONE_PEAKS.l;
  const weights = displayCatchWeights(peak);
  expect(weights[0] + weights[1] + weights[2]).toBeCloseTo(1, 12);
  const white = catchOf(displaySpectrum([1, 1, 1]), peak);
  const rgb: [number, number, number] = [0.2, 0.7, 0.4];
  const direct = catchOf(displaySpectrum(rgb), peak) / white;
  expect(weights[0] * rgb[0] + weights[1] * rgb[1] + weights[2] * rgb[2]).toBeCloseTo(direct, 12);
});

// ── Canid ─────────────────────────────────────────────────────────────────────

test("canid: the L cone mostly sees green and red, the S cone mostly sees blue", () => {
  const s = displayCatchWeights(CANID_CONE_PEAKS.s);
  const l = displayCatchWeights(CANID_CONE_PEAKS.l);
  expect(s[2]).toBeGreaterThan(0.8);
  expect(l[1]).toBeGreaterThan(l[0]);
  expect(l[0]).toBeGreaterThan(l[2]);
});

test("canid: grays stay exactly gray", () => {
  for (let v = 0; v <= 255; v++) expect(simulateCanid(v, v, v)).toEqual([v, v, v]);
});

test("canid: output is always a yellow/blue mix (R equals G)", () => {
  for (const [r, g, b] of GRID) {
    const [sr, sg] = simulateCanid(r, g, b);
    expect(sr).toBe(sg);
  }
});

test("canid: input and output give the canid's cones the same catches", () => {
  // Rounding the output to 8 bits moves a catch by at most about 0.005.
  const TOLERANCE = 0.006;
  let checked = 0;
  for (const [r, g, b] of GRID) {
    const out = simulateCanid(r, g, b);
    const [s0, l0] = canidConeCatches(r, g, b);
    const [s1, l1] = canidConeCatches(...out);
    // The L catch is always preserved.
    expect(Math.abs(l1 - l0)).toBeLessThan(TOLERANCE);
    // The S catch is preserved unless the blue channel had to be clamped.
    if (out[2] > 0 && out[2] < 255) {
      expect(Math.abs(s1 - s0)).toBeLessThan(TOLERANCE);
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(GRID.length / 2);
});

test("canid: clamping only ever costs a small S-cone error", () => {
  for (const [r, g, b] of GRID) {
    const [s0] = canidConeCatches(r, g, b);
    const [s1] = canidConeCatches(...simulateCanid(r, g, b));
    expect(Math.abs(s1 - s0)).toBeLessThan(0.02);
  }
});

test("canid: simulating twice changes nothing", () => {
  for (const [r, g, b] of GRID) {
    const once = simulateCanid(r, g, b);
    expect(simulateCanid(...once)).toEqual(once);
  }
});

test("canid: red is dimmer than green, and blue passes through untouched", () => {
  // Pure red is far dimmer to a canid than pure green...
  expect(simulateCanid(255, 0, 0)[0]).toBeLessThan(simulateCanid(0, 255, 0)[0]);
  // ...and blue passes through untouched.
  expect(simulateCanid(0, 0, 255)).toEqual([0, 0, 255]);
});

// ── Rat ───────────────────────────────────────────────────────────────────────

test("rat: black is black, white is full green, output is green-only", () => {
  expect(simulateRat(0, 0, 0)).toEqual([0, 0, 0]);
  expect(simulateRat(255, 255, 255)).toEqual([0, 255, 0]);
  for (const [r, g, b] of GRID) {
    const out = simulateRat(r, g, b);
    expect(out[0]).toBe(0);
    expect(out[2]).toBe(0);
  }
});

test("rat: grays keep their brightness", () => {
  for (let v = 0; v <= 255; v++) expect(simulateRat(v, v, v)).toEqual([0, v, 0]);
});

test("rat: brightness never drops when a channel gets brighter", () => {
  for (const [r, g, b] of GRID) {
    const base = simulateRat(r, g, b)[1];
    expect(simulateRat(Math.min(255, r + 31), g, b)[1]).toBeGreaterThanOrEqual(base);
    expect(simulateRat(r, Math.min(255, g + 31), b)[1]).toBeGreaterThanOrEqual(base);
    expect(simulateRat(r, g, Math.min(255, b + 31))[1]).toBeGreaterThanOrEqual(base);
  }
});

test("rat: the M cone responds to green most, red least", () => {
  const m = displayCatchWeights(RAT_CONE_PEAKS.m);
  expect(m[1]).toBeGreaterThan(m[2]);
  expect(m[2]).toBeGreaterThan(m[0]);
});
