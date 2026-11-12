// Station cards in the channel family's look (cards.js, data/cards.json), in the app:
//   a western's station break shows the sundown card with a western kicker and "SHOWDOWN IN" over the count;
//   a horror channel's break shows the moon-and-fog card; the countdown still runs and the next program
//   still starts; a channel whose film is slow to load shows the family's "one moment" card after a moment,
//   and it goes when the picture comes; radio keeps its own panel.
//
//   npm install --no-save playwright && node tests/cards.browser.mjs

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { makeTimeline, slotAt } from "../web/js/schedule.js";
import { parseCards, fill, familyOf } from "../web/js/cards.js";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..", "web");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/json" };
const video = await readFile(join(here, "fixtures", "test.mp4"));
const lineup = JSON.parse(await readFile(join(web, "data", "lineup.json"), "utf8"));
for (const c of lineup.channels) c.offset = 0;
const cards = parseCards(JSON.parse(await readFile(join(web, "data", "cards.json"), "utf8")));
let slowMedia = 0; // ms to hold the film back, for the loading card
const site = createServer(async (q, s) => {
  const path = new URL(q.url, "http://x").pathname;
  if (path === "/__media/test.mp4") {
    if (slowMedia) await new Promise((ok) => setTimeout(ok, slowMedia));
    return s.writeHead(200, { "content-type": "video/mp4", "content-length": video.length }).end(video);
  }
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
const SHOTS = process.env.SHOTS ? join(here, "shots") : "";

let failures = 0;
const check = (ok, what) => {
  console.log((ok ? "  ok   " : "  FAIL ") + what);
  if (!ok) failures++;
};
const errors = [];
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => {
  window.NostalGemRelayBrokers = [];
  localStorage.setItem("nostalgem:seenVersion", JSON.stringify("999.0.0"));
  localStorage.setItem("nostalgem:settings", JSON.stringify({ staticFx: "silent" }));
});
await ctx.route(/^https:\/\/archive\.org\//, (r) => r.fulfill({ status: 302, headers: { location: base + "__media/test.mp4" } }));
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)(?!archive\.org)/, (r) => r.abort());
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
const st = () => page.evaluate(() => window.NP.state());
const card = () => page.evaluate(() => ({ cls: document.getElementById("card").className, hidden: document.getElementById("card").hidden, text: document.getElementById("card").textContent.replace(/\s+/g, " ").trim() }));
// A picture for the record (SHOTS=1): once the boot card and the snow have faded.
const shot = async (name, wait) => {
  if (!SHOTS) return;
  await page.waitForFunction(() => !document.querySelector(".boot:not([hidden])") || getComputedStyle(document.querySelector(".boot")).opacity === "0", null, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(wait || 250);
  await page.screenshot({ path: join(SHOTS, name) });
};
const chan = (slug) => lineup.channels.find((c) => c.slug === slug);
// The moment the first program on a channel ends: its first station break.
const breakOf = (ch) => {
  const slot = slotAt(makeTimeline(ch), Date.parse(lineup.epoch) + 1000);
  return { at: slot.endMs + 1500, slot: slot };
};
const kickers = (ch, slot) => cards[familyOf(ch).id].kickers.map((k) => fill(k, ch, String(ch.number).padStart(2, "0"), "").replace(/\s*\{time\}.*$/, "").split("{")[0].trim());

// ---------- a western's break ----------
let ch = chan("high-noon");
let b = breakOf(ch);
await page.clock.setFixedTime(new Date(b.at));
await page.goto(base + "?ch=1");
await page.waitForFunction(() => window.NP && window.NP.state().mode === "gap", null, { timeout: 15000 }).catch(() => {});
let c = await card();
check((await st()).mode === "gap" && /card-gap/.test(c.cls) && /fam-western/.test(c.cls) && !c.hidden, `CH 01's station break shows the western card (${c.cls})`);
check(await page.isVisible("#card .fscene.fs-western"), "…with the sundown scene behind it");
check(kickers(ch, b.slot).some((k) => k && c.text.includes(k)) || /SUNDOWN|TRAIL|STAGE|RIDING|SADDLE/.test(c.text), "…a western kicker: " + c.text.slice(0, 90));
check(/SHOWDOWN IN/.test(c.text) && (await page.isVisible("#card .card-count")), "…and SHOWDOWN IN over the countdown");
check(c.text.includes(b.slot.next.t.slice(0, 20)), "…naming the next program: " + b.slot.next.t);
await shot("card-western.png");

// ---------- a horror channel's break, with a bumper's break skipped if the clock lands on one ----------
ch = chan("creature-feature");
b = breakOf(ch);
await page.clock.setFixedTime(new Date(b.at));
await page.goto(base + "?ch=7");
await page.waitForFunction(() => window.NP && window.NP.state().mode === "gap", null, { timeout: 15000 }).catch(() => {});
c = await card();
const bumper = /NOSTALGEM|UPDOGE|STATION IDENTIFICATION|PLEASE STAND BY|A WORD FROM OUR SPONSOR|TECHNICAL NOTE|GOOD NIGHT|HOUSE AD|STATION BREAK|DID YOU KNOW|SIGN-OFF/.test(c.text) && !/RISING IN/.test(c.text);
check(/card-gap/.test(c.cls) && /fam-horror/.test(c.cls), `CH 07's break has the horror look (${c.cls})`);
if (bumper) check(await page.isVisible("#card .scene"), "…this break is a house bumper, on the house sunset (one break in three)");
else {
  check((await page.isVisible("#card .fscene.fs-horror")) && /RISING IN/.test(c.text), "…the moon and fog, and RISING IN over the count: " + c.text.slice(0, 80));
}
await shot("card-horror.png");

// The countdown runs and the next program starts (the clock moves on).
const t0 = await page.textContent("#card .card-count");
await page.clock.setFixedTime(new Date(b.at + 3000));
await page.waitForTimeout(1200);
const t1 = await page.textContent("#card .card-count");
check(t0 !== t1, `the countdown runs (${t0} → ${t1})`);
await page.clock.setFixedTime(new Date(b.slot.slotEndMs + 1500));
await page.waitForFunction(() => window.NP.state().mode === "playing", null, { timeout: 15000 }).catch(() => {});
check((await st()).mode === "playing" && (await card()).hidden, "…and the next program starts, card gone");

// ---------- a slow load: the family's "one moment" card, then the picture ----------
slowMedia = 2600;
ch = chan("midnight-noir");
await page.clock.setFixedTime(new Date(Date.parse(lineup.epoch) + 3000));
await page.goto(base + "?ch=6");
await page.waitForFunction(() => window.NP && document.getElementById("card").className.indexOf("card-tuning") >= 0, null, { timeout: 8000 }).catch(() => {});
c = await card();
const lines = cards.noir.loading;
check(/card-tuning/.test(c.cls) && /fam-noir/.test(c.cls) && !c.hidden, `a film slow to load: the channel's own card after a moment (${c.cls})`);
check(lines.some((l) => c.text.includes(l.replace(/\s+/g, " "))) && /CH 06 · MIDNIGHT NOIR/.test(c.text), "…in noir's voice: " + c.text.slice(0, 100));
check(await page.isVisible("#card .fscene.fs-noir .l2"), "…blinds and a shaft of light behind it");
await shot("card-loading-noir.png", 350);
await page.waitForFunction(() => window.NP.state().mode === "playing", null, { timeout: 15000 }).catch(() => {});
// The card stays through its minimum and a short grace after the picture is really up (loadhold.js), then leaves.
await page.waitForFunction(() => window.NP.state().mode === "playing" && document.getElementById("card").hidden, null, { timeout: 12000 }).catch(() => {});
check((await st()).mode === "playing" && (await card()).hidden, "…and it goes when the picture comes");
slowMedia = 0;

// ---------- radio keeps its own panel while it loads ----------
slowMedia = 2600;
await page.goto(base + "?ch=4");
await page.waitForTimeout(1800);
c = await card();
check(!/card-tuning/.test(c.cls) || c.hidden, "a radio channel loading keeps the radio panel, no card (" + c.cls + ")");
slowMedia = 0;

check(!errors.length, "no page errors " + errors.join(" | "));
await browser.close();
site.close();
console.log(failures ? failures + " check(s) failed" : "STATION CARDS: ALL GOOD");
process.exit(failures ? 1 : 0);
