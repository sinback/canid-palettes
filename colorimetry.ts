/**
 * colorimetry.ts — Species-agnostic color conversions.
 *
 * sRGB <-> linear RGB <-> CIE XYZ (D65) <-> LMS (Hunt-Pointer-Estevez).
 * Pure functions only: no Node or DOM APIs, so this runs in the CLI and the browser.
 */

export type Rgb = [number, number, number];

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

// ── RGB <-> XYZ ───────────────────────────────────────────────────────────────

export function rgbToXyz(r: number, g: number, b: number): Rgb {
  const rl = linearize(r), gl = linearize(g), bl = linearize(b);
  return [
    rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375,
    rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750,
    rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041,
  ];
}

export function xyzToRgb(x: number, y: number, z: number): Rgb {
  const rl =  x *  3.2404542 - y * 1.5371385 - z * 0.4985314;
  const gl = -x *  0.9692660 + y * 1.8760108 + z * 0.0415560;
  const bl =  x *  0.0556434 - y * 0.2040259 + z * 1.0572252;
  return [delinearize(rl), delinearize(gl), delinearize(bl)];
}

// ── XYZ <-> LMS (Hunt-Pointer-Estevez) ────────────────────────────────────────

export function xyzToLms(x: number, y: number, z: number): Rgb {
  return [
     x *  0.38971 + y * 0.68898 - z * 0.07868,
    -x *  0.22981 + y * 1.18340 + z * 0.04641,
     z *  1.0,
  ];
}

export function lmsToXyz(l: number, m: number, s: number): Rgb {
  return [
     l *  1.86006661 - m * 1.12948648 + s * 0.21989882,
     l *  0.36122292 + m * 0.63880431 - s * 0.00000918,
                                         s * 1.08908734,
  ];
}
