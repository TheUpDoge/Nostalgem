// The page inside the Android TV app, with a stand-in for the app's side of the conversation: the
// link-out stations open their sites right on the TV when the app can, and say to update it when it can't.
//
// Also: Menu ▸ Load a channel pack ▸ Choose a file opens a file window, or says why it can't and what to
// do instead (an older TV app, a TV with no picker, OK from the phone).
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

// ---------- Menu ▸ Load a channel pack ▸ Choose a file: a file window, or why not ----------
// The TV app opens the TV's file picker for a page's file field (a newer app says "files"). An older app
// doesn't, so the page says so; a TV with no picker at all is told by the app ("nofiles"); and a browser opens
// its file window only for a press on the device itself, so OK from the phone gets the reason, not nothing.
// Autoplay allowed, as in the TV app: the first press here should be the one being tested, not the one that
// starts a picture that's waiting for a press.
const playing = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
async function packPicker(tvApp, can) {
  const c = await playing.newContext({ viewport: { width: 1280, height: 720 } });
  await c.addInitScript((a) => {
    window.NostalGemRelayBrokers = [];
    localStorage.setItem("nostalgem:seenVersion", JSON.stringify("999.0.0"));
    if (!a.tvApp) return;
    window.NostalGemTV = {
      postMessage(msg) {
        if (msg !== "hello") return;
        setTimeout(() => window.NostalGemTV.onmessage && window.NostalGemTV.onmessage({ data: JSON.stringify({ lan: [], app: "1.0.99", can: a.can }) }), 20);
      },
    };
    window.__appSays = (m) => window.NostalGemTV.onmessage({ data: JSON.stringify(m) });
  }, { tvApp: tvApp, can: can || [] });
  await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await c.newPage();
  // Listening for file windows from the start: Playwright only catches one once it has asked the browser to
  // hand them over, which takes a moment after the first listener.
  const choosers = [];
  page.on("filechooser", (fc) => choosers.push(fc));
  await page.goto(base + (tvApp ? "?tv=android&ch=1" : "?ch=1"));
  await page.waitForFunction(() => window.NP && window.NP.state().app === "on", null, { timeout: 15000 });
  await page.waitForTimeout(tvApp ? 600 : 300);
  // To the Choose-a-file row: with this screen's own keys, or (keys false) the way the phone's buttons arrive,
  // which isn't a press on this device. Playwright's own page calls count as one, so that way goes through
  // the browser's debugging channel instead, after the last of them has worn off (about five seconds).
  const cdp = await c.newCDPSession(page);
  const ev = async (expr) => (await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true, userGesture: false })).result.value;
  const choose = async (keys) => {
    const run = keys ? (expr) => page.evaluate(expr) : ev;
    const press = (k) => (keys ? page.keyboard.press({ right: "ArrowRight", down: "ArrowDown", ok: "Enter" }[k]) : ev("window.NP.remote(" + JSON.stringify(k) + ")"));
    const focused = () => run('(document.querySelector("#menu .m-item.focus") || {}).textContent || ""');
    const overlay = () => run("window.NP.state().overlay");
    if (!keys) await page.waitForTimeout(5500);
    for (let i = 0; i < 6 && (await overlay()); i++) await ev('window.NP.remote("back")');
    await press("right");
    for (let i = 0; i < 20 && (await overlay()) !== "menu"; i++) await new Promise((ok) => setTimeout(ok, 100));
    for (let i = 0; i < 80 && !/Load a channel pack/.test(await focused()); i++) await press("down");
    await press("ok");
    await new Promise((ok) => setTimeout(ok, 250));
    const row = await focused();
    const before = choosers.length;
    await press("ok");
    for (let i = 0; i < 20 && choosers.length === before; i++) await new Promise((ok) => setTimeout(ok, 100));
    const chooser = choosers.length > before ? choosers[choosers.length - 1] : null;
    await new Promise((ok) => setTimeout(ok, 250));
    const dialog = await run('window.NP.state().overlay === "dialog" ? document.getElementById("dialog").textContent : ""');
    return { row: row, chooser: chooser, dialog: dialog };
  };
  return { page: page, choose: choose, close: () => c.close() };
}
{
  let b = await packPicker(false);
  let r = await b.choose(true);
  check(/Choose a \.json or \.zip file/.test(r.row) && !!r.chooser && !r.dialog, `in a browser, OK on this screen's own keys opens the file window for a pack (${r.row.trim()})`);
  await b.close();
  b = await packPicker(false);
  r = await b.choose(false);
  const why = r.dialog;
  check(/Choose a \.json or \.zip file/.test(r.row) && !r.chooser && /only for a key or a click on this screen/.test(why) && /Send a pack to the TV/.test(why), "…OK from the phone can't open it, and the TV says why and what to do: " + why.slice(0, 120));
  await b.close();
}
{
  const b = await packPicker(true, ["open", "overlay", "pointer", "box"]);
  const r = await b.choose(true);
  const why = r.dialog;
  check(!r.chooser && /can't open a file window yet/.test(why) && /Send a pack to the TV/.test(why), "an older TV app: no file window, and the page says to update the app or send it from the phone: " + why.slice(0, 110));
  await b.close();
}
{
  const b = await packPicker(true, ["open", "overlay", "pointer", "box", "files"]);
  const r = await b.choose(true);
  check(!!r.chooser && !r.dialog, "a TV app that opens files: the page asks for the file (the app shows the TV's picker)");
  await b.page.evaluate(() => window.__appSays({ t: "nofiles" }));
  await b.page.waitForTimeout(250);
  const why = await b.page.evaluate(() => (window.NP.state().overlay === "dialog" ? document.getElementById("dialog").textContent : ""));
  check(/no app for choosing files/.test(why) && /Paste pack JSON/.test(why), "…and when the TV has no picker at all, the app says so and the page offers the phone and pasting: " + why.slice(0, 100));
  await b.page.locator("#dialog .d-btn", { hasText: "Paste pack JSON" }).first().click();
  await b.page.waitForTimeout(250);
  check(/Paste pack JSON/.test(await b.page.textContent("#dialog")) && (await b.page.isVisible("#dialog textarea, #dialog input")), "…Paste pack JSON there opens the paste box");
  await b.close();
}

await playing.close();
await browser.close();
site.close();
console.log(failures ? failures + " check(s) failed" : "TV APP: ALL GOOD");
process.exit(failures ? 1 : 0);
