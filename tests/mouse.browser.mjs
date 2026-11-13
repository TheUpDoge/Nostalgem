// The phone remote's Mouse page, and channel packs sent from the phone (pointer.js, phone.js, link.js).
//
//   In a browser (the web path): the TV page draws the pointer itself. The phone's trackpad moves it, a tap
//   clicks what's under it (a menu row), keys reach the page (Enter in a dialog, Escape), typing goes into
//   the TV's text field (corrections too), and two fingers move through the guide. With Screen shape 4:3,
//   the pointer keeps to the box.
//   In the TV app (a stand-in for MainActivity's side): the page hands the same messages to the app, which
//   draws and presses itself. A link-out station opens over the page; the phone's arrows go to the site,
//   its BACK steps back, CH comes home and changes channel, and the app's "home" brings the program back.
//   Packs: a .zip with two packs and a broken one, picked on the phone, goes to the TV, which asks "Load
//   these packs?" with the broken one left out; the phone says so too, OK loads them, and the phone hears
//   what went on the air.
//   Through the relay (no WebRTC at all, a local broker): the pointer, a key and a pack get through too.
//
//   npm install --no-save playwright && node tests/mouse.browser.mjs

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { makeZip } from "./fixtures/make-zip.mjs";
import { startBroker } from "./fixtures/mqtt-broker.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..", "web");
const fixtures = join(here, "fixtures");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/json" };
const video = await readFile(join(fixtures, "test.mp4"));
const site = createServer(async (q, s) => {
  const path = new URL(q.url, "http://x").pathname;
  if (path === "/__media/test.mp4") return s.writeHead(200, { "content-type": "video/mp4", "content-length": video.length }).end(video);
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
const watch = (who, p) => p.on("pageerror", (e) => errors.push(who + ": " + e.message));

// The Archive, for the packs' channels: two test items.
const ITEMS = { test_mouse_a: "Mouse Film A", test_mouse_b: "Mouse Film B" };
async function archive(r) {
  const url = new URL(r.request().url());
  if (url.pathname.startsWith("/download/")) return r.fulfill({ status: 302, headers: { location: base + "__media/test.mp4" } });
  const id = url.pathname.replace(/^\/metadata\//, "");
  if (ITEMS[id]) {
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ metadata: { identifier: id, title: ITEMS[id], year: "1950" }, files: [{ name: id + ".mp4", format: "h.264", source: "original", length: "3600" }] }),
    });
  }
  return r.fulfill({ status: 404, body: "" });
}
const pack = (name, number, item) => JSON.stringify({ pack: name, version: 1, channels: [{ name: name, number: number, sources: [{ items: [item] }] }] });

async function setup(ctx, code, extra) {
  await ctx.addInitScript(
    (a) => {
      window.NostalGemRelayBrokers = a.brokers || [];
      localStorage.setItem("nostalgem:seenVersion", JSON.stringify("999.0.0"));
      localStorage.setItem("nostalgem:settings", JSON.stringify(Object.assign({ phone: true }, a.settings || {})));
      localStorage.setItem("nostalgem:phoneCode", JSON.stringify(a.code));
      if (a.noRtc) {
        window.RTCPeerConnection = undefined;
        window.webkitRTCPeerConnection = undefined;
      }
    },
    Object.assign({ code: code }, extra || {})
  );
  await ctx.route(/^https:\/\/archive\.org\//, archive);
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)(?!archive\.org)/, (r) => r.abort());
}

async function pair(tv, ph, tvUrl, code, timeout) {
  await tv.goto(base + tvUrl);
  await tv.waitForFunction(() => window.NP && window.NP.state().app === "on" && window.NP.state().phone.status === "ready", null, { timeout: timeout || 15000 }).catch(() => {});
  await ph.goto(base + "remote.html#" + code);
  await ph.waitForFunction(() => window.NGRemote && window.NGRemote.state().status === "connected" && window.NGRemote.state().tv, null, { timeout: timeout || 15000 }).catch(() => {});
  return (await ph.evaluate(() => window.NGRemote.state().status)) === "connected";
}

const browser = await chromium.launch();

