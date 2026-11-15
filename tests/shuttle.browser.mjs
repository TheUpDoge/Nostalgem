// Fast-forward and rewind (player.js fastForward / rewind / behind, main.js the shuttle bar), on the TV path
// (?tv=android), with a 3-minute test film on CH 1:
//   At live there's nothing ahead to fast-forward to, and the TV says so. RW jumps back 10 s, and 30 s when
//   pressed again soon after, never before the program's start; the bar shows the place and how far behind
//   live. With the bar up, the d-pad drives it: ▶ steps FF through 2×, 4×, 8× (muted, as a tape winds), OK
//   plays at normal speed, ▲ is back to live, ▼ hides it. FF on a program behind the clock catches up and
//   is live again. The bar's own buttons work by click. A program watched behind the clock that ends puts
//   the channel back on the live schedule. The phone's ⏪ and ⏩ do the same, and the phone shows the speed
//   and how far behind live.
//
//   npm install --no-save playwright && node tests/shuttle.browser.mjs

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..", "web");
const fixtures = join(here, "fixtures");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/json" };
const film = await readFile(join(fixtures, "long.mp4")); // 180 s
const LEN = 180;
// CH 1 airs three 3-minute films, back to back, from the lineup's epoch.
const lineup = JSON.parse(await readFile(join(web, "data", "lineup.json"), "utf8"));
const ch1 = lineup.channels.find((c) => c.number === 1);
ch1.offset = 0;
ch1.items = ["a", "b", "c"].map((x) => ({ id: "test_shuttle_" + x, f: x + ".mp4", t: "Shuttle Film " + x.toUpperCase(), d: LEN }));
const EPOCH = Date.parse(lineup.epoch);
const GAP = lineup.gap != null ? lineup.gap : 8;
const site = createServer(async (q, s) => {
  const path = new URL(q.url, "http://x").pathname;
  if (path === "/__media/long.mp4") {
    // Ranges, so the player can seek.
    const range = /bytes=(\d+)-(\d*)/.exec(q.headers.range || "");
    if (range) {
      const a = Number(range[1]);
      const b = range[2] ? Number(range[2]) : film.length - 1;
      return s.writeHead(206, { "content-type": "video/mp4", "content-range": `bytes ${a}-${b}/${film.length}`, "content-length": b - a + 1, "accept-ranges": "bytes" }).end(film.subarray(a, b + 1));
    }
    return s.writeHead(200, { "content-type": "video/mp4", "content-length": film.length, "accept-ranges": "bytes" }).end(film);
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

let failures = 0;
const check = (ok, what) => {
  console.log((ok ? "  ok   " : "  FAIL ") + what);
  if (!ok) failures++;
};
const errors = [];
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const CODE = "SHT234";
async function open(startAt) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript({ path: join(fixtures, "fake-peer.js") });
  await ctx.addInitScript((code) => {
    window.NostalGemRelayBrokers = [];
    localStorage.setItem("nostalgem:seenVersion", JSON.stringify("999.0.0"));
    localStorage.setItem("nostalgem:settings", JSON.stringify({ phone: true }));
    localStorage.setItem("nostalgem:phoneCode", JSON.stringify(code));
  }, CODE);
  await ctx.route(/^https:\/\/archive\.org\//, (r) => r.fulfill({ status: 302, headers: { location: base + "__media/long.mp4" } }));
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)(?!archive\.org)/, (r) => r.abort());
  const tv = await ctx.newPage();
  tv.on("pageerror", (e) => errors.push("TV: " + e.message));
  await tv.clock.install({ time: new Date(EPOCH + startAt * 1000) });
  await tv.goto(base + "?tv=android&ch=1");
  await tv.waitForFunction(() => window.NP && window.NP.state().mode === "playing" && window.NP.state().at > 0, null, { timeout: 20000 }).catch(() => {});
  await tv.waitForTimeout(800);
  return { ctx, tv };
}
const st = (p) => p.evaluate(() => window.NP.state());
const toast = (p) => p.evaluate(() => document.getElementById("toast").textContent);
const video = (p) => p.evaluate(() => {
  const v = document.getElementById("screen");
  return { rate: v.playbackRate, muted: v.muted, t: v.currentTime };
});
// The clock's place in the program now (seconds into CH 1's current film).
const livePoint = (p) => p.evaluate(([e, len, gap]) => ((Date.now() - e) / 1000) % (len + gap), [EPOCH, LEN, GAP]);

// ---------- on the TV's own remote ----------
{
  const { ctx, tv } = await open(60);
  let s = await st(tv);
  check(s.channel === 1 && s.mode === "playing" && near(s.at, 61, 4) && !s.shifted, `CH 1 plays live, about a minute into the film (${s.at} s)`);

  // At live: nothing ahead of now.
  await tv.keyboard.press("]");
  await tv.waitForTimeout(300);
  s = await st(tv);
  check(s.ff === 1 && !s.shifted && /watching live: there's nothing after now/.test(await toast(tv)), "FF at live goes nowhere, and the TV says why: " + (await toast(tv)));

  // RW: 10 s back, then 30 s more when pressed again soon after.
  let before = (await st(tv)).at;
  await tv.keyboard.press("[");
  await tv.waitForTimeout(400);
  s = await st(tv);
  check(s.shifted && near(s.at, before - 10, 2) && near(s.behind, 10, 2), `RW jumps back 10 s (${before} → ${s.at}), and the viewer is ${s.behind} s behind live`);
  check(/⏪ −10 s/.test(s.shuttle) && /behind live/.test(s.shuttle) && /\d:\d\d \/ 3:00/.test(s.shuttle), "…the bar shows it, the place in the film and how far behind: " + s.shuttle.slice(0, 90));
  before = s.at;
  await tv.keyboard.press("[");
  await tv.waitForTimeout(400);
  s = await st(tv);
  check(near(s.at, before - 30, 2) && near(s.behind, 40, 3), `…pressed again soon after, it jumps 30 s (${before} → ${s.at}, ${s.behind} s behind)`);
  for (let i = 0; i < 3; i++) {
    await tv.keyboard.press("[");
    await tv.waitForTimeout(200);
  }
  s = await st(tv);
  check(s.at < 2 && s.channel === 1 && /Shuttle Film A/.test(s.program), `…and stops at the program's start, not in the one before (${s.at} s, ${s.program})`);

  // The d-pad while the bar is up: ▶ steps the speed, OK plays, ▼ hides.
  await tv.keyboard.press("ArrowRight");
  await tv.waitForTimeout(250);
  let v = await video(tv);
  s = await st(tv);
  check(s.ff === 2 && near(v.rate, 2, 0.01) && v.muted && /⏩ 2×/.test(s.shuttle) && s.overlay === "", `with the bar up, ▶ on the d-pad fast-forwards at 2×, sound off, and opens no menu (rate ${v.rate})`);
  await tv.keyboard.press("ArrowRight");
  await tv.waitForTimeout(150);
  await tv.keyboard.press("ArrowRight");
  await tv.waitForTimeout(150);
  await tv.keyboard.press("ArrowRight");
  await tv.waitForTimeout(250);
  v = await video(tv);
  s = await st(tv);
  check(s.ff === 8 && near(v.rate, 8, 0.01), `…4×, then 8×, and 8× stays 8× (rate ${v.rate})`);
  const t0 = s.at;
  await tv.waitForTimeout(1000);
  s = await st(tv);
  check(s.at - t0 > 5, `…and the film really runs at 8× (${t0} → ${s.at} s in a second)`);
  await tv.keyboard.press("Enter");
  await tv.waitForTimeout(300);
  v = await video(tv);
  s = await st(tv);
  check(s.ff === 1 && near(v.rate, 1, 0.01) && !v.muted && s.shifted && s.mode === "playing", `OK plays at normal speed again, with sound, still behind live (${s.behind} s)`);

  // FF catches up with the clock: live again.
  await tv.keyboard.press("ArrowRight");
  await tv.keyboard.press("ArrowRight");
  await tv.keyboard.press("ArrowRight");
  await tv.waitForFunction(() => !window.NP.state().shifted, null, { timeout: 30000 }).catch(() => {});
  s = await st(tv);
  let live = await livePoint(tv);
  v = await video(tv);
  check(!s.shifted && s.ff === 1 && near(v.rate, 1, 0.01) && near(s.at, live, 3) && /Caught up with the clock/.test(await toast(tv)), `FF on a program behind the clock catches up and is live again, never ahead (${s.at} s, the clock says ${live.toFixed(1)})`);

  // ▲ is back to live.
  await tv.keyboard.press("[");
  await tv.waitForTimeout(300);
  await tv.keyboard.press("[");
  await tv.waitForTimeout(300);
  check((await st(tv)).behind >= 35, "rewound 40 s");
  await tv.keyboard.press("ArrowUp");
  await tv.waitForFunction(() => !window.NP.state().shifted && window.NP.state().mode === "playing", null, { timeout: 15000 }).catch(() => {});
  s = await st(tv);
  live = await livePoint(tv);
  check(!s.shifted && near(s.at, live, 3) && s.shuttle === "" && s.overlay === "", `▲ with the bar up is back to live (${s.at} s, the clock says ${live.toFixed(1)}), and the bar goes`);

  // ▼ and BACK hide the bar and keep the place.
  await tv.keyboard.press("[");
  await tv.waitForTimeout(300);
  await tv.keyboard.press("ArrowDown");
  await tv.waitForTimeout(200);
  s = await st(tv);
  check(s.shuttle === "" && s.shifted && s.overlay === "", "▼ hides the bar, still behind live");
  await tv.keyboard.press("[");
  await tv.waitForTimeout(300);
  await tv.keyboard.press("Escape");
  await tv.waitForTimeout(200);
  s = await st(tv);
  check(s.shuttle === "" && s.shifted, "BACK hides it too");
  // With the bar down, ▶ is the menu again.
  await tv.keyboard.press("ArrowRight");
  await tv.waitForTimeout(300);
  check((await st(tv)).overlay === "menu", "…and with it down, ▶ opens the menu as before");
  await tv.keyboard.press("Escape");

  // The bar's own buttons, by click.
  await tv.keyboard.press("[");
  await tv.waitForTimeout(300);
  await tv.click('#shuttle [data-sh="ff"]');
  await tv.waitForTimeout(250);
  s = await st(tv);
  check(s.ff === 2, "the bar's ⏩ button fast-forwards");
  await tv.click('#shuttle [data-sh="play"]');
  await tv.waitForTimeout(250);
  check((await st(tv)).ff === 1, "…its ▶ plays");
  const at = (await st(tv)).at;
  await tv.click('#shuttle [data-sh="rw"]');
  await tv.waitForTimeout(300);
  const atRw = (await st(tv)).at;
  check(near(atRw, Math.max(0, at - 10), 2), `…its ⏪ jumps back (${at} → ${atRw})`);
  await tv.click('#shuttle [data-sh="live"]');
  await tv.waitForTimeout(1500);
  check(!(await st(tv)).shifted, "…and its LIVE is back to live");

  // Menu ▸ Fast-forward / rewind brings the bar up from the d-pad alone.
  await tv.keyboard.press("ArrowRight");
  await tv.waitForFunction(() => window.NP.state().overlay === "menu", null, { timeout: 3000 }).catch(() => {});
  const focused = () => tv.evaluate(() => (document.querySelector("#menu .m-item.focus") || {}).textContent || "");
  for (let i = 0; i < 40 && !/Fast-forward \/ rewind/.test(await focused()); i++) await tv.keyboard.press("ArrowDown");
  await tv.keyboard.press("Enter");
  await tv.waitForTimeout(300);
  s = await st(tv);
  check(s.overlay === "" && /LIVE/.test(s.shuttle), "Menu ▸ Fast-forward / rewind brings the bar up: " + s.shuttle.slice(0, 60));
  await tv.keyboard.press("ArrowLeft");
  await tv.waitForTimeout(300);
  check((await st(tv)).shifted, "…and ◀ rewinds from there");
  await ctx.close();
}

// ---------- the program ends while behind the clock ----------
{
  const { ctx, tv } = await open(LEN - 14); // 14 s left of film A
  await tv.keyboard.press("[");
  await tv.waitForTimeout(400);
  let s = await st(tv);
  check(s.shifted && /Shuttle Film A/.test(s.program), `10 s behind, near the end of film A (${s.at} s)`);
  // The film runs out about 24 s from now; the schedule moved on to film B meanwhile.
  await tv.waitForFunction(() => !window.NP.state().shifted && /Shuttle Film B/.test(window.NP.state().program), null, { timeout: 40000 }).catch(() => {});
  s = await st(tv);
  check(!s.shifted && /Shuttle Film B/.test(s.program) && /back on the live schedule/.test(await toast(tv)), `when a program watched behind the clock ends, the channel is live again (${s.program}: ${await toast(tv)})`);
  await ctx.close();
}

// ---------- the phone's buttons ----------
{
  const { ctx, tv } = await open(60);
  const ph = await ctx.newPage();
  ph.on("pageerror", (e) => errors.push("phone: " + e.message));
  await ph.setViewportSize({ width: 390, height: 844 });
  await ph.goto(base + "remote.html#" + CODE);
  await ph.waitForFunction(() => window.NGRemote && window.NGRemote.state().status === "connected" && window.NGRemote.state().tv, null, { timeout: 15000 }).catch(() => {});
  check((await ph.evaluate(() => window.NGRemote.state().status)) === "connected", "the phone pairs");
  check(await ph.isVisible("#rwBtn") && await ph.isVisible("#ffBtn"), "the phone's Remote page has ⏪ RW and FF ⏩");
  const before = (await st(tv)).at;
  await ph.click("#rwBtn");
  await tv.waitForTimeout(600);
  let s = await st(tv);
  check(s.shifted && near(s.at, before - 10, 2.5) && /behind live/.test(s.shuttle), `the phone's ⏪ rewinds the TV 10 s and brings up the bar (${before} → ${s.at})`);
  await ph.waitForFunction(() => /behind live/.test(document.getElementById("shuttleNow").textContent), null, { timeout: 5000 }).catch(() => {});
  check(/10 s|0:10|behind live/.test(await ph.textContent("#shuttleNow")), "…and the phone says how far behind live: " + (await ph.textContent("#shuttleNow")));
  await ph.click("#ffBtn");
  await tv.waitForTimeout(500);
  check((await st(tv)).ff === 2, "the phone's ⏩ fast-forwards at 2×");
  await ph.waitForFunction(() => /⏩ 2×/.test(document.getElementById("shuttleNow").textContent), null, { timeout: 5000 }).catch(() => {});
  check(/⏩ 2×/.test(await ph.textContent("#shuttleNow")) && (await ph.textContent("#playBtn")) === "▶", "…the phone shows ⏩ 2×, and its play button is ▶");
  await ph.click("#playBtn");
  await tv.waitForTimeout(500);
  s = await st(tv);
  check(s.ff === 1 && s.mode === "playing", "…which plays at normal speed (not a pause)");
  await ph.click("#liveBtn");
  await tv.waitForTimeout(1500);
  check(!(await st(tv)).shifted, "the phone's LIVE is back to live");
  await ctx.close();
}

check(!errors.length, "no page errors " + errors.join(" | "));
await browser.close();
site.close();
console.log(failures ? failures + " check(s) failed" : "FAST-FORWARD AND REWIND: ALL GOOD");
process.exit(failures ? 1 : 0);
