// The stations with their own picture and sound: 666 Dead Air in red ASCII (666 999 † *) at half speed and
// an octave down, and 111 Pearly Gates in stained glass with its films ringing around a church. Also: the
// viewer can still pick another filter there, both looks are in the filter list, and a film that won't
// load with CORS (the real Archive's don't) plays the ordinary way, with echoes.
//
//   npm install --no-save playwright && node tests/stations.browser.mjs

import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { makeTimeline, slotAt } from "../web/js/schedule.js";
import { BBC_CHANNEL, DEAD_AIR_CHANNEL, PEARLY_GATES_CHANNEL } from "../web/js/secrets.js";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..", "web");
const shots = join(here, "shots");
await mkdir(shots, { recursive: true });
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/json" };
const video = await readFile(join(here, "fixtures", "test.mp4"));
const lineup = JSON.parse(await readFile(join(web, "data", "lineup.json"), "utf8"));

// The Archive's files come with byte ranges and, like the real thing, CORS.
const site = createServer(async (q, s) => {
  const path = new URL(q.url, "http://x").pathname;
  if (path === "/__media/test.mp4" || path === "/__media/nocors.mp4") {
    // nocors.mp4: a server that doesn't allow CORS.
    const cors = path === "/__media/test.mp4" ? { "access-control-allow-origin": "*" } : {};
    const m = /bytes=(\d*)-(\d*)/.exec(q.headers.range || "");
    if (!m) return s.writeHead(200, { ...cors, "content-type": "video/mp4", "content-length": video.length, "accept-ranges": "bytes" }).end(video);
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Math.min(Number(m[2]), video.length - 1) : video.length - 1;
    return s
      .writeHead(206, { ...cors, "content-type": "video/mp4", "content-length": end - start + 1, "content-range": `bytes ${start}-${end}/${video.length}`, "accept-ranges": "bytes" })
      .end(video.subarray(start, end + 1));
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

// A moment a few seconds into a station's first film, so the short test video has the picture.
function startOfFirstFilm(ch) {
  const epoch = Date.parse(lineup.epoch);
  const tl = makeTimeline(ch, { gap: lineup.gap, epoch });
  const loops = Math.ceil((Date.now() - epoch) / 1000 / tl.total);
  return epoch + loops * tl.total * 1000 + 4000;
}

// How much of a screenshot is red, green, blue, gray or other, and how many different hues it has.
async function colors(page, png) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 160;
    c.height = 90;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0, 160, 90);
    const d = x.getImageData(0, 0, 160, 90).data;
    const n = { red: 0, gray: 0, black: 0, other: 0, hues: new Set() };
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max < 40) n.black++;
      else if (max - min < 30) n.gray++;
      else if (r === max && g < r * 0.55 && b < r * 0.55) n.red++;
      else n.other++;
      if (max - min >= 40) {
        let h = 0;
        if (max === r) h = ((g - b) / (max - min) + 6) % 6;
        else if (max === g) h = (b - r) / (max - min) + 2;
        else h = (r - g) / (max - min) + 4;
        n.hues.add(Math.floor(h * 2));
      }
    }
    const total = d.length / 4;
    return { red: n.red / total, gray: n.gray / total, black: n.black / total, other: n.other / total, hues: n.hues.size };
  }, png.toString("base64"));
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });

async function open(ch, opts) {
  const o = opts || {};
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const now = startOfFirstFilm(ch);
  await ctx.addInitScript(
    (a) => {
      window.NostalGemRelayBrokers = [];
      localStorage.setItem("nostalgem:seenVersion", JSON.stringify("999.0.0"));
      // The station's first film has just started. The test can move the clock to another one.
      let shift = a.now - Date.now();
      const real = Date.now;
      Date.now = function () {
        return real() + shift;
      };
      window.__setNow = function (t) {
        shift = t - real();
      };
    },
    { now }
  );
  const state = { downloads: [] };
  await ctx.route(/^https:\/\/archive\.org\//, (r) => {
    const url = new URL(r.request().url());
    if (!url.pathname.startsWith("/download/")) return r.fulfill({ status: 404, body: "" });
    state.downloads.push(decodeURIComponent(url.pathname));
    // The Archive answers /download/ with a redirect to one of its servers, which allows CORS; this
    // stand-in can be told to send it to one that doesn't.
    return r.fulfill({ status: 302, headers: { location: base + (o.noCors ? "__media/nocors.mp4" : "__media/test.mp4"), "access-control-allow-origin": "*" } });
  });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)(?!archive\.org)/, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "?ch=" + ch.number + (o.reverb ? "&reverb=1" : ""));
  await page.waitForFunction(() => window.NP && window.NP.state().app === "on", null, { timeout: 15000 });
  // A button press, the way a viewer would tune it (browsers start sound for a page someone pressed on).
  await page.keyboard.press("Enter");
  return { ctx, page, errors, state };
}
const st = (page) => page.evaluate(() => window.NP.state());
// The picture alone: the banner, toasts and the corner bug put away for a moment.
async function bare(page, name) {
  await page.addStyleTag({ content: ".bare #banner, .bare #toast, .bare .bug, .bare #osd, .bare .haunt, .bare #intro { visibility: hidden !important; }" });
  await page.evaluate(() => document.documentElement.classList.add("bare"));
  await page.waitForTimeout(150);
  const png = await page.screenshot({ path: join(shots, name) });
  await page.evaluate(() => document.documentElement.classList.remove("bare"));
  return png;
}
const playing = (page) => page.waitForFunction(() => window.NP.state().mode === "playing", null, { timeout: 15000 }).then(() => true, () => false);

