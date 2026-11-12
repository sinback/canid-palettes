// Builds the static site into _site/: bundles web.ts and copies index.html.
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

rmSync("_site", { recursive: true, force: true });
mkdirSync("_site", { recursive: true });

await build({
  entryPoints: ["web.ts"],
  bundle: true,
  outfile: "_site/web.js",
  target: "es2020",
  format: "iife",
  minify: true,
  sourcemap: true,
  logLevel: "info",
});

cpSync("index.html", "_site/index.html");
