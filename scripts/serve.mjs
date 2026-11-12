// Minimal static file server for _site/ (used by the Playwright tests and `npm run serve`).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = new URL("../_site/", import.meta.url).pathname;
const port = Number(process.env.PORT ?? 4173);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".map": "application/json" };

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  if (rel.endsWith("/")) rel += "index.html";
  try {
    const body = await readFile(join(root, rel));
    res.writeHead(200, { "content-type": types[extname(rel)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  }
}).listen(port, () => console.log(`Serving _site/ on http://localhost:${port}`));