// ---------- 666 ----------
{
  const { ctx, page, errors } = await open(DEAD_AIR_CHANNEL);
  check(await playing(page), "666 plays its first film");
  await page.waitForTimeout(1500);
  let s = await st(page);
  check(s.station === "dead-air" && s.look.id === "ascii-666" && s.look.station === "ascii-666" && s.look.setting === "off", `666 wears ASCII · 666 without changing the viewer's own filter (${JSON.stringify(s.look)})`);
  check(s.sound.rate === 0.5 && s.sound.pitch === false && !s.sound.church, `…and plays at half speed, an octave down (${JSON.stringify(s.sound)})`);
  const t0 = await page.evaluate(() => document.getElementById("screen").currentTime);
  await page.waitForTimeout(2000);
  const t1 = await page.evaluate(() => document.getElementById("screen").currentTime);
  check(t1 - t0 > 0.6 && t1 - t0 < 1.4, `…a second of film every two seconds (${(t1 - t0).toFixed(2)}s of film in 2s)`);
  check(await page.isVisible("canvas.fxcv"), "…drawn on the canvas");
  const shot = await bare(page, "5a-666-ascii.png");
  const c = await colors(page, shot);
  check(c.red > 0.05 && c.other < c.red && c.hues <= 3, `…in red, gray, white and black only (${JSON.stringify(c)})`);
  // The viewer can still pick another filter there; it lasts until they tune away.
  await page.evaluate(() => window.NP.remote("look"));
  await page.waitForTimeout(300);
  s = await st(page);
  check(s.look.id !== "ascii-666" && s.look.station === "" && s.look.setting === s.look.id, `the filter button changes it there (${s.look.id})`);
  for (const d of "12") await page.keyboard.press(d);
  await page.waitForTimeout(2600);
  for (const d of "666") await page.keyboard.press(d);
  await page.waitForTimeout(2600);
  s = await st(page);
  check(s.channel === 666 && s.look.id === "ascii-666", `…and coming back, 666 wears its own again (${s.look.id})`);
  for (const d of "12") await page.keyboard.press(d);
  await page.waitForTimeout(2600);
  s = await st(page);
  check(s.channel === 12 && s.look.id === s.look.setting && s.look.station === "" && (await page.evaluate(() => document.getElementById("screen").playbackRate)) === 1, `other channels keep the viewer's filter and normal speed (CH ${s.channel}, ${s.mode}, ${s.look.id})`);
  // The same from 666 straight into another channel's station break, where nothing loads to set the speed
  // (which one CH 12 lands on used to depend on the time of day the test ran).
  for (const d of "666") await page.keyboard.press(d);
  await page.waitForTimeout(2600);
  const ch12 = lineup.channels.find((c) => c.number === 12);
  const now = await page.evaluate(() => Date.now());
  const brk = slotAt(makeTimeline(ch12, { gap: lineup.gap, epoch: Date.parse(lineup.epoch) }), now).endMs + 1500;
  await page.evaluate((t) => window.__setNow(t), brk);
  for (const d of "12") await page.keyboard.press(d);
  await page.waitForTimeout(2600);
  s = await st(page);
  const sp = await page.evaluate(() => ({ rate: document.getElementById("screen").playbackRate, pitch: document.getElementById("screen").preservesPitch }));
  check(s.channel === 12 && s.mode === "gap" && sp.rate === 1 && sp.pitch !== false, `…and from 666 into CH 12's station break, nothing is left at half speed (${s.mode}, rate ${sp.rate})`);
  check(!errors.length, "no page errors " + errors.join(" | "));
  await ctx.close();
}

