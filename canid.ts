#!/usr/bin/env npx ts-node

/**
 * canid.ts — Command-line front-end: translate hex colors to animal vision equivalents.
 *
 * The color math lives in colorimetry.ts and visual-systems.ts, and the REPL logic in
 * repl.ts; this file only handles files, arguments, stdin/stdout and ANSI rendering.
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

import { hexToRgb, rgbToHex } from "./colorimetry";
import { Mode, MODES, MODE_NAMES, isMode, translateHex, simulateCanid, simulateRat } from "./visual-systems";
import { Line, ReplState, banner, execute, initialState, promptFor, toCoolorsUrl } from "./repl";

// Re-exported so `import { translateHex } from "./canid"` keeps working.
export { translateHex, simulateCanid, simulateRat };
export type { Mode };

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

/** Render structured REPL output lines as ANSI text. */
function printLines(lines: Line[]): void {
  for (const line of lines) {
    switch (line.t) {
      case "title": console.log(`  ${BOLD}${line.text}${RESET}`); break;
      case "note":  console.log(`  ${DIM}${line.text}${RESET}`); break;
      case "pair":  printPair(line.original, line.simulated); break;
      case "link":  console.log(`  ${line.url}`); break;
      case "blank": console.log(); break;
    }
  }
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
  let state: ReplState = initialState(initialMode);

  printLines(banner(state));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = (): void => {
    rl.question(`  ${promptFor(state)}`, (input) => {
      const result = execute(state, input);
      state = result.state;
      if (result.exit) {
        rl.close();
        return;
      }
      printLines(result.lines);
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
      console.error(`Unknown mode '${val}'. Available: ${MODE_NAMES.join(", ")}`);
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

// Only run when invoked directly, so importing this file has no side effects.
if (require.main === module) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
