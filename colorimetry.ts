/**
 * colorimetry.ts — Species-agnostic color conversions.
 *
 * hex <-> sRGB <-> linear RGB <-> CIE XYZ (D65), plus the small matrix helpers
 * the rest of the project needs.
 * Pure functions only: no Node or DOM APIs, so this runs in the CLI and the browser.
 *
 * Every conversion here has an inverse, and the inverse matrices are computed from
 * the forward ones rather than typed in, so a pair can never drift apart.
 * tests/colorimetry.spec.ts checks that each pair undoes the other.
 */

export type Rgb = [number, number, number];
export type Vec3 = [number, number, number];
export type Mat3 = [Vec3, Vec3, Vec3];

// ── Hex <-> RGB ───────────────────────────────────────────────────────────────

export function hexToRgb(hex: string): Rgb {
  hex = hex.replace(/^#/, "");
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`Invalid hex color: #${hex}`);
  }
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) =>
        Math.round(Math.max(0, Math.min(255, v)))
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

// ── sRGB transfer function ────────────────────────────────────────────────────

/** sRGB [0, 255] -> linear light [0, 1]. */
export function linearize(v: number): number {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Linear [0, 1] -> sRGB [0, 255]. Out-of-range input is clipped to the sRGB gamut. */
export function delinearize(v: number): number {
  v = Math.max(0, Math.min(1, v));
  return Math.round(
    (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255
  );
}

// ── 3x3 matrix helpers ────────────────────────────────────────────────────────

export function mulMat3Vec3(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

export function mulMat3(a: Mat3, b: Mat3): Mat3 {
  const col = (j: number): Vec3 => mulMat3Vec3(a, [b[0][j], b[1][j], b[2][j]]);
  const c0 = col(0), c1 = col(1), c2 = col(2);
  return [
    [c0[0], c1[0], c2[0]],
    [c0[1], c1[1], c2[1]],
    [c0[2], c1[2], c2[2]],
  ];
}

export function invertMat3(m: Mat3): Mat3 {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error("Matrix is not invertible");
  return [
    [A / det, (c * h - b * i) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [C / det, (b * g - a * h) / det, (a * e - b * d) / det],
  ];
}

// ── RGB <-> XYZ ───────────────────────────────────────────────────────────────

/** Linear sRGB -> CIE XYZ (D65). The columns are the XYZ of the R, G and B primaries. */
export const LINEAR_RGB_TO_XYZ: Mat3 = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.0721750],
  [0.0193339, 0.1191920, 0.9503041],
];

export const XYZ_TO_LINEAR_RGB: Mat3 = invertMat3(LINEAR_RGB_TO_XYZ);

/** sRGB [0, 255] -> XYZ. */
export function rgbToXyz(r: number, g: number, b: number): Vec3 {
  return mulMat3Vec3(LINEAR_RGB_TO_XYZ, [linearize(r), linearize(g), linearize(b)]);
}

/** XYZ -> sRGB [0, 255], rounded and clipped to the sRGB gamut. */
export function xyzToRgb(x: number, y: number, z: number): Rgb {
  const [rl, gl, bl] = mulMat3Vec3(XYZ_TO_LINEAR_RGB, [x, y, z]);
  return [delinearize(rl), delinearize(gl), delinearize(bl)];
}
