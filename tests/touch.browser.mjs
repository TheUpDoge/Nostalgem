// Touch screens: a phone held sideways, real touch events. The on-screen buttons, getting around the menu
// and the guide by dragging and with the dock's arrows (held down, they keep going), and a swipe on the
// picture changing channel without the page being pulled down to reload.
//
//   npm install --no-save playwright && node tests/touch.browser.mjs

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
const W = 844;
const H = 390;
const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await ctx.addInitScript(() => {
  window.NostalGemRelayBrokers = [];
  localStorage.setItem("nostalgem:seenVersion", JSON.stringify("999.0.0")); // no What's new page in the way
});
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const cdp = await ctx.newCDPSession(page);

// A finger: down at (x, y), moved by (dx, dy) in steps, then up.
async function drag(x, y, dx, dy, steps) {
  const n = steps || 12;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= n; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (dx * i) / n, y: y + (dy * i) / n }] });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(300);
}
const state = () => page.evaluate(() => window.NP.state());
const menuFocus = () => page.evaluate(() => Number((document.querySelector("#menu .m-item.focus") || { getAttribute: () => -1 }).getAttribute("data-i")));
const guideRow = () => page.evaluate(() => Number((document.querySelector("#guide .focus[data-row]") || { getAttribute: () => -1 }).getAttribute("data-row")));
const box = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height };
}, sel);

await page.goto(base + "?ch=1");
await page.waitForFunction(() => window.NP && window.NP.state().app === "on", null, { timeout: 20000 });
await page.evaluate(() => {
  window.__stillHere = true; // gone if the page reloads
});

// The buttons come up with a touch.
await page.touchscreen.tap(W / 2, H / 3);
await page.waitForTimeout(400);
check(await page.isVisible("#touch .t-rocker") && (await page.isVisible("#touch .t-dock:not(.t-navdock)")), "a touch brings up the CH rocker and the dock");

// The menu: the dock turns into arrows, OK and BACK, and the menu ends above it.
await page.click('#touch [data-act="menu"]');
await page.waitForTimeout(400);
check((await state()).overlay === "menu" && (await page.isVisible("#touch .t-navdock")) && !(await page.isVisible("#touch .t-rocker")), "MENU opens the menu, and the dock becomes ▲ ▼ ◀ ▶ OK BACK");
const list = await box("#menu .m-list");
const dock = await box("#touch .t-navdock");
check(list && dock && list.bottom <= dock.top + 1, `…the menu's list ends above the dock (list bottom ${list && Math.round(list.bottom)}, dock top ${dock && Math.round(dock.top)})`);
const f0 = await menuFocus();
const lb = await box("#menu .m-list");
await drag(lb.left + lb.w / 2, lb.bottom - 20, 0, -(lb.h - 60));
const f1 = await menuFocus();
check(f1 > f0 + 2, `dragging the menu up moves down the list (row ${f0} → ${f1})`);
await drag(lb.left + lb.w / 2, lb.top + 30, 0, lb.h - 60);
check((await menuFocus()) < f1, `…and dragging it down moves back up (row ${f1} → ${await menuFocus()})`);
const f2 = await menuFocus();
await page.tap('#touch .t-navdock [data-act="down"]');
await page.waitForTimeout(200);
check((await menuFocus()) > f2, `▼ on the dock moves down the menu (row ${f2} → ${await menuFocus()})`);
// Hold ▼: it keeps going.
const f3 = await menuFocus();
const down = await box('#touch .t-navdock [data-act="down"]');
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: down.left + down.w / 2, y: down.top + down.h / 2 }] });
await page.waitForTimeout(1100);
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await page.waitForTimeout(300);
check((await menuFocus()) >= f3 + 4, `holding ▼ keeps moving (row ${f3} → ${await menuFocus()})`);
await page.waitForTimeout(400);
const f4 = await menuFocus();
check(f4 === (await menuFocus()), "…and stops when let go");
// A tap on a row picks it.
await page.tap('#touch .t-navdock [data-act="back"]');
await page.waitForTimeout(300);
check((await state()).overlay === "", "BACK closes the menu");
await page.waitForTimeout(200);
check(await page.isVisible("#touch .t-rocker"), "…and the rocker and dock are back");

