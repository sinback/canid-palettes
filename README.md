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

<!--
  Everything between "site:begin" and "site:end" is also rendered on the hosted web page
  (see scripts/site-content.mjs), so write it to read well in both places: no relative
  links and no "see above". Everything outside the markers stays README-only.
-->
<!-- site:begin -->
## What the output shows

Dogs, wolves, coyotes and foxes are dichromats: they have two cone types
(about 430 nm and 555 nm) where humans have three. Each result row shows
your color on the left and an approximation of how a canid sees it on the right.

The simulation uses Hunt-Pointer-Estevez LMS matrices and collapses the human L and M
cones into one canid L response. It is a principled approximation, not a measured transform.

## The modes

Switch models with `mode <name>`; `help` lists all commands.

**`mode canid`** (default). Canids have two cone types, so this model keeps two color
channels, roughly blue and yellow. Reds, oranges and greens shift toward the same
yellowish-olive range, while blues stay distinguishable from yellows.

**`mode rat`** (experimental). This model keeps a single channel: the rat’s green-sensitive
cone. With one cone type there is no hue information, only brightness, so every color
reduces to one brightness level. (Rats also have a UV-sensitive cone, but a screen cannot
display UV, so it is not modeled.)

Why green rather than gray? The output is drawn in green only because that is the cone being
modeled; it is a way to display one channel, not a hue the rat perceives. Black stays black,
white becomes full green (`#00ff00`), and the brighter a color looks to that cone, the brighter
its green. Different colors of similar brightness come out the same.

## About the `coolors` command

`coolors` prints a link to [Coolors](https://coolors.co), a third-party palette website. The
link opens a palette containing your colors and their animal equivalents in order (original,
simulated, original, simulated, and so on), which you can then compare and refine there. The
colors travel only inside the link; nothing is sent anywhere until you open it.

This project is not affiliated with Coolors or its maintainer. The author has found its
free features useful for choosing palettes; some of its other features are paid.
<!-- site:end -->

## Method notes

Canid cone peaks: ~430nm (S) and ~555nm (L). The L-cone weight split (35% human-L / 65% human-M)
reflects the ~555nm peak sitting closer to human M (530nm) than human L (560nm).

## Project layout

| File | Role |
|---|---|
| `colorimetry.ts` | Species-agnostic color conversions (hex, sRGB, XYZ, LMS) |
| `visual-systems.ts` | Vision models (`canid`, `rat`) and `translateHex` |
| `repl.ts` | REPL interpreter shared by the CLI and the web page; returns structured output |
| `canid.ts` | CLI front-end (arguments, CSV, readline, ANSI rendering) |
| `web.ts`, `index.html` | Browser front-end; `npm run build:web` bundles them into `_site/` |
| `scripts/site-content.mjs` | Renders the `site:begin`/`site:end` regions of this README into the page |
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
