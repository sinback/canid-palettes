#!/usr/bin/env npx ts-node

/**
 * canid.ts — Translate hex colors to canid (dichromatic) vision equivalents
 *
 * Simulates coyote/dog dichromacy using LMS cone space projection.
 * Canid cone peaks: ~430nm (S, similar to human S) and ~555nm (L, between human M and L).
 * Uses Hunt-Pointer-Estevez matrices for XYZ <-> LMS conversion.
 *
 * Usage:
 *   npx ts-node canid.ts #e8b840
 *   npx ts-node canid.ts e8b840 d4931f 5c3b0d 1c1b17
 *   npx ts-node canid.ts --csv palette.csv
 *   npx ts-node canid.ts --coolors #e8b840 #d4931f #5c3b0d
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

// ── Color math ────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  hex = hex.replace(/^#/, "");
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`Invalid hex color: #${hex}`);
  }
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
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

function linearize(v: number): number {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function delinearize(v: number): number {
  v = Math.max(0, Math.min(1, v));
  return Math.round(
    (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255
  );
}

function rgbToXyz(r: number, g: number, b: number): [number, number, number] {
  const rl = linearize(r), gl = linearize(g), bl = linearize(b);
  return [
    rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375,
    rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750,
    rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041,
  ];
}

function xyzToRgb(x: number, y: number, z: number): [number, number, number] {
  const rl =  x *  3.2404542 - y * 1.5371385 - z * 0.4985314;
  const gl = -x *  0.9692660 + y * 1.8760108 + z * 0.0415560;
  const bl =  x *  0.0556434 - y * 0.2040259 + z * 1.0572252;
  return [delinearize(rl), delinearize(gl), delinearize(bl)];
}

// Hunt-Pointer-Estevez XYZ -> LMS
function xyzToLms(x: number, y: number, z: number): [number, number, number] {
  return [
     x *  0.38971 + y * 0.68898 - z * 0.07868,
    -x *  0.22981 + y * 1.18340 + z * 0.04641,
     z *  1.0,
  ];
}

// Inverse HPE LMS -> XYZ
function lmsToXyz(l: number, m: number, s: number): [number, number, number] {
  return [
     l *  1.86006661 - m * 1.12948648 + s * 0.21989882,
     l *  0.36122292 + m * 0.63880431 - s * 0.00000918,
                                         s * 1.08908734,
  ];
}

// ── Vision simulators ─────────────────────────────────────────────────────────

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
export function simulateCanid(
  r: number,
  g: number,
  b: number
): [number, number, number] {
  const [x, y, z] = rgbToXyz(r, g, b);
  const [l, m, s] = xyzToLms(x, y, z);

  // Canid L-cone ~555nm sits closer to human M (530nm) than human L (560nm)
  const canidL = l * 0.35 + m * 0.65;

  // Dichromat projection: both L and M channels carry canidL
  const [nx, ny, nz] = lmsToXyz(canidL, canidL, s);
  return xyzToRgb(nx, ny, nz);
}

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

export function simulateRat(
  r: number,
  g: number,
  b: number
): [number, number, number] {
  const [x, y, z] = rgbToXyz(r, g, b);
  const [, m] = xyzToLms(x, y, z);

  // Normalize to [0, 1] relative to white, then encode as linear green
  const mNorm = Math.max(0, Math.min(1, m / M_WHITE));
  return [0, delinearize(mNorm), 0];
}

// ── Mode registry ─────────────────────────────────────────────────────────────

export type Mode = "canid" | "rat";

const MODES: Record<Mode, {
  label: string;
  simulate: (r: number, g: number, b: number) => [number, number, number];
}> = {
  canid: { label: "canid",  simulate: simulateCanid },
  rat:   { label: "rat",    simulate: simulateRat   },
};

function isMode(s: string): s is Mode {
  return s in MODES;
}

// ── translateHex ──────────────────────────────────────────────────────────────

export function translateHex(hex: string, mode: Mode = "canid"): { original: string; simulated: string } {
  const [r, g, b] = hexToRgb(hex);
  const [sr, sg, sb] = MODES[mode].simulate(r, g, b);
  return {
    original: rgbToHex(r, g, b),
    simulated: rgbToHex(sr, sg, sb),
  };
}

// ── Output helpers ─────────────────────────────────────────────────────────────

const RESET  = "\x1b[0m";
const DIM    = "\x1b[2m";
const BOLD   = "\x1b[1m";

function colorBlock(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[48;2;${r};${g};${b}m  ${RESET}`;
}

function printPair(original: string, simulated: string, label?: string): void {
  const tag = label ? ` ${DIM}${label}${RESET}` : "";
  console.log(
    `  ${colorBlock(original)} ${BOLD}${original}${RESET}  →  ${colorBlock(simulated)} ${BOLD}${simulated}${RESET}${tag}`
  );
}

function toCoolorsUrl(hexes: string[]): string {
  return "https://coolors.co/" + hexes.map((h) => h.replace("#", "")).join("-");
}

// ── CSV handling ───────────────────────────────────────────────────────────────

interface CsvRow {
  original_hex: string;
  simulated_hex: string;
  orig_r: number;
  orig_g: number;
  orig_b: number;
  sim_r: number;
  sim_g: number;
  sim_b: number;
}

function processColors(hexes: string[], mode: Mode): CsvRow[] {
  return hexes.map((hex) => {
    const clean = hex.replace(/^#/, "");
    const [r, g, b] = hexToRgb(clean);
    const [sr, sg, sb] = MODES[mode].simulate(r, g, b);
    return {
      original_hex: rgbToHex(r, g, b),
      simulated_hex: rgbToHex(sr, sg, sb),
      orig_r: r, orig_g: g, orig_b: b,
      sim_r: sr, sim_g: sg, sim_b: sb,
    };
  });
}

function writeCsv(rows: CsvRow[], outPath: string, mode: Mode): void {
  const header = `original_hex,${mode}_hex,orig_r,orig_g,orig_b,${mode}_r,${mode}_g,${mode}_b`;
  const lines = rows.map((row) =>
    [row.original_hex, row.simulated_hex,
     row.orig_r, row.orig_g, row.orig_b,
     row.sim_r, row.sim_g, row.sim_b].join(",")
  );
  fs.writeFileSync(outPath, [header, ...lines].join("\n") + "\n");
}

function readCsvHexes(csvPath: string): string[] {
  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.trim().split("\n");
  const header = lines[0].split(",");
  const hexCol = header.findIndex((h) =>
    h.trim().toLowerCase().replace(/[^a-z_]/g, "") === "hex" ||
    h.trim().toLowerCase().includes("hex") ||
    h.trim().toLowerCase().includes("color")
  );
  if (hexCol === -1) {
    // No header found — assume first column is hex values, skip header row
    return lines.slice(1).map((l) => l.split(",")[0].trim()).filter(Boolean);
  }
  return lines.slice(1).map((l) => l.split(",")[hexCol].trim()).filter(Boolean);
}

// ── Interactive REPL ──────────────────────────────────────────────────────────

async function interactiveMode(initialMode: Mode): Promise<void> {
  let mode = initialMode;

  const modeNames = Object.keys(MODES).join(", ");

  console.log(`\n  ${BOLD}Animal Vision Translator${RESET}`);
  console.log(`  ${DIM}Mode: ${mode}. Commands: 'mode <name>', 'coolors', 'clear', 'quit'.${RESET}`);
  console.log(`  ${DIM}Available modes: ${modeNames}${RESET}\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const history: string[] = [];

  const ask = (): void => {
    rl.question(`  [${mode}] hex> `, (input) => {
      const raw = input.trim();
      const cmd = raw.toLowerCase();

      if (cmd === "quit" || cmd === "exit" || cmd === "q") {
        rl.close();
        return;
      }

      if (cmd.startsWith("mode ")) {
        const next = cmd.slice(5).trim();
        if (isMode(next)) {
          mode = next;
          history.length = 0;
          console.log(`  ${DIM}Switched to ${mode} mode. History cleared.${RESET}\n`);
        } else {
          console.log(`  ${DIM}Unknown mode '${next}'. Available: ${modeNames}${RESET}\n`);
        }
        ask();
        return;
      }

      if (cmd === "coolors") {
        if (history.length === 0) {
          console.log(`  ${DIM}No colors yet.${RESET}\n`);
        } else {
          const allHexes = history.flatMap((h) => {
            const { original, simulated } = translateHex(h, mode);
            return [original, simulated];
          });
          console.log(`\n  ${toCoolorsUrl(allHexes)}\n`);
        }
        ask();
        return;
      }

      if (cmd === "clear") {
        history.length = 0;
        console.log(`  ${DIM}Cleared.${RESET}\n`);
        ask();
        return;
      }

      try {
        const { original, simulated } = translateHex(raw, mode);
        history.push(original);
        printPair(original, simulated);
        console.log();
      } catch (e) {
        console.log(`  ${DIM}${(e as Error).message}${RESET}\n`);
      }

      ask();
    });
  };

  ask();
}

// ── CLI entry point ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let args = process.argv.slice(2);

  // Parse --mode <mode> anywhere before other flags
  let mode: Mode = "canid";
  const modeIdx = args.indexOf("--mode");
  if (modeIdx !== -1) {
    const val = args[modeIdx + 1];
    if (!val || !isMode(val)) {
      console.error(`Unknown mode '${val}'. Available: ${Object.keys(MODES).join(", ")}`);
      process.exit(1);
    }
    mode = val;
    args = [...args.slice(0, modeIdx), ...args.slice(modeIdx + 2)];
  }

  if (args.length === 0) {
    await interactiveMode(mode);
    return;
  }

  // --csv <input.csv> [output.csv]
  if (args[0] === "--csv") {
    const inPath = args[1];
    if (!inPath) {
      console.error("Usage: canid.ts [--mode <mode>] --csv <input.csv> [output.csv]");
      process.exit(1);
    }
    const hexes = readCsvHexes(inPath);
    const rows = processColors(hexes, mode);
    const outPath = args[2] ?? path.join(
      path.dirname(inPath),
      path.basename(inPath, ".csv") + `-${mode}.csv`
    );
    writeCsv(rows, outPath, mode);
    console.log(`\n  Translated ${rows.length} colors (${mode}) → ${outPath}\n`);
    rows.forEach((row) => printPair(row.original_hex, row.simulated_hex));
    console.log();
    return;
  }

  // --coolors <hex> [hex ...]
  if (args[0] === "--coolors") {
    const hexes = args.slice(1);
    if (hexes.length === 0) {
      console.error("Usage: canid.ts [--mode <mode>] --coolors #hex1 #hex2 ...");
      process.exit(1);
    }
    const rows = processColors(hexes, mode);
    rows.forEach((row) => printPair(row.original_hex, row.simulated_hex));
    const allHexes = rows.flatMap((r) => [r.original_hex, r.simulated_hex]);
    console.log(`\n  ${toCoolorsUrl(allHexes)}\n`);
    return;
  }

  // Plain hex args: canid.ts [--mode <mode>] #e8b840 #d4931f ...
  console.log(`\n  ${BOLD}Animal Vision Translator${RESET} ${DIM}(${mode})${RESET}\n`);
  const rows = processColors(args, mode);
  rows.forEach((row) => printPair(row.original_hex, row.simulated_hex));

  if (rows.length > 1) {
    const allHexes = rows.flatMap((r) => [r.original_hex, r.simulated_hex]);
    console.log(`\n  coolors: ${DIM}${toCoolorsUrl(allHexes)}${RESET}`);
  }
  console.log();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
