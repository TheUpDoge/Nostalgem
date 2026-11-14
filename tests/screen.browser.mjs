// The set's shape (Menu ▸ Screen shape): 4:3 for an old CRT TV. On a widescreen, the set becomes a 4:3 box in
// the middle, black at the sides; the picture, the guide, menus, dialogs, the banner and the canvas filters all
// stay inside it, nothing cut off and nothing stretched; it's remembered; Widescreen puts it back. On a screen
// that's already 4:3, nothing changes.
// The start-up cards (the crystal CRT title card, and the treasure chest with ?boot=treasure) and the Video
// Club's rows keep to the box too.
// In the TV app, the app draws the phone's pointer and opens the link-out stations' sites in a view of its
// own, so the page tells it the shape (a stand-in for the app's side here): at start-up, when the setting
// changes, and again after a restart. An older app, which doesn't say "box", is told nothing.
//
//   npm install --no-save playwright && node tests/screen.browser.mjs

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
});
await ctx.route(/^https:\/\/archive\.org\//, (r) => {
  const u = new URL(r.request().url());
  if (u.pathname.startsWith("/download/")) return r.fulfill({ status: 302, headers: { location: base + "__media/test.mp4" } });
  return r.fulfill({ status: 404, body: "" });
});
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)(?!archive\.org)/, (r) => r.abort());
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
await page.clock.setFixedTime(new Date(Date.parse(lineup.epoch) + 3000));
const st = () => page.evaluate(() => window.NP.state());
const rect = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right), b: Math.round(r.bottom) };
}, sel);
// Everything that shows (boxes with a size), inside the set: none of it past the set's edges.
// across: only left and right (rows of a list that scrolls go on below the fold, as they should).
const outside = (sel, across) => page.evaluate((a) => {
  const tv = document.getElementById("tv").getBoundingClientRect();
  const out = [];
  document.querySelectorAll(a.sel).forEach((el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(el).visibility === "hidden") return;
    const wide = r.left < tv.left - 1 || r.right > tv.right + 1;
    const tall = r.top < tv.top - 1 || r.bottom > tv.bottom + 1;
    if (wide || (!a.across && tall)) out.push((el.className || el.tagName) + " " + Math.round(r.left) + "→" + Math.round(r.right) + " " + Math.round(r.top) + "↓" + Math.round(r.bottom));
  });
  return out;
}, { sel: sel, across: !!across });
const menuTo = async (label) => {
  for (let i = 0; i < 6 && (await st()).overlay; i++) await page.keyboard.press("Escape");
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => window.NP.state().overlay === "menu", null, { timeout: 5000 }).catch(() => {});
  await page.locator("#menu .m-item", { hasText: label }).first().click();
  await page.waitForTimeout(300);
};

await page.goto(base + "?ch=1");
await page.waitForFunction(() => window.NP && window.NP.state().app === "on", null, { timeout: 15000 });
await page.waitForFunction(() => window.NP.state().mode === "playing", null, { timeout: 15000 }).catch(() => {});
let tv = await rect("#tv");
check(tv.w === 1280 && tv.h === 720, `widescreen to start with: the set fills the screen (${tv.w}×${tv.h})`);

// Menu ▸ Screen shape ▸ 4:3
await menuTo("Screen shape");
check(/Screen shape\s*‹?\s*4:3 for old CRT TVs/.test(await page.textContent("#menu")), "Menu ▸ 📺 Screen shape says it plainly: 4:3 for old CRT TVs");
tv = await rect("#tv");
check(tv.w === 960 && tv.h === 720 && tv.x === 160, `4:3: the set is a 960×720 box in the middle of the 1280×720 screen (${tv.w}×${tv.h} at ${tv.x})`);
const bars = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
check(/rgb\(0, 0, 0\)/.test(bars), "…black at the sides (" + bars + ")");
check(!(await outside("#menu, #osd, #toast")).length && !(await outside("#menu .m-item", true)).length, "…the menu is inside it: " + (await outside("#menu, #osd, #toast")).concat(await outside("#menu .m-item", true)).slice(0, 3).join(", "));
if (SHOTS) await page.screenshot({ path: join(SHOTS, "4x3-menu.png") });
for (let i = 0; i < 6 && (await st()).overlay; i++) await page.keyboard.press("Escape");

