import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { enter, allPairs } from "./helpers";

// Runs the real CLI and the web page on the same script and checks they agree.
// Both front-ends share repl.ts, so this guards the wiring around it.

const SCRIPT = [
  "e8b840", "d4931f", "#abc", "zzz",
  "mode rat", "e8b840", "ffffff", "000",
  "coolors",
  "mode canid", "5c3b0d", "1c1b17", "coolors",
];

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

function runCli(args: string[], stdin?: string): string {
  const res = spawnSync("node_modules/.bin/ts-node", ["--transpile-only", "canid.ts", ...args], {
    input: stdin,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  expect(res.status, res.stderr).toBe(0);
  return stripAnsi(res.stdout);
}

const parsePairs = (out: string): [string, string][] =>
  [...out.matchAll(/(#[0-9a-f]{6})\s+→\s+(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]);

const parseUrls = (out: string): string[] => out.match(/https:\/\/coolors\.co\/\S+/g) ?? [];

test("CLI REPL and web REPL produce the same colors and coolors URLs", async ({ page }) => {
  const cliOut = runCli([], SCRIPT.join("\n") + "\nquit\n");

  await page.goto("/");
  for (const line of SCRIPT) await enter(page, line);
  const webUrls = await page.locator("#log .line.link a").evaluateAll(
    (els) => els.map((el) => (el as HTMLAnchorElement).href)
  );

  expect(await allPairs(page)).toEqual(parsePairs(cliOut));
  expect(webUrls).toEqual(parseUrls(cliOut));
  expect(webUrls).toHaveLength(2);
});

test("CLI one-shot arguments agree with the web page", async ({ page }) => {
  const cliOut = runCli(["e8b840", "#d4931f", "5c3b0d", "1c1b17"]);

  await page.goto("/");
  await enter(page, "e8b840 #d4931f 5c3b0d 1c1b17");
  await enter(page, "coolors");

  expect(await allPairs(page)).toEqual(parsePairs(cliOut));
  expect(await page.locator("#log .line.link a").innerText()).toBe(parseUrls(cliOut)[0]);
});