// ---------- in a browser: the page's own pointer ----------
{
  const CODE = "MSE234";
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript({ path: join(fixtures, "fake-peer.js") });
  await setup(ctx, CODE);
  const tv = await ctx.newPage();
  const ph = await ctx.newPage();
  await ph.setViewportSize({ width: 390, height: 844 });
  watch("TV", tv);
  watch("phone", ph);
  const st = () => tv.evaluate(() => window.NP.state());
  const send = (m) => ph.evaluate((x) => window.NGRemote.send(x), m);
  check(await pair(tv, ph, "?ch=1", CODE), "the phone pairs with the TV");

  // The trackpad: a drag to the right moves the pointer right; the touch buttons stay away.
  await ph.click('#tabs [data-tab="mouse"]');
  check(await ph.isVisible("#trackpad"), "the phone has a Mouse page with a trackpad");
  const box = await ph.locator("#trackpad").boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await ph.mouse.move(cx - 60, cy);
  await ph.mouse.down();
  for (let i = 1; i <= 10; i++) await ph.mouse.move(cx - 60 + i * 12, cy + i * 3);
  await ph.mouse.up();
  await tv.waitForTimeout(400);
  let s = await st();
  check(s.pointer.visible && s.pointer.x > 640 + 60 && s.pointer.y > 360, `dragging on the trackpad shows the pointer on the TV and moves it right and down (${s.pointer.x}, ${s.pointer.y})`);
  check(await tv.isHidden("#touch"), "…without bringing up the touch buttons");

  // A tap clicks what's under the pointer: Menu ▸ Find a show.
  await send({ t: "key", type: "menu" });
  await tv.waitForFunction(() => window.NP.state().overlay === "menu", null, { timeout: 5000 }).catch(() => {});
  const aim = async (selector, text) => {
    const r = await tv.evaluate(
      (a) => {
        const el = Array.from(document.querySelectorAll(a.selector)).find((e) => !a.text || e.textContent.includes(a.text));
        if (!el) return null;
        el.scrollIntoView({ block: "center" });
        const b = el.getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
      },
      { selector, text }
    );
    if (!r) return false;
    const p = (await st()).pointer;
    await send({ t: "ptr", dx: (r.x - p.x) / 1280, dy: (r.y - p.y) / 1280 });
    await tv.waitForTimeout(150);
    return true;
  };
  check(await aim("#menu .m-item", "Find a show"), "…the pointer goes to Menu ▸ Find a show");
  await ph.locator("#trackpad").tap().catch(async () => {
    await ph.mouse.click(cx, cy);
  });
  await tv.waitForTimeout(500);
  s = await st();
  check(s.overlay === "dialog" && /Find a show/.test(await tv.textContent("#dialog")) && s.pointer.clicks >= 1, `…and a tap on the trackpad clicks it: the Find a show box opens (${s.overlay})`);

  // The keyboard: typing goes into the TV's text field, corrections too.
  await ph.click("#kbdBtn");
  check(await ph.isVisible("#kbdInput"), "⌨ Keyboard drops down a text field on the phone");
  await ph.locator("#kbdInput").pressSequentially("lone rangr", { delay: 20 });
  await tv.waitForTimeout(300);
  const field = () => tv.evaluate(() => (document.querySelector("#dialog input") || {}).value);
  check((await field()) === "lone rangr", `typing on the phone types into the TV's text field ("${await field()}")`);
  await ph.locator("#kbdInput").fill("lone ranger"); // a correction: ⌫ then the new letters
  await tv.waitForTimeout(300);
  check((await field()) === "lone ranger", `…and a correction goes as ⌫ and the new letters ("${await field()}")`);

  // Keys reach the page: Enter (to the Find button, then Find), Escape closes.
  await ph.click('[data-kbd="Enter"]');
  await tv.waitForTimeout(250);
  await ph.click('[data-kbd="Enter"]');
  await tv.waitForTimeout(600);
  s = await st();
  const menuTitle = (await tv.textContent("#menu")) || "";
  check(s.overlay === "menu" && /Find: lone ranger/i.test(menuTitle), `Enter on the phone reaches the TV: the search runs (${s.overlay}: ${menuTitle.slice(0, 40)})`);
  await ph.click('[data-kbd="Escape"]');
  await tv.waitForTimeout(400);
  check((await st()).overlay === "", "…and Esc closes it");

  // Held keys: ▼ held moves down the guide more than once, and lets go.
  await send({ t: "key", type: "guide" });
  await tv.waitForFunction(() => window.NP.state().overlay === "guide", null, { timeout: 5000 }).catch(() => {});
  const guideCh = () => tv.evaluate(() => {
    const c = document.querySelector("#guide .g-row .focus");
    const row = c && c.closest(".g-row");
    return row ? row.querySelector(".g-ch .n").textContent.trim() : "";
  });
  const g0 = await guideCh();
  const down = ph.locator('[data-kbd="ArrowDown"]');
  const db = await down.boundingBox();
  await ph.mouse.move(db.x + db.width / 2, db.y + db.height / 2);
  await ph.mouse.down();
  await ph.waitForTimeout(900);
  await ph.mouse.up();
  await tv.waitForTimeout(300);
  const g1 = await guideCh();
  const held = (await st()).pointer.held;
  check(g1 !== g0 && Number(g1.split("-")[0]) > Number(g0.split("-")[0]) + 1 && !held.length, `holding ▼ on the phone moves down the guide, repeating, then lets go (CH ${g0} → ${g1})`);

  // Two fingers scroll: over the guide, a row at a time.
  await send({ t: "scroll", dx: 0, dy: -0.2 });
  await tv.waitForTimeout(300);
  const g2 = await guideCh();
  check(Number(g2.split("-")[0]) < Number(g1.split("-")[0]), `two fingers up on the phone scroll back up the guide (CH ${g1} → ${g2})`);
  await send({ t: "key", type: "back" });
  await tv.waitForTimeout(300);

  // Pushed against an edge, the pointer stays there: it doesn't jump back to the middle.
  for (let i = 0; i < 2; i++) await send({ t: "ptr", dx: -1, dy: -1 });
  await tv.waitForTimeout(200);
  s = await st();
  check(s.pointer.x === 0 && s.pointer.y === 0, `pushed past the top left corner, the pointer stops there (${s.pointer.x}, ${s.pointer.y})`);
  for (let i = 0; i < 2; i++) await send({ t: "ptr", dx: 1, dy: 1 });
  await tv.waitForTimeout(200);
  s = await st();
  check(s.pointer.x === 1279 && s.pointer.y === 719, `…and past the bottom right, there (${s.pointer.x}, ${s.pointer.y})`);

  // The pointer fades when it's left alone.
  await tv.waitForTimeout(4300);
  check(!(await st()).pointer.visible, "the pointer fades out when it's left alone");

  // ---------- a pack from the phone ----------
  await ph.click('#tabs [data-tab="channels"]');
  const zip = makeZip([
    { name: "packs/mouse-a.json", data: pack("Mouse A", 44, "test_mouse_a") },
    { name: "packs/mouse-b.json", data: pack("Mouse B", 45, "test_mouse_b") },
    { name: "packs/broken.json", data: JSON.stringify({ pack: "Broken", version: 2, channels: [] }) },
  ]);
  const [chooser] = await Promise.all([ph.waitForEvent("filechooser"), ph.click("#packBtn")]);
  check(/\.zip/.test((await chooser.element().getAttribute("accept")) || ""), "the phone's Channels page sends a pack: its file picker takes .json and .zip");
  await chooser.setFiles({ name: "two-packs.zip", mimeType: "application/zip", buffer: Buffer.from(zip) });
  await tv.waitForFunction(() => /Load these packs/.test(document.getElementById("dialog").textContent), null, { timeout: 8000 }).catch(() => {});
  const dlg = (await tv.textContent("#dialog")) || "";
  check(/two-packs\.zip holds 2 packs/.test(dlg) && /Mouse A/.test(dlg) && /Mouse B/.test(dlg) && /Not loaded \(1\)/.test(dlg) && /broken\.json/.test(dlg), "…the TV loads it through its own pack loader: " + dlg.replace(/\s+/g, " ").slice(0, 150));
  await ph.waitForFunction(() => /2 to load, 1 left out/.test(window.NGRemote.state().pack), null, { timeout: 5000 }).catch(() => {});
  let p = await ph.evaluate(() => window.NGRemote.state());
  check(/2 to load, 1 left out/.test(p.pack) && /Left out: packs\/broken\.json: version/.test(p.packList) && /Mouse A — CH 44/.test(p.packList), "…and the phone says what the TV found, the broken one left out: " + p.pack + " · " + p.packList.slice(0, 120));
  await send({ t: "key", type: "ok" });
  await ph.waitForFunction(() => /On the air/.test(window.NGRemote.state().pack), null, { timeout: 15000 }).catch(() => {});
  p = await ph.evaluate(() => window.NGRemote.state());
  s = await st();
  check(/On the air: CH 44 Mouse A, CH 45 Mouse B/.test(p.pack) && s.name === "Mouse A", `OK on the phone loads them, and the phone hears what went on the air (${p.pack.slice(0, 80)})`);
  // One .json, refused: the phone says why.
  const [chooser2] = await Promise.all([ph.waitForEvent("filechooser"), ph.click("#packBtn")]);
  await chooser2.setFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ pack: "Bad", version: 1, channels: [{ name: "Bad", number: 12, sources: [{ q: "collection:x" }] }] })) });
  await ph.waitForFunction(() => /couldn't load/.test(window.NGRemote.state().pack), null, { timeout: 8000 }).catch(() => {});
  p = await ph.evaluate(() => window.NGRemote.state());
  check(/couldn't load bad\.json/.test(p.pack) && /30 to 49/.test(p.packList), "a pack that doesn't check out: the phone says why (" + p.packList.slice(0, 90) + ")");
  check(/won't load/.test(await tv.textContent("#dialog")), "…and so does the TV");
  // The hundreds are open to packs (CH 100–199): one sent from the phone that asks for CH 101 lands there.
  await send({ t: "key", type: "back" });
  await tv.waitForFunction(() => window.NP.state().overlay !== "dialog", null, { timeout: 5000 }).catch(() => {});
  const [chooser3] = await Promise.all([ph.waitForEvent("filechooser"), ph.click("#packBtn")]);
  await chooser3.setFiles({ name: "hundreds.json", mimeType: "application/json", buffer: Buffer.from(pack("Mouse Hundred", 101, "test_mouse_b")) });
  await tv.waitForFunction(() => /Load this pack/.test(document.getElementById("dialog").textContent), null, { timeout: 8000 }).catch(() => {});
  await ph.waitForFunction(() => /Mouse Hundred — CH 101/.test(window.NGRemote.state().packList), null, { timeout: 5000 }).catch(() => {});
  p = await ph.evaluate(() => window.NGRemote.state());
  check(/Mouse Hundred — CH 101/.test(p.packList), "a pack from the phone that asks for CH 101 is offered CH 101: " + p.packList.slice(0, 80));
  await send({ t: "key", type: "ok" });
  await ph.waitForFunction(() => /On the air/.test(window.NGRemote.state().pack), null, { timeout: 15000 }).catch(() => {});
  p = await ph.evaluate(() => window.NGRemote.state());
  s = await st();
  check(/On the air: CH 101 Mouse Hundred/.test(p.pack) && s.channel === 101 && s.label === "101", `…and it goes on the air there (${p.pack.slice(0, 60)}; the TV is on CH ${s.label})`);
  await ctx.close();
}

// ---------- with Screen shape 4:3 (an old CRT TV): the pointer keeps to the box ----------
{
  const CODE = "BXS234";
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript({ path: join(fixtures, "fake-peer.js") });
  await setup(ctx, CODE, { settings: { shape: "43" } });
  const tv = await ctx.newPage();
  const ph = await ctx.newPage();
  watch("TV, 4:3", tv);
  watch("phone", ph);
  const st = () => tv.evaluate(() => window.NP.state());
  const send = (m) => ph.evaluate((x) => window.NGRemote.send(x), m);
  const at = async () => {
    await tv.waitForTimeout(200);
    return (await st()).pointer;
  };
  check(await pair(tv, ph, "?ch=1", CODE), "with 4:3 on, the phone pairs");
  const box = await tv.evaluate(() => {
    const r = document.getElementById("tv").getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right) };
  });
  await send({ t: "ptr", dx: 0, dy: 0 });
  let p = await at();
  check(box.left === 160 && box.right === 1120 && p.visible && p.x === 640 && p.y === 360, `with 4:3 on, the pointer comes up in the middle of the box (${p.x}, ${p.y}; the box is ${box.left}–${box.right})`);
  // All the way left, then all the way right: it stops at the box, not out in the black at the sides,
  // which an old TV doesn't show.
  for (let i = 0; i < 2; i++) await send({ t: "ptr", dx: -1, dy: 0 });
  const left = (await at()).x;
  for (let i = 0; i < 3; i++) await send({ t: "ptr", dx: 1, dy: 0 });
  const right = (await at()).x;
  check(left === box.left && right === box.right - 1, `…and stops at the box's edges, not out in the black at the sides (${left} and ${right})`);
  // The trackpad's reach follows the box: a quarter of the way across is a quarter of the box.
  await send({ t: "ptr", dx: -0.25, dy: 0 });
  p = await at();
  check(p.x === box.right - 1 - 240, `…a quarter of the way back is a quarter of the box (${p.x})`);
  // What it clicks is still what's under it: Menu ▸ Find a show, inside the box.
  await send({ t: "key", type: "menu" });
  await tv.waitForFunction(() => window.NP.state().overlay === "menu", null, { timeout: 5000 }).catch(() => {});
  const row = await tv.evaluate(() => {
    const el = Array.from(document.querySelectorAll("#menu .m-item")).find((e) => e.textContent.includes("Find a show"));
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  p = await at();
  if (row) await send({ t: "ptr", dx: (row.x - p.x) / 960, dy: (row.y - p.y) / 960 });
  await at();
  await send({ t: "click" });
  await tv.waitForFunction(() => window.NP.state().overlay === "dialog", null, { timeout: 5000 }).catch(() => {});
  check(!!row && (await st()).overlay === "dialog" && /Find a show/.test(await tv.textContent("#dialog")), "…and a click lands on what's under it: Menu ▸ Find a show opens");
  await ctx.close();
}

// ---------- in the TV app: the app draws the pointer and presses for real ----------
{
  const CODE = "APP234";
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript({ path: join(fixtures, "fake-peer.js") });
  // The app's half: says what it can do, and keeps what the page hands it.
  await ctx.addInitScript(() => {
    window.__toApp = [];
    window.NostalGemTV = {
      postMessage(msg) {
        if (msg === "hello") {
          setTimeout(() => window.NostalGemTV.onmessage && window.NostalGemTV.onmessage({ data: JSON.stringify({ lan: [], app: "1.0.99", can: ["open", "overlay", "pointer"] }) }), 20);
          return;
        }
        window.__toApp.push(JSON.parse(msg));
      },
    };
    window.__appSays = (m) => window.NostalGemTV.onmessage({ data: JSON.stringify(m) });
  });
  await setup(ctx, CODE);
  await ctx.route(/^https:\/\/www\.retrogames\.cc\//, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>RetroGames</title>" }));
  const tv = await ctx.newPage();
  const ph = await ctx.newPage();
  watch("TV app", tv);
  watch("phone", ph);
  const st = () => tv.evaluate(() => window.NP.state());
  const send = (m) => ph.evaluate((x) => window.NGRemote.send(x), m);
  const toApp = () => tv.evaluate(() => window.__toApp.splice(0));
  check(await pair(tv, ph, "?tv=android&ch=1", CODE), "in the TV app, the phone pairs");
  await ph.click('#tabs [data-tab="mouse"]');
  await ph.waitForTimeout(200);
  check(/link-out stations' sites/.test(await ph.textContent("#mouseWhere")), "…the Mouse page says the pointer reaches the YouTube player and the link-out sites: " + (await ph.textContent("#mouseWhere")).slice(0, 80));
  await toApp();
  await send({ t: "ptr", dx: 0.1, dy: -0.05 });
  await send({ t: "click" });
  await send({ t: "scroll", dx: 0, dy: 0.1 });
  await send({ t: "kbd", key: "z", down: true });
  await send({ t: "kbd", key: "z", down: false });
  await send({ t: "text", s: "hi" });
  await tv.waitForTimeout(400);
  let got = await toApp();
  const kinds = got.map((m) => m.t).join(",");
  check(kinds === "ptr,click,scroll,kbd,kbd,text" && got[0].dx === 0.1 && got[3].key === "z" && got[3].down === true && got[5].s === "hi", "the page hands the phone's pointer, keys and text to the app, in order (" + kinds + ")");
  check(!(await st()).pointer.visible, "…and doesn't draw a pointer of its own");

  // A link-out station opens over the page; the phone's buttons go to the site.
  for (const d of [7, 7, 7]) await send({ t: "key", type: "digit", digit: d });
  await tv.waitForFunction(() => window.NP.state().channel === 777, null, { timeout: 5000 }).catch(() => {});
  await send({ t: "key", type: "ok" });
  await tv.waitForFunction(() => window.NP.state().away, null, { timeout: 5000 }).catch(() => {});
  got = await toApp();
  let s = await st();
  check(got.some((m) => m.t === "open" && m.url === "https://www.retrogames.cc/") && s.away === "RetroGames.cc" && /\/$/.test(tv.url().split("?")[0]), `OK on 777 asks the app to open the arcade over NostalGem; the page stays (${s.away})`);
  await ph.waitForFunction(() => window.NGRemote.state().tv && window.NGRemote.state().tv.away, null, { timeout: 4000 }).catch(() => {});
  check(/RetroGames\.cc/.test(await ph.textContent("#mouseWhere")) && /On the TV now: RetroGames\.cc/.test(await ph.textContent("#now")), "…the phone stays linked and says the arcade is on the TV");
  await send({ t: "key", type: "up" });
  await send({ t: "key", type: "ok" });
  await send({ t: "key", type: "back" });
  await send({ t: "key", type: "mute" });
  await tv.waitForTimeout(300);
  got = await toApp();
  check(JSON.stringify(got) === JSON.stringify([{ t: "kbd", key: "ArrowUp", down: null }, { t: "kbd", key: "Enter", down: null }, { t: "back" }, { t: "mute" }]), "…its ▲ and OK go to the site as keys, BACK steps back, mute mutes it: " + JSON.stringify(got));
  await tv.evaluate(() => window.__appSays({ t: "home" }));
  await tv.waitForTimeout(500);
  s = await st();
  check(!s.away && s.channel === 777, "the app says the site's closed: the page is back on 777");
  await send({ t: "key", type: "ok" });
  await tv.waitForFunction(() => window.NP.state().away, null, { timeout: 5000 }).catch(() => {});
  await toApp();
  await send({ t: "key", type: "chup" });
  await tv.waitForTimeout(800);
  got = await toApp();
  s = await st();
  check(got.some((m) => m.t === "close") && !s.away && s.channel !== 777, `CH ▲ on the phone closes the site and changes channel (CH ${s.label})`);
  await ctx.close();
}

// ---------- through the relay ----------
{
  const CODE = "RWY234";
  const broker = await startBroker();
  const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const phCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  for (const c of [tvCtx, phCtx]) await setup(c, CODE, { brokers: [broker.url], noRtc: true });
  const tv = await tvCtx.newPage();
  const ph = await phCtx.newPage();
  watch("TV (relay)", tv);
  watch("phone (relay)", ph);
  const st = () => tv.evaluate(() => window.NP.state());
  check(await pair(tv, ph, "?ch=1", CODE, 30000), "with no WebRTC, the phone pairs through the relay");
  await ph.click('#tabs [data-tab="mouse"]');
  const box = await ph.locator("#trackpad").boundingBox();
  await ph.mouse.move(box.x + 40, box.y + 40);
  await ph.mouse.down();
  for (let i = 1; i <= 8; i++) await ph.mouse.move(box.x + 40 + i * 15, box.y + 40 + i * 6);
  await ph.mouse.up();
  await tv.waitForTimeout(1200);
  let s = await st();
  check(s.pointer.visible && s.pointer.x > 640, `through the relay, the trackpad moves the TV's pointer (${s.pointer.x}, ${s.pointer.y})`);
  await ph.evaluate(() => window.NGRemote.send({ t: "key", type: "menu" }));
  await tv.waitForTimeout(800);
  await ph.click('[data-kbd="Escape"]');
  await tv.waitForTimeout(1000);
  check((await st()).overlay === "", "…a key from the Mouse page reaches the TV (Esc closes the menu)");
  await ph.click('#tabs [data-tab="channels"]');
  const [chooser] = await Promise.all([ph.waitForEvent("filechooser"), ph.click("#packBtn")]);
  // A pack big enough to go in several pieces.
  const big = JSON.parse(pack("Relay Films", 46, "test_mouse_a"));
  big.channels[0].tagline = "x".repeat(10);
  big.notes = "y".repeat(30000);
  await chooser.setFiles({ name: "relay-films.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(big)) });
  await tv.waitForFunction(() => /Load this pack/.test(document.getElementById("dialog").textContent), null, { timeout: 20000 }).catch(() => {});
  check(/Relay Films/.test(await tv.textContent("#dialog")), "…and a pack sent in several pieces arrives whole: Load this pack?");
  await ph.waitForFunction(() => /1 to load/.test(window.NGRemote.state().pack), null, { timeout: 8000 }).catch(() => {});
  check(/1 to load/.test((await ph.evaluate(() => window.NGRemote.state())).pack), "…and the phone hears it's waiting on the TV");
  const plain = broker.seen.map((b) => b.toString("latin1")).join("\n");
  check(!/Relay Films|"ptr"|"kbd"/.test(plain), "nothing readable went through the broker");
  await tvCtx.close();
  await phCtx.close();
  broker.close();
}

check(!errors.length, "no page errors " + errors.join(" | "));
await browser.close();
site.close();
console.log(failures ? failures + " check(s) failed" : "PHONE MOUSE, KEYS AND PACKS: ALL GOOD");
process.exit(failures ? 1 : 0);
