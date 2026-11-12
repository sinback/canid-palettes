// Builds the static site: bundles web.ts, and renders README.md's site regions into index.html.
//
//   node scripts/build-web.mjs [--readme README.md] [--template index.html] [--out _site]
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractSiteMarkdown, injectSiteContent, renderSiteHtml } from "./site-content.mjs";

function option(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = process.argv[i + 1];
  if (!value) throw new Error(`--${name} needs a value`);
  return value;
}

const readmePath = option("readme", "README.md");
const templatePath = option("template", "index.html");
const outDir = option("out", "_site");

try {
  const html = injectSiteContent(
    readFileSync(templatePath, "utf8"),
    renderSiteHtml(extractSiteMarkdown(readFileSync(readmePath, "utf8")))
  );

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "index.html"), html);

  await build({
    entryPoints: ["web.ts"],
    bundle: true,
    outfile: join(outDir, "web.js"),
    target: "es2020",
    format: "iife",
    minify: true,
    sourcemap: true,
    logLevel: "info",
  });
} catch (e) {
  console.error(`build-web: ${e.message}`);
  process.exit(1);
}
