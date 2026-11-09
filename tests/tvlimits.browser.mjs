// The TV path's limits on the picture filters (fxcanvas.js TV_LIMITS, main.js lookIsLite), and nothing
// different on a computer:
//   ASCII on a TV: 80 square characters across, a new picture at most 10 times a second; on a computer,
//   128 across with every frame of the film.
//   Stained glass on a TV: a new picture at most 8 times a second.
//   An SVG filter on a TV with Filter quality Auto: its light version, drawn 400 wide; Full still gets the
//   full one. On a computer, Auto keeps the full one.
//   A TV's own browser (a smart-TV user agent, no ?tv=android) counts as a TV too.
//
//   npm install --no-save playwright && node tests/tvlimits.browser.mjs

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..", "web");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/json" };
const video = await readFile(join(here, "fixtures", "test.mp4"));
const lineup = JSON.parse(await readFile(join(web, "data", "lineup.json"), "utf8"));
for (const c of lineup.channels) c.offset = 0;
const site = createServer(async (q, s) => {
  const path = new URL(q.url, "http://x").pathname;
  if (path === "/__media/test.mp4") return s.writeHead(200, { "content-type": "video/mp4", "content-length": video.length }).end(video);
  if (path === "/data/lineup.json") return s.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(lineup));
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
const errors = [];
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });

// One page with a filter on, in the TV app or on a computer. -> its state after a few seconds of the film.
async function watch(tvApp, settings, userAgent) {
  const ctx = await browser.newContext({ viewport: tvApp || userAgent ? { width: 960, height: 540 } : { width: 1920, height: 1080 }, deviceScaleFactor: tvApp || userAgent ? 2 : 1, userAgent: userAgent || undefined });
  await ctx.addInitScript((st) => {
    window.NostalGemRelayBrokers = [];
    localStorage.setItem("nostalgem:seenVersion", JSON.stringify("999.0.0"));
    localStorage.setItem("nostalgem:settings", JSON.stringify(st));
  }, settings);
  await ctx.route(/^https:\/\/archive\.org\//, (r) => r.fulfill({ status: 302, headers: { location: base + "__media/test.mp4" } }));
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)(?!archive\.org)/, (r) => r.abort());
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date(Date.parse(lineup.epoch) + 3000));
  await page.goto(base + "?ch=1" + (tvApp ? "&tv=android" : ""));
  await page.waitForFunction(() => window.NP && window.NP.state().mode === "playing", null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const a = await page.evaluate(() => window.NP.state());
  const t0 = Date.now();
  await page.waitForTimeout(3000);
  const b = await page.evaluate(() => window.NP.state());
  await ctx.close();
  return { tv: b.tv, mode: b.mode, look: b.look, perSecond: (b.look.pictures - a.look.pictures) / ((Date.now() - t0) / 1000) };
}

let r = await watch(true, { look: "ascii" });
check(r.tv && r.mode === "playing" && r.look.canvas === "640x360", `TV app, ASCII: 80 square characters across (canvas ${r.look.canvas}, ${r.mode})`);
check(r.perSecond > 3 && r.perSecond <= 11, `…a new picture at most 10 times a second (${r.perSecond.toFixed(1)}/s)`);
r = await watch(true, { look: "ascii", lookQuality: "light" });
check(r.look.canvas === "512x288", `TV app, ASCII on Filter quality Light: 64 across (canvas ${r.look.canvas})`);
r = await watch(false, { look: "ascii" });
check(!r.tv && r.look.canvas === "1024x576" && r.perSecond > 11, `on a computer, ASCII is as it was: 128 across, every frame of the film (canvas ${r.look.canvas}, ${r.perSecond.toFixed(1)}/s)`);

// (The test film has 15 frames a second, so "up to 15 a second" on a computer comes out at 7–9 here.)
r = await watch(true, { look: "glass" });
check(r.look.canvas === "480x270" && r.perSecond > 3 && r.perSecond <= 8.5, `TV app, stained glass: a new picture at most 8 times a second (${r.perSecond.toFixed(1)}/s, canvas ${r.look.canvas})`);
r = await watch(true, { look: "glass", lookQuality: "light" });
check(r.perSecond > 2 && r.perSecond <= 4.5, `TV app, stained glass on Filter quality Light: 4 a second, fewer panes (${r.perSecond.toFixed(1)}/s)`);
r = await watch(false, { look: "glass" });
check(r.look.canvas === "480x270" && r.perSecond > 6.5, `on a computer, stained glass draws as it did (${r.perSecond.toFixed(1)}/s with a 15 fps film, canvas ${r.look.canvas})`);

r = await watch(true, { look: "pop-red" });
check(r.look.lite && r.look.canvas === "400x225" && !/url\(/.test(r.look.onScreen), `TV app, Sin City red on Auto: its light version, drawn 400 wide, nothing filtering the whole screen (${r.look.canvas}, on screen: ${r.look.onScreen || "none"})`);
r = await watch(true, { look: "pop-red", lookQuality: "full" });
check(!r.look.lite && !r.look.canvas && /url\(/.test(r.look.onScreen), "…Filter quality Full still gets the full one");
r = await watch(false, { look: "pop-red" });
check(!r.look.lite && !r.look.canvas && /url\(/.test(r.look.onScreen), "on a computer, Auto keeps the full Sin City red");
r = await watch(true, { look: "sepia" });
check(!r.look.lite && !r.look.canvas && /sepia/.test(r.look.onScreen), `TV app, a plain CSS filter (Sepia) is left as it is (${r.look.onScreen})`);

r = await watch(false, { look: "ascii" }, "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 WebAppManager");
check(r.tv && r.look.canvas === "640x360", `a TV's own browser (an LG webOS user agent, no ?tv=android) gets the TV limits too (canvas ${r.look.canvas})`);

check(!errors.length, "no page errors " + errors.join(" | "));
await browser.close();
site.close();
console.log(failures ? failures + " check(s) failed" : "TV LIMITS: ALL GOOD");
process.exit(failures ? 1 : 0);
