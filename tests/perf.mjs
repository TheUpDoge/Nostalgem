// Measures what the picture filters and rapid channel switching cost, on a TV-sized screen with the
// processor slowed 4× (as a TV's is) against a computer. Not a test: a measuring tool, for the TV performance
// work (the numbers are in that pull request). Headless Chromium has no real GPU, so canvas drawing is
// software here: the absolute numbers are higher than a TV's, the comparisons (before/after, one limit
// against another) hold.
//
//   npm install --no-save playwright && node tests/perf.mjs [looks|switch|all] > out.jsonl
//   CLIP=clip.mp4       a film to play (default tests/fixtures/test.mp4, 320×240; a 720p clip shows the
//                       cost of drawing a real film: ffmpeg -f lavfi -i testsrc2=size=1280x720:rate=24 -t 12 clip.mp4)
//   ONLY="TV 960"       one of the screens below      LOOKS=off,ascii,glass   which filters
//   QUALITY=auto|full|light   Menu ▸ Filter quality   PERF=asciiCols:64,asciiMs:150   other TV limits (fxcanvas.js)
//   SWLOOKS=off,ascii   filters to switch channels under
// Each line of output is one measurement (JSON): frames a second the page draws, main-thread milliseconds
// per second (script, style and layout within it), long tasks, video frames shown and dropped, the canvases.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..", "web");
const what = process.argv[2] || "all";
const only = process.env.ONLY || "";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/json", ".mp4": "video/mp4" };
const video = await readFile(process.env.CLIP || join(here, "fixtures", "test.mp4"));
const lineup = JSON.parse(await readFile(join(web, "data/lineup.json"), "utf8"));
for (const c of lineup.channels) c.offset = 0;
const srv = createServer(async (q, s) => {
  const path = new URL(q.url, "http://x").pathname;
  if (path === "/__media/test.mp4") {
    const m = /bytes=(\d*)-(\d*)/.exec(q.headers.range || "");
    if (!m) return s.writeHead(200, { "content-type": "video/mp4", "content-length": video.length, "accept-ranges": "bytes" }).end(video);
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Math.min(Number(m[2]), video.length - 1) : video.length - 1;
    return s.writeHead(206, { "content-type": "video/mp4", "content-length": end - start + 1, "content-range": `bytes ${start}-${end}/${video.length}`, "accept-ranges": "bytes" }).end(video.subarray(start, end + 1));
  }
  if (path === "/data/lineup.json") return s.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(lineup));
  const file = normalize(join(web, path === "/" ? "index.html" : path));
  try {
    s.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(await readFile(file));
  } catch {
    s.writeHead(404).end();
  }
});
await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
const base = "http://127.0.0.1:" + srv.address().port + "/";

const CONFIGS = [
  { name: "computer 1920x1080 @1x", w: 1920, h: 1080, dpr: 1, cpu: 1, android: false },
  { name: "TV 960x540 @2x (1080p Android TV), CPU /4", w: 960, h: 540, dpr: 2, cpu: 4, android: true },
  { name: "4K TV 960x540 @4x, CPU /4", w: 960, h: 540, dpr: 4, cpu: 4, android: true },
].filter((c) => !only || c.name.includes(only));
const LOOKS = (process.env.LOOKS || "off,ascii,ascii-matrix,ascii-666,pixel,8bit,glass,pop-red,colorize,vhs").split(",");

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const results = { looks: [], switching: [] };

async function open(cfg, settings) {
  const ctx = await browser.newContext({ viewport: { width: cfg.w, height: cfg.h }, deviceScaleFactor: cfg.dpr });
  await ctx.addInitScript((st) => {
    window.NostalGemRelayBrokers = [];
    localStorage.setItem("nostalgem:seenVersion", JSON.stringify("999.0.0"));
    localStorage.setItem("nostalgem:settings", JSON.stringify(st));
    // count timers that stay alive
    const live = new Set();
    const si = window.setInterval.bind(window);
    const ci = window.clearInterval.bind(window);
    window.setInterval = function (f, ms) {
      const id = si(f, ms);
      live.add(id);
      return id;
    };
    window.clearInterval = function (id) {
      live.delete(id);
      return ci(id);
    };
    window.__intervals = () => live.size;
    // frames
    window.__fps = { n: 0, t0: 0, long: 0 };
    const loop = (t) => {
      window.__fps.n++;
      if (window.__fps.last && t - window.__fps.last > 50) window.__fps.long++;
      window.__fps.last = t;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    window.__longtasks = [];
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__longtasks.push(e.duration))).observe({ entryTypes: ["longtask"] });
    } catch (e) {}
  }, settings);
  await ctx.route(/^https:\/\/archive\.org\//, (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.startsWith("/download/")) return r.fulfill({ status: 302, headers: { location: base + "__media/test.mp4" } });
    return r.fulfill({ status: 404, body: "" });
  });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)(?!archive\.org)/, (r) => r.abort());
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Performance.enable");
  await page.clock.setFixedTime(new Date(Date.parse(lineup.epoch) + 3000));
  await page.goto(base + "?ch=1" + (cfg.android ? "&tv=android" : "") + (process.env.PERF ? "&perf=" + process.env.PERF : ""));
  await page.waitForFunction(() => window.NP && window.NP.state().app === "on", null, { timeout: 20000 });
  await page.waitForFunction(() => window.NP.state().mode === "playing", null, { timeout: 20000 }).catch(() => {});
  if (cfg.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cfg.cpu });
  return { ctx, page, cdp };
}

