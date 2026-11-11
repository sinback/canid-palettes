/**
 * web.ts — Browser front-end for the REPL. Renders the same structured output
 * that the CLI prints as ANSI (see repl.ts) as DOM nodes instead.
 */

import { Line, ReplState, banner, execute, initialState, promptFor } from "./repl";

const term = document.getElementById("terminal") as HTMLElement;
const log = document.getElementById("log") as HTMLElement;
const form = document.getElementById("prompt-form") as HTMLFormElement;
const promptEl = document.getElementById("prompt") as HTMLElement;
const input = document.getElementById("input") as HTMLInputElement;

let state: ReplState = initialState("canid");
const inputHistory: string[] = [];
let historyPos = 0; // === inputHistory.length when not browsing
let draft = "";

// ── Rendering ─────────────────────────────────────────────────────────────────

function swatch(hex: string): HTMLElement {
  const el = document.createElement("span");
  el.className = "swatch";
  el.style.backgroundColor = hex;
  el.title = hex;
  return el;
}

function strong(text: string): HTMLElement {
  const el = document.createElement("b");
  el.textContent = text;
  return el;
}

function renderLine(line: Line): HTMLElement {
  const el = document.createElement("div");
  el.className = `line ${line.t}`;
  switch (line.t) {
    case "title":
      el.textContent = line.text;
      break;
    case "note":
      el.textContent = line.text;
      break;
    case "pair":
      el.dataset.original = line.original;
      el.dataset.simulated = line.simulated;
      el.append(
        swatch(line.original), " ", strong(line.original), "  →  ",
        swatch(line.simulated), " ", strong(line.simulated)
      );
      break;
    case "link": {
      const a = document.createElement("a");
      a.href = line.url;
      a.textContent = line.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      el.append(a);
      break;
    }
    case "blank":
      el.setAttribute("aria-hidden", "true");
      break;
  }
  return el;
}

function print(lines: Line[]): void {
  log.append(...lines.map(renderLine));
  term.scrollTop = term.scrollHeight;
}

function echo(prompt: string, text: string): void {
  const el = document.createElement("div");
  el.className = "line echo";
  const p = document.createElement("span");
  p.className = "prompt-text";
  p.textContent = prompt;
  el.append(p, text);
  log.append(el);
}

function updatePrompt(): void {
  promptEl.textContent = promptFor(state).trimEnd();
  term.dataset.mode = state.mode;
}

// ── Running a line ────────────────────────────────────────────────────────────

function run(text: string): void {
  echo(promptFor(state), text);

  const trimmed = text.trim();
  if (trimmed && inputHistory[inputHistory.length - 1] !== trimmed) {
    inputHistory.push(trimmed);
  }
  historyPos = inputHistory.length;
  draft = "";

  const result = execute(state, text);
  state = result.state;
  updatePrompt();

  if (result.exit) {
    print([
      { t: "note", text: "Nothing to quit: this REPL lives in a browser tab. 🐕" },
      { t: "note", text: "Close the tab, or keep translating colors!" },
      { t: "blank" },
    ]);
  } else {
    print(result.lines);
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value;
  input.value = "";
  run(text);
});

// ── Input history (↑ / ↓) ─────────────────────────────────────────────────────

input.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp") {
    if (historyPos === 0) return;
    if (historyPos === inputHistory.length) draft = input.value;
    historyPos--;
    input.value = inputHistory[historyPos];
    e.preventDefault();
  } else if (e.key === "ArrowDown") {
    if (historyPos >= inputHistory.length) return;
    historyPos++;
    input.value = historyPos === inputHistory.length ? draft : inputHistory[historyPos];
    e.preventDefault();
  }
});

// A pasted palette (one color per line) becomes one line of space-separated colors,
// instead of having its newlines silently dropped by the <input>.
input.addEventListener("paste", (e) => {
  const text = e.clipboardData?.getData("text");
  if (text === undefined || !/[\r\n]/.test(text)) return;
  e.preventDefault();
  const flat = text.trim().replace(/\s*[\r\n]+\s*/g, " ");
  input.setRangeText(flat, input.selectionStart ?? 0, input.selectionEnd ?? 0, "end");
});

// ── Focus handling ────────────────────────────────────────────────────────────

// Clicking anywhere in the terminal focuses the prompt (unless selecting text or following a link).
term.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).closest("a")) return;
  if (window.getSelection()?.toString()) return;
  input.focus();
});

// Example chips type into the REPL rather than replacing it.
document.querySelectorAll<HTMLButtonElement>("[data-run]").forEach((btn) => {
  btn.addEventListener("click", () => {
    run(btn.dataset.run ?? "");
    input.focus({ preventScroll: true });
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────────

print(banner(state));
print([
  { t: "note", text: "Try a hex code, paste a few at once, or tap an example below." },
  { t: "blank" },
]);
updatePrompt();

// Don't pop up the on-screen keyboard on touch devices.
if (window.matchMedia("(pointer: fine)").matches) input.focus();
