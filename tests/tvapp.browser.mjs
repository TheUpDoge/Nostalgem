// The page inside the Android TV app, with a stand-in for the app's side of the conversation: the
// link-out stations open their sites right on the TV when the app can, and say to update it when it can't.
//
//   npm install --no-save playwright && node tests/tvapp.browser.mjs

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const web = join(dirname(fileURLToPath(import.meta.url)), "..", "web");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/json" };
const site = createServer(async (q, s) => {
  const path = new URL(q.url, "http://x").pathname;
  const file = normalize(join(web, path === "/" ? "index.html" : path));
  if (!file.startsWith(web)) return s.writeHead(403).end();
  try {
    s.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(await readFile(file));
  } catch {
    s.writeHead(404).end();
  }
});
await new Promise((ok) => site.listen(0, "127.0.0.1", ok));
const base = "http://127.0.0.1:" + site.address().port + "/";

let failures = 0;
const check = (ok, what) => {
  console.log((ok ? "  ok   " : "  FAIL ") + what);
  if (!ok) failures++;
};

const browser = await chromium.launch();
for (const [label, can] of [
  ["an older TV app", null],
  ["a TV app that can open sites", ["open"]],
]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript((c) => {
    window.NostalGemRelayBrokers = [];
    localStorage.setItem("nostalgem:seenVersion", JSON.stringify("999.0.0"));
    // The app's half: answers "hello" with its version, and what it can do.
    window.NostalGemTV = {
      postMessage(msg) {
        if (msg !== "hello") return;
        const reply = { lan: [], app: c ? "1.0.99" : "1.0.26" };
        if (c) reply.can = c;
        setTimeout(() => window.NostalGemTV.onmessage && window.NostalGemTV.onmessage({ data: JSON.stringify(reply) }), 20);
      },
    };
  }, can);
  let arcadeVisited = false;
  await ctx.route(/^https:\/\/www\.retrogames\.cc\//, (r) => {
    arcadeVisited = true;
    return r.fulfill({ status: 200, contentType: "text/html", body: "<title>RetroGames</title><h1>arcade</h1>" });
  });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|www\.retrogames\.cc)/, (r) => r.abort());
  const page = await ctx.newPage();
  await page.goto(base + "?tv=android&ch=777");
  await page.waitForFunction(() => window.NP && window.NP.state().app === "on", null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const card = (await page.textContent("#card")) || "";
  if (can) {
    check(/play on this TV/.test(card) && /hold Select/.test(card), `${label}: the 777 card says OK plays it on this TV, and how to come back`);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
    check(arcadeVisited && /retrogames\.cc/.test(page.url()), `…OK takes the TV to the arcade (${page.url()})`);
  } else {
    check(/Scan the code/.test(card) && /update the NostalGem TV app/.test(card), `${label}: the 777 card offers the phone, and says to update the app`);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(600);
    check(!arcadeVisited && /update the NostalGem TV app/.test(await page.textContent("#toast")), "…OK stays put and says so: " + (await page.textContent("#toast")));
  }
  await ctx.close();
}

await browser.close();
site.close();
console.log(failures ? failures + " check(s) failed" : "TV APP: ALL GOOD");
process.exit(failures ? 1 : 0);
