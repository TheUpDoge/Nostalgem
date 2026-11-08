// Clean cuts in the app (web/js/cuts.js), and the Reading Room's catalog shelves.
//
//   Live channel: a listed scene goes under a full-screen card with the sound cut, and the card lifts after;
//   the program isn't skipped (the clock stays right).
//   Video Club tape: its TV-safe cut is off until the viewer turns it on, so it plays as it is; turned on
//   (on the tape's box), a listed scene is jumped over, with a word on screen.
//   Reading Room: the club's catalog shelves (checked public domain), and the empty manga shelf's note.
//
// The scenes here are TEST VALUES on a 12-second test video. Real lists come only from a viewing pass of
// the Archive's own file; the shipped file has none.
//
//   npm install --no-save playwright && node tests/cuts.browser.mjs

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { makeTimeline } from "../web/js/schedule.js";
import { BBC_CHANNEL } from "../web/js/secrets.js";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..", "web");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/json" };
const video = await readFile(join(here, "fixtures", "test.mp4"));
const lineup = JSON.parse(await readFile(join(web, "data", "lineup.json"), "utf8"));

const site = createServer(async (q, s) => {
  const path = new URL(q.url, "http://x").pathname;
  if (path === "/__media/test.mp4") {
    const m = /bytes=(\d*)-(\d*)/.exec(q.headers.range || "");
    if (!m) return s.writeHead(200, { "content-type": "video/mp4", "content-length": video.length, "accept-ranges": "bytes" }).end(video);
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Math.min(Number(m[2]), video.length - 1) : video.length - 1;
    return s.writeHead(206, { "content-type": "video/mp4", "content-length": end - start + 1, "content-range": `bytes ${start}-${end}/${video.length}`, "accept-ranges": "bytes" }).end(video.subarray(start, end + 1));
  }
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

// Test lists (not real scenes): 069's first film gets a card from 6 s to 9 s; the test tape skips 7–10 s.
const BBC_FIRST = BBC_CHANNEL.items[0];
const TAPE = { id: "test_tape", f: "test_tape.mp4", t: "Test Tape", d: 3600, y: 1950 };
const skipFile = {
  format: "nostalgem-skip-lists/1",
  note: "TEST VALUES for tests/cuts.browser.mjs: not real scenes.",
  lists: [{ item: BBC_FIRST.id, title: BBC_FIRST.t, mode: "card", skips: [{ start: 6, end: 9, reason: "sexual-content", note: "test" }] }],
};
const packLists = [{ item: TAPE.id, file: TAPE.f, title: TAPE.t, mode: "skip", enabled: true, skips: [{ start: 7, end: 10, reason: "sexual-content", note: "test" }] }];
const catalog = {
  catalog: "test",
  version: 1,
  entries: [
    { id: "test_pd_book", title: "A Test Book", author: "Writer, Some, 1850-1900", year: 1890, type: "book" },
    { id: "test_pd_comic", title: "Test Comics #1", author: "Test Comics, Inc.", year: 1941, type: "comic" },
  ],
  gaps: { manga: "No verifiably public-domain manga was found (test note)." },
};

function startOfFirstFilm(ch) {
  const epoch = Date.parse(lineup.epoch);
  const tl = makeTimeline(ch, { gap: lineup.gap, epoch });
  const loops = Math.ceil((Date.now() - epoch) / 1000 / tl.total);
  return epoch + loops * tl.total * 1000 + 3500;
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(
  (a) => {
    window.NostalGemRelayBrokers = [];
    if (!sessionStorage.getItem("seeded")) {
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("nostalgem:seenVersion", JSON.stringify("999.0.0"));
      // A member with the test tape out, and the clean cuts a pack brought for it.
      localStorage.setItem(
        "nostalgem:library",
        JSON.stringify({ card: { name: "Test", number: "NG 0000 0000 0000", issued: 1, terms: 1 }, loans: [Object.assign({ key: a.tape.id + "/" + a.tape.f, ch: "", out: Date.now(), due: Date.now() + 86400000, pos: 0 }, a.tape)], history: [], books: [], marks: {} })
      );
      localStorage.setItem("nostalgem:skipLists", JSON.stringify(a.packLists));
    }
    let shift = a.now - Date.now();
    const real = Date.now;
    Date.now = function () {
      return real() + shift;
    };
    window.__setNow = function (t) {
      shift = t - real();
    };
  },
  { now: startOfFirstFilm(BBC_CHANNEL), tape: TAPE, packLists }
);
await ctx.route(/\/data\/skip-lists\.json$/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(skipFile) }));
await ctx.route(/\/data\/library-catalog\.json$/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(catalog) }));
await ctx.route(/^https:\/\/archive\.org\//, (r) => {
  const url = new URL(r.request().url());
  if (url.pathname.startsWith("/download/")) return r.fulfill({ status: 302, headers: { location: base + "__media/test.mp4" } });
  if (url.pathname === "/metadata/test_pd_book") {
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ metadata: { identifier: "test_pd_book", title: "A Test Book", creator: "Writer, Some", date: "1890", imagecount: "4" }, files: [{ name: "test_pd_book_jp2.zip" }] }),
    });
  }
  return r.fulfill({ status: 404, body: "" });
});
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)(?!archive\.org)/, (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const st = () => page.evaluate(() => window.NP.state());
const playing = () => page.waitForFunction(() => window.NP.state().mode === "playing", null, { timeout: 15000 }).then(() => true, () => false);
const dialogText = () => page.textContent("#dialog");
const btn = async (re, wait) => {
  await page.locator("#dialog .d-btn", { hasText: re }).first().click();
  await page.waitForTimeout(wait == null ? 300 : wait);
};

// ---------- a live channel: the card ----------
await page.goto(base + "?ch=069");
await page.waitForFunction(() => window.NP && window.NP.state().app === "on", null, { timeout: 15000 });
await page.keyboard.press("Enter");
check(await playing(), "069 plays its first film");
let s = await st();
check(s.cut && s.cut.mode === "card" && s.cut.scenes === 1 && !s.cutCard, `its list is on, in card mode, before the scene (${JSON.stringify(s.cut)})`);
await page.waitForFunction(() => window.NP.state().cutCard, null, { timeout: 8000 }).catch(() => {});
s = await st();
const t1 = await page.evaluate(() => document.getElementById("screen").currentTime);
const covered = await page.evaluate(() => {
  const el = document.elementFromPoint(640, 360);
  return !!el && !!el.closest("#cutcard");
});
check(s.cutCard && s.cut.card && t1 >= 6 && t1 < 9, `at the scene the card goes up (${t1.toFixed(2)} s into the film)`);
check(covered && /EXTREMELY GRAPHIC SCENE IS PLAYING/.test(await page.textContent("#cutcard")), "…full screen, over the picture, with the card's words");
check(await page.evaluate(() => document.getElementById("screen").muted), "…and the sound is cut");
check(!s.shifted && s.mode === "playing", "…the film plays on underneath: nothing skipped, still live");
await page.screenshot({ path: join(here, "shots", "5c-cut-card.png") });
await page.waitForFunction(() => !window.NP.state().cutCard, null, { timeout: 8000 }).catch(() => {});
const t2 = await page.evaluate(() => document.getElementById("screen").currentTime);
check(!(await st()).cutCard && t2 >= 9 && !(await page.evaluate(() => document.getElementById("screen").muted)), `after the scene the card lifts and the sound is back (${t2.toFixed(2)} s)`);

// ---------- a Video Club tape: uncut unless the viewer turns its TV-safe cut on ----------
const openTapeBox = async () => {
  for (let i = 0; i < 6 && (await st()).overlay; i++) await page.keyboard.press("Escape");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300);
  await page.click('#menu .m-item:has-text("Video Club")');
  await page.waitForTimeout(300);
  await page.click('#menu .m-item:has-text("📼 Test Tape")');
  await page.waitForTimeout(300);
};
await openTapeBox();
check(/Play TV-safe cut: Off/.test(await dialogText()) && /plays as it is/.test(await dialogText()), "a tape's TV-safe cut is off to begin with: it plays as it is");
await btn(/▶ Play/, 300);
check(await playing(), "the tape plays");
s = await st();
check(s.cut === null && /uncut/.test(await page.textContent("#toast")), `…uncut, and says where the TV-safe cut is: ${await page.textContent("#toast")}`);
check(!/TV-SAFE CUT/.test(await page.textContent("#banner")), "…no TV-safe cut on the banner");
// Turned on, on the tape's box, while it plays (the test scene is at 7–10 s).
await openTapeBox();
await btn(/Play TV-safe cut: Off/, 400);
check(/Play TV-safe cut: On/.test(await dialogText()) && /TV-safe cut: 1 scene skipped/.test(await dialogText()), "turned on, the tape's box says so");
check(await page.evaluate(() => JSON.parse(localStorage.getItem("nostalgem:library")).loans[0].cut === true), "…remembered with the tape");
await btn(/Close/);
s = await st();
const before = await page.evaluate(() => document.getElementById("screen").currentTime);
check(s.cut && s.cut.mode === "skip" && before < 7, `…and the tape playing now gets it (${JSON.stringify(s.cut)}, at ${before.toFixed(2)} s)`);
await page.waitForFunction(() => window.NP.state().cut && window.NP.state().cut.skipped === 1, null, { timeout: 12000 }).catch(() => {});
const t3 = await page.evaluate(() => document.getElementById("screen").currentTime);
s = await st();
check(s.cut && s.cut.skipped === 1 && t3 >= 10 && !s.cutCard, `the scene is jumped over (now ${t3.toFixed(2)} s, past 10)`);
check(/skipped a scene \(1 of 1\)/.test(await page.textContent("#toast")), "…with a word on screen, so it doesn't look like a glitch: " + (await page.textContent("#toast")));
await page.evaluate(() => window.NP.remote("info"));
await page.waitForTimeout(300);
check(/TV-SAFE CUT/.test(await page.textContent("#banner")), "…and the banner says so");
// Off again: untouched.
await openTapeBox();
await btn(/Play TV-safe cut: On/, 400);
check(/Play TV-safe cut: Off/.test(await dialogText()) && (await st()).cut === null, "turned off again, the tape plays as it is");
check(await page.evaluate(() => JSON.parse(localStorage.getItem("nostalgem:library")).loans[0].cut === false), "…remembered with the tape");
await btn(/Close/);