// The picture: fit inside the box, not stretched.
const vid = await page.evaluate(() => {
  const v = document.getElementById("screen");
  const r = v.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), vw: v.videoWidth, vh: v.videoHeight, fit: getComputedStyle(v).objectFit };
});
check(vid.w === 960 && vid.h === 720 && vid.x === 160 && vid.fit === "contain", `the picture takes the box and keeps its own shape (${vid.w}×${vid.h}, object-fit ${vid.fit}, a ${vid.vw}×${vid.vh} film)`);

// The banner, the guide and a dialog stay inside.
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
check(!(await outside("#banner, #banner *")).length, "the banner is inside the box: " + (await outside("#banner, #banner *")).slice(0, 3).join(", "));
await page.keyboard.press("g");
await page.waitForFunction(() => window.NP.state().overlay === "guide", null, { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(300);
check(!(await outside("#guide, #guide .g-row, #guide .g-ch, #guide .g-cell")).length, "the guide is inside the box: " + (await outside("#guide, #guide .g-row, #guide .g-ch, #guide .g-cell")).slice(0, 3).join(", "));
if (SHOTS) await page.screenshot({ path: join(SHOTS, "4x3-guide.png") });
await page.keyboard.press("Escape");
await menuTo("Find a show");
check((await st()).overlay === "dialog" && !(await outside("#dialog .d-box, #dialog .d-box *")).length, "a dialog is inside the box: " + (await outside("#dialog .d-box, #dialog .d-box *")).slice(0, 3).join(", "));
await page.keyboard.press("Escape");

// A canvas filter is drawn again for the box's shape.
// V steps through the filters to ASCII, drawn on a canvas with as many rows as the shape needs.
for (let i = 0; i < 40; i++) {
  const look = (await st()).look.id;
  if (look === "ascii") break;
  await page.keyboard.press("v");
  await page.waitForTimeout(60);
}
await page.waitForTimeout(800);
const cv = await page.evaluate(() => {
  const c = document.querySelector("canvas.fxcv");
  const r = c.getBoundingClientRect();
  return { cw: c.width, ch: c.height, x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), hidden: c.hidden };
});
check(!cv.hidden && cv.x === 160 && cv.w === 960 && cv.h === 720 && Math.abs(cv.ch / cv.cw - 0.75) < 0.02, `the ASCII filter is drawn for a 4:3 picture inside the box (canvas ${cv.cw}×${cv.ch}, shown ${cv.w}×${cv.h} at ${cv.x})`);
if (SHOTS) await page.screenshot({ path: join(SHOTS, "4x3-ascii.png") });

// Remembered, and Widescreen puts it back.
await page.reload();
await page.waitForFunction(() => window.NP && window.NP.state().app === "on", null, { timeout: 15000 });
tv = await rect("#tv");
check(tv.w === 960 && tv.x === 160, `4:3 is remembered after a restart (${tv.w} at ${tv.x})`);
await menuTo("Screen shape");
tv = await rect("#tv");
check(tv.w === 1280 && tv.x === 0, `Widescreen puts the set back across the whole screen (${tv.w})`);
const cv2 = await page.evaluate(() => {
  const c = document.querySelector("canvas.fxcv");
  return { cw: c.width, ch: c.height };
});
check(Math.abs(cv2.ch / cv2.cw - 9 / 16) < 0.02, `…and the filter is drawn for 16:9 again (${cv2.cw}×${cv2.ch})`);
await menuTo("Screen shape"); // 4:3 again, for the next screen

// A screen that's already 4:3 (an old TV's own resolution): nothing to change.
await page.setViewportSize({ width: 1024, height: 768 });
await page.waitForTimeout(400);
tv = await rect("#tv");
check(tv.w === 1024 && tv.h === 768 && tv.x === 0, `on a screen that's already 4:3 the set fills it (${tv.w}×${tv.h})`);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
tv = await rect("#tv");
check(tv.w === 390 && tv.x === 0, `…and a phone held upright is left alone (${tv.w})`);

// ---------- the start-up cards and the Video Club, with 4:3 on from the start ----------
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await c.addInitScript(() => {
    window.NostalGemRelayBrokers = [];
    localStorage.setItem("nostalgem:seenVersion", JSON.stringify("999.0.0"));
    localStorage.setItem("nostalgem:settings", JSON.stringify({ shape: "43", staticFx: "silent" }));
  });
  await c.route(/^https:\/\/archive\.org\//, (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.startsWith("/download/")) return r.fulfill({ status: 302, headers: { location: base + "__media/test.mp4" } });
    return r.fulfill({ status: 404, body: "" });
  });
  await c.route(/^https?:\/\/(?!127\.0\.0\.1)(?!archive\.org)/, (r) => r.abort());
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push("4:3 from the start: " + e.message));
  await p.clock.setFixedTime(new Date(Date.parse(lineup.epoch) + 3000));
  // Everything showing under sel: how many pieces, and any that reach past the set's sides.
  const past = (sel) =>
    p.evaluate((q) => {
      const tv = document.getElementById("tv").getBoundingClientRect();
      const out = [];
      let n = 0;
      document.querySelectorAll(q).forEach((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (!r.width || !r.height || cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) return;
        n++;
        if (r.left < tv.left - 1 || r.right > tv.right + 1) out.push((el.className || el.tagName) + " " + Math.round(r.left) + "→" + Math.round(r.right));
      });
      return { n: n, out: out.slice(0, 4), box: Math.round(tv.left) + "–" + Math.round(tv.right) };
    }, sel);
  await p.goto(base + "?ch=1");
  await p.waitForTimeout(1500);
  let b = await past("#boot, #boot *");
  check(b.box === "160–1120" && b.n > 5 && !b.out.length, `with 4:3 on, the start-up card keeps to the box (${b.n} pieces showing, box ${b.box}) ${b.out.join(", ")}`);
  // The three titles, all up and standing still (as with reduced motion: the moving card swells a line
  // for a moment as its colors lock, which says nothing about where it sits).
  await p.emulateMedia({ reducedMotion: "reduce" });
  await p.goto(base + "?ch=1");
  await p.waitForTimeout(700);
  b = await past("#boot, #boot *");
  const lines = await p.evaluate(() => (document.getElementById("boot").textContent || "").replace(/\s+/g, " "));
  check(/NOSTALGEM/.test(lines) && /A Blast From The Past/.test(lines) && b.n > 5 && !b.out.length, `…its three titles too, standing still (${b.n} pieces) ${b.out.join(", ")}`);
  await p.emulateMedia({ reducedMotion: "no-preference" });
  await p.goto(base + "?ch=1&boot=treasure");
  await p.waitForTimeout(2200);
  b = await past("#boot, #boot *");
  check((await p.evaluate(() => document.getElementById("boot").classList.contains("boot-treasure"))) && b.n > 20 && !b.out.length, `…and so does the treasure-chest start-up, ?boot=treasure (${b.n} pieces showing) ${b.out.join(", ")}`);
  if (SHOTS) await p.screenshot({ path: join(SHOTS, "4x3-boot-treasure.png") });
  await p.waitForFunction(() => window.NP && window.NP.state().app === "on" && !window.NP.state().turnOn, null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(600);
  await p.keyboard.press("ArrowRight");
  await p.waitForFunction(() => window.NP.state().overlay === "menu", null, { timeout: 5000 }).catch(() => {});
  await p.locator("#menu .m-item", { hasText: "Video Club" }).first().click();
  await p.waitForTimeout(400);
  b = await past("#menu, #menu *");
  check(/Western Row/.test(await p.textContent("#menu")) && !b.out.length, `…and the Video Club's rows (${b.n} pieces showing) ${b.out.join(", ")}`);
  if (SHOTS) await p.screenshot({ path: join(SHOTS, "4x3-club.png") });
  await c.close();
}