async function metrics(cdp) {
  const m = (await cdp.send("Performance.getMetrics")).metrics;
  const o = {};
  for (const x of m) o[x.name] = x.value;
  return o;
}

async function measureLook(cfg, look) {
  const { ctx, page, cdp } = await open(cfg, { look: look.replace(/:lite$/, ""), lookQuality: /:lite$/.test(look) ? "light" : process.env.QUALITY || "full", crt: "light" });
  await page.waitForTimeout(2500);
  const m0 = await metrics(cdp);
  const q0 = await page.evaluate(() => {
    const v = document.getElementById("screen");
    const q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : {};
    window.__fps.n = 0;
    window.__fps.long = 0;
    window.__fps.t0 = performance.now();
    window.__longtasks.length = 0;
    return { total: q.totalVideoFrames || 0, dropped: q.droppedVideoFrames || 0 };
  });
  const SECS = 5;
  await page.waitForTimeout(SECS * 1000);
  const m1 = await metrics(cdp);
  const r = await page.evaluate(() => {
    const v = document.getElementById("screen");
    const q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : {};
    const secs = (performance.now() - window.__fps.t0) / 1000;
    const canvases = Array.from(document.querySelectorAll("canvas")).filter((c) => !c.hidden && c.offsetWidth).map((c) => (c.className || c.id) + " " + c.width + "x" + c.height + " shown " + c.offsetWidth + "x" + c.offsetHeight);
    return { fps: window.__fps.n / secs, slowFrames: window.__fps.long, longTasks: window.__longtasks.length, longMs: Math.round(window.__longtasks.reduce((a, b) => a + b, 0)), total: q.totalVideoFrames || 0, dropped: q.droppedVideoFrames || 0, canvases: canvases, mode: window.NP.state().mode, look: window.NP.state().look };
  });
  const task = ((m1.TaskDuration - m0.TaskDuration) / SECS) * 1000; // ms of main-thread work per second
  const script = ((m1.ScriptDuration - m0.ScriptDuration) / SECS) * 1000;
  const style = ((m1.RecalcStyleDuration - m0.RecalcStyleDuration) / SECS) * 1000;
  const layout = ((m1.LayoutDuration - m0.LayoutDuration) / SECS) * 1000;
  const row = {
    config: cfg.name,
    look,
    mode: r.mode,
    fps: Math.round(r.fps * 10) / 10,
    slowFrames: r.slowFrames,
    mainThreadMsPerSec: Math.round(task),
    scriptMsPerSec: Math.round(script),
    styleMsPerSec: Math.round(style),
    layoutMsPerSec: Math.round(layout),
    longTasks: r.longTasks,
    videoFrames: r.total - q0.total,
    dropped: r.dropped - q0.dropped,
    canvases: r.canvases,
    lookState: r.look.id + (r.look.lite ? " (lite)" : ""),
  };
  console.log(JSON.stringify(row));
  await ctx.close();
  return row;
}

async function measureSwitching(cfg, look) {
  const { ctx, page, cdp } = await open(cfg, { look: look, lookQuality: "full", crt: "light" });
  await page.waitForTimeout(2500);
  await cdp.send("HeapProfiler.enable");
  await cdp.send("HeapProfiler.collectGarbage");
  const m0 = await metrics(cdp);
  const before = await page.evaluate(() => ({ media: document.querySelectorAll("video,audio").length, intervals: window.__intervals(), nodes: document.getElementsByTagName("*").length }));
  let requests = 0;
  page.on("request", () => requests++);
  await page.evaluate(() => (window.__longtasks.length = 0));
  const N = 20;
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(150);
  }
  const pressMs = Date.now() - t0;
  // settle on the last channel
  await page.waitForTimeout(4000);
  await cdp.send("HeapProfiler.collectGarbage");
  const m1 = await metrics(cdp);
  const after = await page.evaluate(() => ({ media: document.querySelectorAll("video,audio").length, intervals: window.__intervals(), nodes: document.getElementsByTagName("*").length, mode: window.NP.state().mode, ch: window.NP.state().label, long: window.__longtasks.slice() }));
  const row = {
    config: cfg.name,
    look,
    switches: N,
    pressMs,
    landedOn: after.ch + " " + after.mode,
    mainThreadMs: Math.round((m1.TaskDuration - m0.TaskDuration) * 1000),
    scriptMs: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000),
    styleMs: Math.round((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000),
    layoutMs: Math.round((m1.LayoutDuration - m0.LayoutDuration) * 1000),
    longTasks: after.long.length,
    longestMs: Math.round(Math.max(0, ...after.long)),
    heapMB: [Math.round(m0.JSHeapUsedSize / 1e5) / 10, Math.round(m1.JSHeapUsedSize / 1e5) / 10],
    domNodes: [m0.Nodes, m1.Nodes],
    listeners: [m0.JSEventListeners, m1.JSEventListeners],
    mediaElements: [before.media, after.media],
    intervals: [before.intervals, after.intervals],
    audioHandlers: [m0.AudioHandlers, m1.AudioHandlers],
    requests,
  };
  console.log(JSON.stringify(row));
  await ctx.close();
  return row;
}

for (const cfg of CONFIGS) {
  if (what === "all" || what === "looks") for (const look of LOOKS) results.looks.push(await measureLook(cfg, look));
  if (what === "all" || what === "switch") for (const look of (process.env.SWLOOKS || "off,ascii").split(",")) results.switching.push(await measureSwitching(cfg, look));
}
await browser.close();
srv.close();