// ---------- 111, as the app does it: echoes ----------
{
  const { ctx, page, errors, state } = await open(PEARLY_GATES_CHANNEL);
  check(await playing(page), "111 plays its first film");
  await page.waitForFunction(() => window.NP.state().sound.echo.on === 3, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2500);
  let s = await st(page);
  check(s.station === "pearly-gates" && s.look.id === "glass", `111 wears Stained glass (${s.look.id})`);
  check(s.sound.church && !s.sound.cors && !s.sound.inChurch && s.sound.rate === 1 && s.sound.pitch !== false, `…its film plays the ordinary way (no CORS: the Archive doesn't allow it), at its own pitch (${JSON.stringify(s.sound)})`);
  check(s.sound.echo.on === 3 && s.sound.echo.off < 250, `…with three echoes of its sound, each where it belongs (${JSON.stringify(s.sound.echo)})`);
  check(state.downloads.length === 4, `…the film and its echoes, nothing refused on the way (${state.downloads.length} requests)`);
  check((await page.isVisible("canvas.fxcv")) && (await page.isVisible("canvas.fxrain")), "…panes on the canvas, lead on the layer above");
  const shot = await bare(page, "5b-111-glass.png");
  const c = await colors(page, shot);
  check(c.hues >= 4, `…in many colors of glass (${JSON.stringify(c)})`);
  // Paused, the echoes stop too; playing again, they come back.
  await page.keyboard.press(" ");
  await page.waitForTimeout(700);
  s = await st(page);
  check(s.mode === "paused" && s.sound.echo.on === 0, `pausing the film pauses its echoes (${s.mode}, ${JSON.stringify(s.sound.echo)})`);
  await page.keyboard.press(" ");
  await page.waitForFunction(() => window.NP.state().sound.echo.on === 3, null, { timeout: 6000 }).catch(() => {});
  check((await st(page)).sound.echo.on === 3, "…and playing again brings them back");
  // Leaving the station stops them.
  await page.evaluate((t) => window.__setNow(t), startOfFirstFilm(BBC_CHANNEL));
  for (const d of "069") await page.keyboard.press(d);
  await page.waitForTimeout(2600);
  await page.keyboard.press("Enter");
  await playing(page);
  s = await st(page);
  check(s.channel === 69 && s.sound.echo.on === 0 && !s.sound.church, `on another channel there are no echoes (CH ${s.channel}, ${JSON.stringify(s.sound.echo)})`);
  check(!errors.length, "no page errors " + errors.join(" | "));
  await ctx.close();
}

// ---------- 111 with the reverb (?reverb=1), from a server that allows CORS ----------
{
  const { ctx, page, errors } = await open(PEARLY_GATES_CHANNEL, { reverb: true });
  check(await playing(page), "with the reverb on, 111 plays its first film");
  await page.waitForFunction(() => window.NP.state().sound.inChurch, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  let s = await st(page);
  check(s.sound.church && s.sound.cors && s.sound.inChurch && s.sound.rate === 1 && s.sound.echo.on === 0, `…its film's sound is in the church's reverb, without echoes (${JSON.stringify(s.sound)})`);
  let loud = 0;
  for (let i = 0; i < 10 && !loud; i++) {
    loud = (await st(page)).sound.level;
    if (!loud) await page.waitForTimeout(300);
  }
  check(loud > 0, `…and the church hears it (level ${loud})`);
  const before = await page.evaluate(() => {
    window.__churchVideo = document.getElementById("screen");
    return true;
  });
  // Over to 069, a few seconds into its first film.
  await page.evaluate((t) => window.__setNow(t), startOfFirstFilm(BBC_CHANNEL));
  for (const d of "069") await page.keyboard.press(d);
  await page.waitForTimeout(2600);
  await page.keyboard.press("Enter"); // past its card
  check(await playing(page), "tuning away plays the next channel");
  s = await st(page);
  const swapped = await page.evaluate(() => {
    const v = document.getElementById("screen");
    return { fresh: v !== window.__churchVideo, cors: v.hasAttribute("crossorigin"), old: !!window.__churchVideo.parentNode, filters: !!document.querySelector("canvas.fxcv") };
  });
  check(before && swapped.fresh && !swapped.cors && !swapped.old && !s.sound.inChurch && !s.sound.church, `…on a fresh <video> whose sound isn't in the church (${JSON.stringify(swapped)})`);
  // Filters draw from the fresh <video>.
  let tries = 0;
  while ((await st(page)).look.id !== "ascii" && tries++ < 40) await page.evaluate(() => window.NP.remote("look"));
  await page.waitForTimeout(1200);
  check((await st(page)).look.id === "ascii" && (await page.isVisible("canvas.fxcv")), "…and a canvas filter still draws the picture from it");
  check(!errors.length, "no page errors " + errors.join(" | "));
  await ctx.close();
}

// ---------- 111 with the reverb, from a server that won't allow CORS ----------
{
  const { ctx, page, errors, state } = await open(PEARLY_GATES_CHANNEL, { reverb: true, noCors: true });
  check(await playing(page), "a film that won't load with CORS still plays");
  await page.waitForFunction(() => window.NP.state().sound.echo.on === 3, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const s = await st(page);
  check(s.channel === 111 && s.program === PEARLY_GATES_CHANNEL.items[0].t && !s.sound.cors && !s.sound.inChurch && s.sound.echo.on === 3, `…the ordinary way with echoes, not dropped (${s.program}, ${JSON.stringify(s.sound)})`);
  check(state.downloads.length >= 5, `…after trying it with CORS first (${state.downloads.length} requests)`);
  check(!errors.length, "no page errors " + errors.join(" | "));
  await ctx.close();
}

await browser.close();
site.close();
console.log(failures ? failures + " check(s) failed" : "STATIONS: ALL GOOD");
process.exit(failures ? 1 : 0);
