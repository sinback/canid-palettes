# canid-vision

Translate hex colors to their canid (dichromatic — S-cone + L/M cone) equivalents — what a dog, wolf, coyote, fox, etc. would see.

## Setup

```bash
npm install
```

## Usage

**Interactive REPL** (no args):
```bash
npx ts-node canid.ts
```
Type hex codes one at a time. `coolors` prints a coolors.co URL of everything entered. `quit` exits.

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

## Importing as a module

```typescript
import { translateHex, simulateCanid } from "./canid";

const { original, canid } = translateHex("#e8b840");
// { original: '#e8b840', canid: '#c9a824' }

const [r, g, b] = simulateCanid(232, 184, 64);
```