// The guide: drag through channels and time; tap a program to watch it.
await page.click('#touch [data-act="guide"]');
await page.waitForTimeout(500);
check((await state()).overlay === "guide", "GUIDE opens the guide");
const rows = await box("#guide .g-rows");
const gd = await box("#touch .t-navdock");
check(rows && gd && rows.bottom <= gd.top + 1, `…its rows end above the dock (rows bottom ${rows && Math.round(rows.bottom)}, dock top ${gd && Math.round(gd.top)})`);
const r0 = await guideRow();
await drag(rows.left + rows.w * 0.6, rows.bottom - 10, 0, -(rows.h - 30));
const r1 = await guideRow();
check(r1 > r0, `dragging the guide up moves down the channels (row ${r0} → ${r1})`);
await page.tap('#touch .t-navdock [data-act="up"]');
await page.waitForTimeout(250);
check((await guideRow()) === r1 - 1, `▲ on the dock moves up a channel (row ${r1} → ${await guideRow()})`);
const before = (await state()).label;
const cell = await box("#guide .g-row:nth-child(2) [data-row]:not(.g-ch)");
if (cell) await page.touchscreen.tap(cell.left + 10, cell.top + cell.h / 2);
await page.waitForTimeout(800);
st = await state();
check(st.overlay === "" && st.label !== before, `tapping a program in the guide tunes it (${before} → ${st.label})`);

// A swipe on the picture changes channel, and doesn't reload the page.
await page.waitForTimeout(5600); // the buttons tuck away
const from = (await state()).channel;
await drag(W / 2, H * 0.75, 0, -H * 0.5, 8);
await page.waitForTimeout(900);
const after = (await state()).channel;
check(after !== from, `a swipe up on the picture changes channel (CH ${from} → ${after})`);
await drag(W / 2, H * 0.2, 0, H * 0.6, 8);
await page.waitForTimeout(900);
check((await page.evaluate(() => window.__stillHere === true)) && (await state()).channel === from, `a swipe down goes back (CH ${await page.evaluate(() => window.NP.state().channel)}), and the page wasn't reloaded`);
check(await page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY === "none"), "the page can't be pulled down to reload");

// A first start gets a welcome; a TV that last saw 1.6.0 gets what's new since; both show the version.
for (const [label, seen, re] of [
  ["a first start", null, /Welcome to NostalGem/],
  ["after an update from 1.6.0", "1.6.0", /What's new in NostalGem[\s\S]*v1\.7\.0/],
]) {
  const c2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await c2.addInitScript((seenV) => {
    window.NostalGemRelayBrokers = [];
    if (seenV) {
      localStorage.setItem("nostalgem:settings", JSON.stringify({}));
      localStorage.setItem("nostalgem:seenVersion", JSON.stringify(seenV));
    }
  }, seen);
  await c2.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const p2 = await c2.newPage();
  await p2.goto(base + "?ch=1");
  await p2.waitForFunction(() => window.NP && window.NP.state().overlay === "dialog", null, { timeout: 8000 }).catch(() => {});
  const text = (await p2.textContent("#dialog")) || "";
  const version = await p2.evaluate(() => window.NP.version);
  check(re.test(text) && text.includes("Version " + version), `${label}: ${re.test(text) ? "the page" : "no page"}, with the version (${text.replace(/\s+/g, " ").slice(0, 90)})`);
  await p2.keyboard.press("Enter");
  await p2.waitForTimeout(300);
  check((await p2.evaluate(() => JSON.parse(localStorage.getItem("nostalgem:seenVersion")))) === version, `…and after it's closed, it won't show again until the next version`);
  await c2.close();
}

check(!errors.length, "no page errors " + errors.join(" | "));
await browser.close();
site.close();
console.log(failures ? failures + " check(s) failed" : "TOUCH SCREENS: ALL GOOD");
process.exit(failures ? 1 : 0);
var st;
