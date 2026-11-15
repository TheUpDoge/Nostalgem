// Browsing a pack list on the TV (packs.js parsePackIndex, main.js browsePacks): with no list set, the pack
// menu says so and offers to set one; with one set, Browse the pack list shows its packs (name, channels,
// programs), and Load this pack fetches the file and loads it through the same "Load this pack?" screen as
// a file. A .zip in the list works too, and a list that can't be had says so.
//
//   npm install --no-save playwright && node tests/packbrowse.browser.mjs

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { makeZip } from "./fixtures/make-zip.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..", "web");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/json" };
const video = await readFile(join(here, "fixtures", "test.mp4"));
// The list and its packs, as a website outside the repo would serve them (made up for the test).
const pack = (name, number, item) => JSON.stringify({ pack: name, version: 1, channels: [{ name: name, number: number, minMinutes: 0, sources: [{ items: [item] }] }] });
const LIST = {
  format: "nostalgem-pack-index/1",
  title: "Test add-ons",
  updated: "2026-11-14",
  packs: [
    { name: "Browse Westerns", file: "browse-westerns.json", channels: [{ number: 44, name: "Browse Westerns" }], programs: 1, about: "Cowboys, from a list." },
    { name: "Browse Bundle", file: "bundle.zip", channels: [{ number: 45, name: "Bundle One" }, { number: 43, name: "Bundle Two" }], programs: 2 },
  ],
};
const FILES = {
  "/list/index.json": JSON.stringify(LIST),
  "/list/browse-westerns.json": pack("Browse Westerns", 44, "test_browse_a"),
  "/list/bundle.zip": Buffer.from(makeZip([{ name: "one.json", data: pack("Bundle One", 45, "test_browse_a") }, { name: "two.json", data: pack("Bundle Two", 43, "test_browse_b") }])),
};
const site = createServer(async (q, s) => {
  const path = new URL(q.url, "http://x").pathname;
  if (path === "/__media/test.mp4") return s.writeHead(200, { "content-type": "video/mp4", "content-length": video.length }).end(video);
  if (FILES[path] != null) return s.writeHead(200, { "content-type": path.endsWith(".zip") ? "application/zip" : "application/json", "access-control-allow-origin": "*" }).end(FILES[path]);
  const file = normalize(join(web, path === "/" ? "index.html" : path));
  if (!file.startsWith(web)) return s.writeHead(403).end();
  let body;
  try {
    body = await readFile(file);
  } catch {
    return s.writeHead(404).end();
  }
  s.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(body);
});
await new Promise((ok) => site.listen(0, "127.0.0.1", ok));
const base = "http://127.0.0.1:" + site.address().port + "/";

let failures = 0;
const check = (ok, what) => {
  console.log((ok ? "  ok   " : "  FAIL ") + what);
  if (!ok) failures++;
};
const errors = [];
const ITEMS = { test_browse_a: "Browse Film A", test_browse_b: "Browse Film B" };

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => {
  window.NostalGemRelayBrokers = [];
  localStorage.setItem("nostalgem:seenVersion", JSON.stringify("999.0.0"));
});
await ctx.route(/^https:\/\/archive\.org\//, (r) => {
  const url = new URL(r.request().url());
  if (url.pathname.startsWith("/download/")) return r.fulfill({ status: 302, headers: { location: base + "__media/test.mp4" } });
  const id = url.pathname.replace(/^\/metadata\//, "");
  if (!ITEMS[id]) return r.fulfill({ status: 404, body: "" });
  return r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ metadata: { identifier: id, title: ITEMS[id], year: "1950" }, files: [{ name: id + ".mp4", format: "h.264", source: "original", length: "12" }] }) });
});
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)(?!archive\.org)/, (r) => r.abort());
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(base + "?ch=1");
await page.waitForFunction(() => window.NP && window.NP.state().app === "on", null, { timeout: 15000 });
await page.waitForTimeout(400);
const st = () => page.evaluate(() => window.NP.state());
const key = async (k, wait) => {
  await page.keyboard.press(k);
  await page.waitForTimeout(wait == null ? 200 : wait);
};
const dialogText = () => page.textContent("#dialog");
const btn = async (re, wait) => {
  await page.locator("#dialog .d-btn", { hasText: re }).first().click();
  await page.waitForTimeout(wait == null ? 500 : wait);
};
const toPacks = async () => {
  for (let i = 0; i < 6 && (await st()).overlay; i++) await key("Escape", 150);
  await key("ArrowRight", 300);
  await page.click('#menu .m-item:has-text("Load a channel pack")');
  await page.waitForTimeout(300);
};