// ---------- the Reading Room: the club's catalog ----------
// A fresh start, so nothing from the tape is still on screen.
await page.reload();
await page.waitForFunction(() => window.NP && window.NP.state().app === "on", null, { timeout: 15000 });
await page.waitForTimeout(800);
await page.keyboard.press("ArrowRight");
await page.waitForFunction(() => window.NP.state().overlay === "menu", null, { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(500);
await page.locator("#menu .m-item", { hasText: "📚 Reading Room" }).first().click();
await page.waitForFunction(() => /Checked public domain/i.test(document.getElementById("menu").textContent), null, { timeout: 5000 }).catch(() => {});
const room = await page.textContent("#menu");
check(/Checked public domain/i.test(room) && /📜 Public-domain books/.test(room) && /💥 Public-domain comics/.test(room) && /🗾 Public-domain manga/.test(room) && /none yet/.test(room), "the Reading Room has the club's catalog: books, comics, and manga (none yet) · " + room.replace(/\s+/g, " ").slice(0, 160));
check((room.match(/🗾 Manga/g) || []).length === 1, "…apart from the Archive's own 🗾 Manga shelf (one of those)");
await page.click('#menu .m-item:has-text("🗾 Public-domain manga")');
await page.waitForTimeout(300);
check(/No verifiably public-domain manga was found/.test(await dialogText()), "…the empty manga shelf says why it's empty");
await btn(/OK/);
await page.click('#menu .m-item:has-text("📜 Public-domain books")');
await page.waitForTimeout(300);
check(/A Test Book/.test(await page.textContent("#menu")) && /1890/.test(await page.textContent("#menu")), "…a catalog shelf lists its books");
await page.click('#menu .m-item:has-text("A Test Book")');
await page.waitForTimeout(800);
check(/A Test Book/.test(await dialogText()) && /Borrow/.test(await dialogText()), "…and a book opens its box, to borrow and read in the Reading Room: " + (await dialogText()).replace(/\s+/g, " ").slice(0, 120));

check(!errors.length, "no page errors " + errors.join(" | "));
await browser.close();
site.close();
console.log(failures ? failures + " check(s) failed" : "CLEAN CUTS AND THE CATALOG: ALL GOOD");
process.exit(failures ? 1 : 0);
