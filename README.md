# canid-palettes
Translate hex colors to their canid (dichromatic — S-cone + L/M cone) equivalents — what a dog, wolf, coyote, fox, etc. would see.

## Setup

```bash
npm install
```

## Try it in the browser

The same REPL runs as a web page. The latest passing build of `main` is hosted at
**https://sinback.github.io/canid-palettes**.

## Run the web page locally

```bash
npm run serve
```

This builds the page into `_site/` and serves it at http://localhost:4173.

## Usage

**Interactive REPL** (no args):
```bash
npx ts-node canid.ts
```
Type hex codes (one or several per line). Commands: `mode <name>` (`canid`, `rat`), `coolors` prints a
coolors.co URL of everything entered, `clear`, `help`, and `quit`.

**Translate specific colors:**
```bash
npx ts-node canid.ts #e8b840 #d4931f #5c3b0d
```

**Generate a coolors URL:**
```bash
npx ts-node canid.ts --coolors #e8b840 #d4931f #5c3b0d 1c1b17
```

**Batch from CSV** (expects a column named `hex` or `color`; falls back to first column):
```bash
npx ts-node canid.ts --csv palette.csv
# writes palette-canid.csv alongside the input
npx ts-node canid.ts --csv palette.csv out/translated.csv
```

## Notes

Simulation uses Hunt-Pointer-Estevez LMS matrices. Canid cone peaks: ~430nm (S) and ~555nm (L).
The L-cone weight split (35% human-L / 65% human-M) reflects the ~555nm peak sitting closer
to human M (530nm) than human L (560nm). This is a principled approximation, not a measured transform.

## Project layout

| File | Role |
|---|---|
| `colorimetry.ts` | Species-agnostic color conversions (hex, sRGB, XYZ, LMS) |
| `visual-systems.ts` | Vision models (`canid`, `rat`) and `translateHex` |
| `repl.ts` | REPL interpreter shared by the CLI and the web page; returns structured output |
| `canid.ts` | CLI front-end (arguments, CSV, readline, ANSI rendering) |
| `web.ts`, `index.html` | Browser front-end; `npm run build:web` bundles them into `_site/` |
| `tests/` | Playwright tests, including CLI/web parity checks |

## Tests

```bash
npx playwright install chromium   # first time only
npm test
```

## Deploying

`.github/workflows/pages.yml` typechecks and runs the Playwright suite on every push and pull request,
and deploys `_site/` to GitHub Pages from `main`. In the repository settings, Pages → Source must be
set to **GitHub Actions**.

## Importing as a module

```typescript
import { translateHex, simulateCanid } from "./visual-systems";

const { original, simulated } = translateHex("#e8b840");
// { original: '#e8b840', simulated: '#b3c943' }

const [r, g, b] = simulateCanid(232, 184, 64);
```
