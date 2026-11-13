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

## How the simulation works

1. **Cone curves from peak wavelengths.** Each cone type is described by the wavelength it responds
   to best: about 429 nm (S) and 555 nm (L) for canids. Visual pigments all share nearly the same
   sensitivity curve shape, just slid along the wavelength axis, so a standard published template
   turns a peak into a full curve.
2. **A hex color becomes light.** The screen's red, green and blue each emit a known spread of
   wavelengths. A hex color says how much of each to switch on, which gives the spectrum leaving
   the screen.
3. **Cone catches.** Multiply that spectrum by a cone's curve, wavelength by wavelength, and add up.
   The total is how strongly the cone responds. A canid gets two numbers per color.
4. **Back to a color you can look at.** A canid's color world has two dimensions and ours has three,
   so every output is a gray plus some amount of one of two "stand-in" colors: a warm one (by default
   the screen's yellow) or a cool one (the screen's blue). For each input, the output is the mix that
   gives a canid's cones the same two catches. To a canid the two swatches match; to you, the output
   has lost exactly the differences a canid cannot see.

### The stand-in color is a choice

Steps 1 to 3 say how much color a canid sees. They cannot say which human hue to paint it with: the
cone curves are exactly what says a canid cannot tell the candidate hues apart. So the warm stand-in
is picked by taste. The web page has a slider for it (greener to more orange), with presets for the
screen's yellow, the hue of 575 nm light (what people with one dichromat eye report seeing) and the
hue of 555 nm light (the canid L cone's peak, which looks yellow-green to us). Wherever the slider
sits, the two swatches in a row still match for a canid. In code, use `setCanidWarmStandIn(r, g, b)`.

`mode rat` uses the same steps with a single cone peaking near 509 nm, shown as a green-tinted
grayscale. Rats also have an ultraviolet cone (about 359 nm), which is left out because a screen
emits almost no light it can catch.

### What this is not

- **A hex color does not say which screen it is on.** The model assumes a typical modern screen
  showing sRGB. Swapping in measured spectra from other screens moves results by a hex step or two.
- **Step 4 is a convention.** See above. Nobody knows what yellow feels like to a dog.
- **Only cone pigments are modelled.** Rods, the lens, and everything the brain does afterwards
  are not.
- **Turn off Night Shift, f.lux and similar** for the intended preview: they tint the whole screen,
  both swatches included.

## Project layout

| File | Role |
|---|---|
| `colorimetry.ts` | Species-agnostic color conversions (hex, sRGB, linear RGB, XYZ) |
| `spectra.ts` | Pigment sensitivity curves, the screen's emission spectra, and cone catches |
| `cie1931.ts` | CIE 1931 colour-matching functions (data table) |
| `visual-systems.ts` | Vision models (`canid`, `rat`) and `translateHex` |
| `repl.ts` | REPL interpreter shared by the CLI and the web page; returns structured output |
| `canid.ts` | CLI front-end (arguments, CSV, readline, ANSI rendering) |
| `web.ts`, `index.html` | Browser front-end; `npm run build:web` bundles them into `_site/` |
| `tests/` | Playwright tests: the math (`colorimetry.spec.ts`), the REPL, and CLI/web parity |

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
// { original: '#e8b840', simulated: '#c4c43f' }

const [r, g, b] = simulateCanid(232, 184, 64);
```