// ---------- in the TV app: the page tells the app the shape ----------
// can: what the app says it can do. -> the page, and what it has sent the app since the last look.
async function tvApp(can, settings) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await c.addInitScript(
    (a) => {
      window.NostalGemRelayBrokers = [];
      localStorage.setItem("nostalgem:seenVersion", JSON.stringify("999.0.0"));
      if (a.settings && !localStorage.getItem("nostalgem:settings")) localStorage.setItem("nostalgem:settings", JSON.stringify(a.settings));
      window.__toApp = [];
      window.NostalGemTV = {
        postMessage(msg) {
          if (msg === "hello") {
            setTimeout(() => window.NostalGemTV.onmessage && window.NostalGemTV.onmessage({ data: JSON.stringify({ lan: [], app: "1.0.99", can: a.can }) }), 20);
            return;
          }
          window.__toApp.push(JSON.parse(msg));
        },
      };
    },
    { can: can, settings: settings || null }
  );
  await c.route(/^https:\/\/archive\.org\//, (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.startsWith("/download/")) return r.fulfill({ status: 302, headers: { location: base + "__media/test.mp4" } });
    return r.fulfill({ status: 404, body: "" });
  });
  await c.route(/^https?:\/\/(?!127\.0\.0\.1)(?!archive\.org)/, (r) => r.abort());
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push("TV app: " + e.message));
  await p.clock.setFixedTime(new Date(Date.parse(lineup.epoch) + 3000));
  const start = async () => {
    await p.waitForFunction(() => window.NP && window.NP.state().app === "on" && window.NP.state().tvApp, null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(300);
  };
  await p.goto(base + "?tv=android&ch=1");
  await start();
  const sent = async () => (await p.evaluate(() => window.__toApp.splice(0))).filter((m) => m.t === "shape").map((m) => m.s).join(",");
  return { page: p, start: start, sent: sent, close: () => c.close() };
}
{
  const app = await tvApp(["open", "overlay", "pointer", "box"]);
  let told = await app.sent();
  check(told === "wide", `in the TV app, the page tells the app the screen's shape at start-up (${told || "nothing"})`);
  // Menu ▸ Screen shape ▸ 4:3, with the page's own keys
  await app.page.keyboard.press("ArrowRight");
  await app.page.waitForFunction(() => window.NP.state().overlay === "menu", null, { timeout: 5000 }).catch(() => {});
  await app.page.locator("#menu .m-item", { hasText: "Screen shape" }).first().click();
  await app.page.waitForTimeout(300);
  told = await app.sent();
  const boxed = await app.page.evaluate(() => Math.round(document.getElementById("tv").getBoundingClientRect().width));
  check(told === "43" && boxed === 960, `…and when the setting changes to 4:3, so the app's pointer and the link-out sites keep to the box (${told || "nothing"}; the set is ${boxed} wide)`);
  await app.page.reload();
  await app.start();
  told = await app.sent();
  check(told === "43", `…and again after a restart, when the app has forgotten (${told || "nothing"})`);
  await app.close();

  const old = await tvApp(["open", "overlay", "pointer"], { shape: "43" });
  told = await old.sent();
  const oldBox = await old.page.evaluate(() => Math.round(document.getElementById("tv").getBoundingClientRect().width));
  check(told === "" && oldBox === 960, `an older TV app, which doesn't keep to the box, is told nothing; the page is still in its box (${told || "nothing"}; ${oldBox} wide)`);
  await old.close();
}

check(!errors.length, "no page errors " + errors.join(" | "));
await browser.close();
site.close();
console.log(failures ? failures + " check(s) failed" : "SCREEN SHAPE: ALL GOOD");
process.exit(failures ? 1 : 0);
