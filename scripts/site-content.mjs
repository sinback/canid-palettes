// Turns the web-relevant parts of README.md into HTML for the page.
//
// README.md stays the single source for the prose. Everything between
// `<!-- site:begin -->` and `<!-- site:end -->` is rendered into the page's notes area;
// the rest of the README (setup, CLI usage, project layout, ...) is not.
import { Marked } from "marked";

export const PLACEHOLDER = "<!-- site:content -->";

const MARKER = /<!--\s*site:(begin|end)\s*-->/g;

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

/**
 * Returns the markdown inside every site:begin / site:end region, joined by blank lines.
 * Throws if there are no regions or the markers are unbalanced, so a damaged README fails
 * the build instead of silently shipping a page with no explanations.
 */
export function extractSiteMarkdown(readme) {
  const regions = [];
  let open = null; // { start: index after the begin marker, line }
  for (const m of readme.matchAll(MARKER)) {
    const [marker, kind] = m;
    const line = lineOf(readme, m.index);
    if (kind === "begin") {
      if (open) throw new Error(`README.md line ${line}: site:begin inside a region opened on line ${open.line}`);
      open = { start: m.index + marker.length, line };
    } else {
      if (!open) throw new Error(`README.md line ${line}: site:end without a matching site:begin`);
      regions.push(readme.slice(open.start, m.index).trim());
      open = null;
    }
  }
  if (open) throw new Error(`README.md line ${open.line}: site:begin has no matching site:end`);
  if (regions.length === 0) {
    throw new Error("README.md has no <!-- site:begin --> ... <!-- site:end --> region to render on the page");
  }
  return regions.join("\n\n");
}

/** GitHub-style heading anchor, so the page's deep links match the README's. */
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

const escapeAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Renders markdown to HTML with GitHub-style heading ids and safe external links. */
export function renderSiteHtml(markdown) {
  const seen = new Set();
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading(token) {
        const id = slugify(token.text);
        if (seen.has(id)) throw new Error(`Duplicate heading id "${id}" in the site content`);
        seen.add(id);
        const inner = this.parser.parseInline(token.tokens);
        return `<h${token.depth} id="${id}">${inner}</h${token.depth}>\n`;
      },
      link(token) {
        const inner = this.parser.parseInline(token.tokens);
        const title = token.title ? ` title="${escapeAttr(token.title)}"` : "";
        const external = /^https?:\/\//i.test(token.href) ? ' target="_blank" rel="noopener noreferrer"' : "";
        return `<a href="${escapeAttr(token.href)}"${title}${external}>${inner}</a>`;
      },
    },
  });
  return marked.parse(markdown);
}

/** Replaces the single placeholder in the page template with the rendered content. */
export function injectSiteContent(template, html) {
  const count = template.split(PLACEHOLDER).length - 1;
  if (count !== 1) {
    throw new Error(`Page template must contain exactly one ${PLACEHOLDER} placeholder (found ${count})`);
  }
  return template.replace(PLACEHOLDER, () => html);
}