// ---------- no list yet ----------
await toPacks();
let menuText = await page.textContent("#menu");
check(/From the pack list/.test(menuText) && /No pack list set yet/.test(menuText) && /Set the pack list address/.test(menuText) && !/Browse the pack list/.test(menuText), "with no list set, the pack menu says so and offers to set one");
check(/Choose a \.json or \.zip file/.test(menuText) && /Paste pack JSON/.test(menuText), "…and the file and Paste ways in are still there");

// ---------- set one: the list ----------
await page.click('#menu .m-item:has-text("Set the pack list address")');
await page.waitForTimeout(300);
await page.fill("#dialog input", "not an address");
await btn(/Save/, 300);
check(/doesn't look like a web address/.test(await dialogText()), "an address that isn't one is refused");
await page.fill("#dialog input", base + "list/index.json");
await btn(/Save/, 1200);
menuText = await page.textContent("#menu");
check(/Test add-ons/.test(menuText) && /Browse Westerns\s*CH 44 · 1 program/.test(menuText) && /Browse Bundle\s*CH 45, 43 · 2 programs/.test(menuText) && /2 packs · updated 2026-11-14/.test(menuText), "saved, the list opens: its packs with their channels and programs: " + menuText.replace(/\s+/g, " ").slice(0, 140));
check((await st()).overlay === "menu", "…as a page of the menu, scrolled with the remote like the rest");

// ---------- a pack from it ----------
await page.click('#menu .m-item:has-text("Browse Westerns")');
await page.waitForTimeout(300);
let d = await dialogText();
check(/Cowboys, from a list\./.test(d) && /CH 44 · Browse Westerns/.test(d) && /Load this pack/.test(d), "a pack's page says what it is and what it adds");
await btn(/Load this pack/, 1500);
d = await dialogText();
check(/Load this pack\?/.test(d) && /Browse Westerns/.test(d) && /CH 44/.test(d), "Load this pack fetches it and asks the same \"Load this pack?\" as a file: " + d.replace(/\s+/g, " ").slice(0, 100));
await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll("#dialog button")).find((x) => /^Load/.test(x.textContent.trim()));
  if (b) b.click();
});
await page.waitForFunction(() => window.NP.state().channel === 44, null, { timeout: 20000 }).catch(() => {});
let s = await st();
check(s.channel === 44 && s.name === "Browse Westerns", `…and OK puts it on the air (CH ${s.channel} ${s.name})`);

// ---------- a .zip from it, from the menu again (the list is kept for a while) ----------
await toPacks();
menuText = await page.textContent("#menu");
check(/Browse the pack list/.test(menuText) && /Pack list address\s*127\.0\.0\.1/.test(menuText), "with a list set, the pack menu offers it, and shows its address");
await page.click('#menu .m-item:has-text("Browse the pack list")');
await page.waitForTimeout(500);
await page.click('#menu .m-item:has-text("Browse Bundle")');
await page.waitForTimeout(300);
await btn(/Load this pack/, 1500);
d = await dialogText();
check(/Load these packs\?/.test(d) && /Bundle One/.test(d) && /Bundle Two/.test(d), "a .zip in the list loads all its packs the same way: " + d.replace(/\s+/g, " ").slice(0, 100));
await key("Escape");

// ---------- a list that can't be had ----------
await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem("nostalgem:settings") || "{}");
  st.packIndex = location.origin + "/list/missing.json";
  localStorage.setItem("nostalgem:settings", JSON.stringify(st));
});
await page.reload();
await page.waitForFunction(() => window.NP && window.NP.state().app === "on", null, { timeout: 15000 });
await page.waitForTimeout(400);
await toPacks();
await page.click('#menu .m-item:has-text("Browse the pack list")');
await page.waitForTimeout(1200);
check(/Couldn't get the pack list \(HTTP 404\)/.test(await dialogText()), "a list that isn't there: the TV says so, and where to change the address");

check(!errors.length, "no page errors " + errors.join(" | "));
await browser.close();
site.close();
console.log(failures ? failures + " check(s) failed" : "BROWSING A PACK LIST: ALL GOOD");
process.exit(failures ? 1 : 0);
