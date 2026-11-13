import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// The page's prose is generated from the site:begin / site:end regions of README.md
// (scripts/site-content.mjs). These tests check that the generated page matches the README
// and that the build fails loudly when the README or template is damaged.

const README = readFileSync("README.md", "utf8");

/** Independent of the build script on purpose: a plain regex over the README. */
const regions = [...README.matchAll(/<!--\s*site:begin\s*-->([\s\S]*?)<!--\s*site:end\s*-->/g)].map((m) => m[1]);
const siteMarkdown = regions.join("\n");
const readmeOnly = README.replace(/<!--\s*site:begin\s*-->[\s\S]*?<!--\s*site:end\s*-->/g, "");

const headings = [...siteMarkdown.matchAll(/^## (.+)$/gm)].map((m) => m[1].replace(/`/g, ""));

test("the README has at least one site region with headings", () => {
  expect(regions.length).toBeGreaterThan(0);
  expect(headings.length).toBeGreaterThan(0);
});

test("every heading in the README's site regions appears on the page, in order, with a GitHub-style id", async ({ page }) => {
  await page.goto("/");
  const onPage = await page.locator(".notes h2").evaluateAll((els) =>
    els.map((el) => ({ text: (el as HTMLElement).innerText.trim(), id: el.id }))
  );
  expect(onPage.map((h) => h.text)).toEqual(headings);
  expect(onPage.map((h) => h.id)).toEqual(headings.map((h) => h.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-")));
});

test("deep links to a heading id scroll to that section", async ({ page }) => {
  await page.goto("/#about-the-coolors-command");
  await expect(page.locator("#about-the-coolors-command")).toBeInViewport();
});

test("README-only content is not on the page", async ({ page }) => {
  await page.goto("/");
  const notes = await page.locator(".notes").innerText();
  // Section headings and distinctive lines that live outside the markers.
  for (const heading of [...readmeOnly.matchAll(/^## (.+)$/gm)].map((m) => m[1].replace(/`/g, ""))) {
    expect(notes, `README-only section "${heading}"`).not.toContain(heading);
  }
  for (const text of ["npm install", "npx ts-node", "Project layout", "Importing as a module"]) {
    expect(notes, text).not.toContain(text);
  }
});

test("markdown syntax and build markers do not leak into the page", async ({ page }) => {
  await page.goto("/");
  const notes = await page.locator(".notes").innerText();
  for (const leak of ["**", "`", "<!--", "site:begin", "site:end", "](http"]) {
    expect(notes, leak).not.toContain(leak);
  }
  expect(await page.content()).not.toContain("site:content"); // the template placeholder was replaced
});

test("external links open in a new tab safely; inline code and bold render as elements", async ({ page }) => {
  await page.goto("/");
  const link = page.locator(".notes a[href^='https://coolors.co']");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.locator(".notes strong code", { hasText: "mode rat" })).toHaveCount(1);
  await expect(page.locator(".notes h2 code", { hasText: "coolors" })).toHaveCount(1);
});

test("the page still ends with the project link, after the README content", async ({ page }) => {
  await page.goto("/");
  const last = page.locator(".notes > *").last();
  await expect(last).toContainText("same REPL as the command-line tool");
  await expect(last.getByRole("link", { name: "Source and CLI on GitHub" })).toHaveAttribute(
    "href",
    "https://github.com/sinback/canid-palettes"
  );
});

// ── The build fails loudly on a damaged README or template ──────────────────────────────────

const TEMPLATE_OK = "<main><section class='notes'><!-- site:content --></section></main>";

function build(name: string, files: { readme?: string; template?: string }) {
  const dir = join(test.info().outputPath(), name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "README.md"), files.readme ?? "");
  writeFileSync(join(dir, "template.html"), files.template ?? TEMPLATE_OK);
  const res = spawnSync(
    "node",
    ["scripts/build-web.mjs", "--readme", join(dir, "README.md"), "--template", join(dir, "template.html"), "--out", join(dir, "out")],
    { encoding: "utf8" }
  );
  return { ...res, out: join(dir, "out") };
}

test("build succeeds on a minimal README and joins several regions in order", () => {
  const res = build("ok", {
    readme: "intro\n<!-- site:begin -->\n## One\n\nfirst\n<!-- site:end -->\nCLI only\n<!-- site:begin -->\n## Two\n\nsecond\n<!-- site:end -->\n",
  });
  expect(res.status, res.stderr).toBe(0);
  const html = readFileSync(join(res.out, "index.html"), "utf8");
  expect(html).toContain('<h2 id="one">One</h2>');
  expect(html.indexOf('id="one"')).toBeLessThan(html.indexOf('id="two"'));
  expect(html).not.toContain("CLI only");
  expect(html).not.toContain("intro");
});

test("build fails when the README has no site region", () => {
  const res = build("none", { readme: "# Just a README\n\n## Usage\n" });
  expect(res.status).toBe(1);
  expect(res.stderr).toContain("no <!-- site:begin -->");
});

test("build fails on a site:begin with no site:end", () => {
  const res = build("unclosed", { readme: "<!-- site:begin -->\n## A\n" });
  expect(res.status).toBe(1);
  expect(res.stderr).toMatch(/line 1: site:begin has no matching site:end/);
});

test("build fails on a site:end with no site:begin", () => {
  const res = build("stray-end", { readme: "text\n<!-- site:end -->\n" });
  expect(res.status).toBe(1);
  expect(res.stderr).toMatch(/line 2: site:end without a matching site:begin/);
});

test("build fails on nested site:begin markers", () => {
  const res = build("nested", { readme: "<!-- site:begin -->\n<!-- site:begin -->\n<!-- site:end -->\n" });
  expect(res.status).toBe(1);
  expect(res.stderr).toMatch(/line 2: site:begin inside a region opened on line 1/);
});

test("build fails on duplicate heading ids", () => {
  const res = build("dupe", { readme: "<!-- site:begin -->\n## Same\n\na\n\n## Same\n<!-- site:end -->\n" });
  expect(res.status).toBe(1);
  expect(res.stderr).toContain('Duplicate heading id "same"');
});

test("build fails when the template has no placeholder, or more than one", () => {
  const readme = "<!-- site:begin -->\n## A\n<!-- site:end -->\n";
  const none = build("tpl-none", { readme, template: "<main></main>" });
  expect(none.status).toBe(1);
  expect(none.stderr).toContain("exactly one <!-- site:content --> placeholder (found 0)");
  const two = build("tpl-two", { readme, template: `${TEMPLATE_OK}${TEMPLATE_OK}` });
  expect(two.status).toBe(1);
  expect(two.stderr).toContain("(found 2)");
});

test("a failed build writes no page", () => {
  const res = build("no-output", { readme: "nothing here" });
  expect(res.status).toBe(1);
  expect(() => readFileSync(join(res.out, "index.html"))).toThrow();
});
