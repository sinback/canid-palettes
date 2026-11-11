/**
 * repl.ts — The REPL's brain, shared by the CLI (canid.ts) and the web page (web.ts).
 *
 * `execute` takes the current state plus one line of user input and returns the
 * new state and a list of structured output lines. It never prints anything:
 * each front-end renders the lines its own way (ANSI in a terminal, DOM in a page).
 *
 * Pure functions only: no Node or DOM APIs.
 */

import { Mode, MODE_NAMES, isMode, translateHex } from "./visual-systems";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Line =
  | { t: "title"; text: string }
  | { t: "note"; text: string }
  | { t: "pair"; original: string; simulated: string }
  | { t: "link"; url: string }
  | { t: "blank" };

export interface ReplState {
  mode: Mode;
  /** Original hex colors entered since the last `clear` or mode switch. */
  history: string[];
}

export interface ExecResult {
  state: ReplState;
  lines: Line[];
  /** True when the user asked to quit; the front-end decides what that means. */
  exit: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function toCoolorsUrl(hexes: string[]): string {
  return "https://coolors.co/" + hexes.map((h) => h.replace("#", "")).join("-");
}

export function initialState(mode: Mode = "canid"): ReplState {
  return { mode, history: [] };
}

export function promptFor(state: ReplState): string {
  return `[${state.mode}] hex> `;
}

const BLANK: Line = { t: "blank" };

export function banner(state: ReplState): Line[] {
  return [
    BLANK,
    { t: "title", text: "Animal Vision Translator" },
    {
      t: "note",
      text: `Mode: ${state.mode}. Commands: 'mode <name>', 'coolors', 'clear', 'help', 'quit'.`,
    },
    { t: "note", text: `Available modes: ${MODE_NAMES.join(", ")}` },
    BLANK,
  ];
}

function help(state: ReplState): Line[] {
  return [
    { t: "note", text: "Type a hex color (e.g. e8b840, #e8b840 or #eb4) to translate it." },
    { t: "note", text: "Several at once works too: e8b840 d4931f 5c3b0d" },
    { t: "note", text: `mode <name>  switch vision model (${MODE_NAMES.join(", ")}); currently ${state.mode}` },
    { t: "note", text: "coolors      print a coolors.co URL of everything entered" },
    { t: "note", text: "clear        forget the colors entered so far" },
    { t: "note", text: "quit         leave the REPL" },
    BLANK,
  ];
}

// ── Interpreter ───────────────────────────────────────────────────────────────

export function execute(state: ReplState, input: string): ExecResult {
  const raw = input.trim();
  const cmd = raw.toLowerCase();
  const done = (lines: Line[], next: ReplState = state, exit = false): ExecResult => ({
    state: next,
    lines,
    exit,
  });

  if (raw === "") return done([]);

  if (cmd === "quit" || cmd === "exit" || cmd === "q") return done([], state, true);

  if (cmd === "help" || cmd === "?") return done(help(state));

  if (cmd === "mode" || cmd.startsWith("mode ")) {
    const next = cmd.slice(4).trim();
    if (next === "") {
      return done([
        { t: "note", text: `Mode: ${state.mode}. Available: ${MODE_NAMES.join(", ")}` },
        BLANK,
      ]);
    }
    if (isMode(next)) {
      return done(
        [{ t: "note", text: `Switched to ${next} mode. History cleared.` }, BLANK],
        { mode: next, history: [] }
      );
    }
    return done([
      { t: "note", text: `Unknown mode '${next}'. Available: ${MODE_NAMES.join(", ")}` },
      BLANK,
    ]);
  }

  if (cmd === "coolors") {
    if (state.history.length === 0) {
      return done([{ t: "note", text: "No colors yet." }, BLANK]);
    }
    const allHexes = state.history.flatMap((h) => {
      const { original, simulated } = translateHex(h, state.mode);
      return [original, simulated];
    });
    return done([BLANK, { t: "link", url: toCoolorsUrl(allHexes) }, BLANK]);
  }

  if (cmd === "clear") {
    return done([{ t: "note", text: "Cleared." }, BLANK], { ...state, history: [] });
  }

  // Anything else is one or more hex colors, separated by whitespace and/or commas.
  const tokens = raw.split(/[\s,]+/).filter(Boolean);
  const lines: Line[] = [];
  const history = [...state.history];
  for (const token of tokens) {
    try {
      const { original, simulated } = translateHex(token, state.mode);
      history.push(original);
      lines.push({ t: "pair", original, simulated });
    } catch (e) {
      lines.push({ t: "note", text: (e as Error).message });
    }
  }
  lines.push(BLANK);
  return done(lines, { ...state, history });
}
