// Builds the static site into _site/: bundles the page scripts and copies the pages,
// the shared stylesheet and any PNGs in images/ (which are not checked in).
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";

rmSync("_site", { recursive: true, force: true });
mkdirSync("_site", { recursive: true });

await build({
  entryPoints: ["web.ts", "scenes.ts"],
  bundle: true,
  outdir: "_site",
  target: "es2020",
  format: "iife",
  minify: true,
  sourcemap: true,
  logLevel: "info",
});

for (const file of ["index.html", "scenes.html", "site.css"]) cpSync(file, `_site/${file}`);

if (existsSync("images")) {
  const pngs = readdirSync("images").filter((f) => f.toLowerCase().endsWith(".png"));
  mkdirSync("_site/images", { recursive: true });
  for (const f of pngs) cpSync(`images/${f}`, `_site/images/${f}`);
  console.log(`Copied ${pngs.length} image(s) from images/`);
}
