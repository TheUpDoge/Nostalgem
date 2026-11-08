// Real-browser smoke test. Serves web/, opens it in Chromium at TV size and drives it the way a remote
// would: arrow keys, OK, Back, number keys. The Internet Archive is stood in for by small local files,
// so this needs no network.
//
//   npm run test:browser              (needs Playwright: npm i --no-save playwright && npx playwright install chromium)
//   SHOTS=1 npm run test:browser      also saves screenshots to tests/shots/

import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..", "web");
const fixtures = join(here, "fixtures");
const shotsDir = join(here, "shots");
const SHOTS = !!process.env.SHOTS;
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

// Programs are served like archive.org serves them: with byte ranges, so the player can seek.
async function serveMedia(req, res, file, type) {
  const body = await readFile(file);
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
  if (!m) return res.writeHead(200, { "content-type": type, "content-length": body.length, "accept-ranges": "bytes" }).end(body);
  const start = m[1] ? Number(m[1]) : 0;
  const end = m[2] ? Math.min(Number(m[2]), body.length - 1) : body.length - 1;
  res
    .writeHead(206, { "content-type": type, "content-length": end - start + 1, "content-range": `bytes ${start}-${end}/${body.length}`, "accept-ranges": "bytes" })
    .end(body.subarray(start, end + 1));
}

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path === "/__media/test.mp4") return serveMedia(req, res, join(fixtures, "test.mp4"), "video/mp4");
  if (path === "/__media/test.mp3") return serveMedia(req, res, join(fixtures, "test.mp3"), "audio/mpeg");
  const file = normalize(join(web, path === "/" ? "index.html" : path));
  if (!file.startsWith(web)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}`;

const problems = [];
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) problems.push(what);
};

const vtt = await readFile(join(fixtures, "test.vtt"));
const thumb = await readFile(join(web, "icons/icon-192.png"));

// Stand-in for archive.org. `failing` makes every program download fail, to test the stand-by card.
const fake = { failing: false, downloads: 0 };
async function archive(route) {
  const url = new URL(route.request().url());
  const p = url.pathname;
  if (p.startsWith("/download/")) {
    fake.downloads++;
    if (fake.failing) return route.fulfill({ status: 503, body: "busy" });
    // archive.org answers /download/ with a redirect to a storage server; so does this.
    return route.fulfill({ status: 302, headers: { location: base + (/\.mp3$/i.test(p) ? "/__media/test.mp3" : "/__media/test.mp4") } });
  }
  if (p.startsWith("/cors/")) return route.fulfill({ status: 200, contentType: "text/vtt", headers: { "access-control-allow-origin": "*" }, body: vtt });
  if (p.startsWith("/services/img/")) return route.fulfill({ status: 200, contentType: "image/png", body: thumb });
  if (p === "/advancedsearch.php") {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ response: { numFound: 1, docs: [{ identifier: "test_rodeo", title: "Test Rodeo" }] } }),
    });
  }
  if (p === "/metadata/test_rodeo") {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        metadata: { identifier: "test_rodeo", title: "Test Rodeo", year: "1951", description: "A rodeo made for testing." },
        files: [
          { name: "rodeo1.mpeg", format: "MPEG2", source: "original", length: "620" },
          { name: "rodeo1.mp4", format: "h.264", source: "derivative", original: "rodeo1.mpeg", length: "620.4" },
          { name: "rodeo2.mpeg", format: "MPEG2", source: "original", length: "700" },
          { name: "rodeo2.mp4", format: "h.264", source: "derivative", original: "rodeo2.mpeg", length: "701" },
        ],
      }),
    });
  }
  return route.fulfill({ status: 404, body: "" });
}

const browser = await chromium.launch();
const errors = [];
try {
  // One context for the TV and, later, the phone: the fake PeerJS links pages within a context.
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.addInitScript({ path: join(fixtures, "fake-peer.js") });
  // No relay here: tests/relay.browser.mjs covers it with a local broker.
  await ctx.addInitScript(() => {
    window.NostalGemRelayBrokers = [];
    // A channel built by typing 777 into Search (a remote with no number buttons), as older versions did.
    if (!localStorage.getItem("nostalgem:custom")) {
      const junk = { slug: "u-777-abc", number: 30, name: "777", tagline: "Your search: 777", icon: "📡", color: "#ff2a6d", kind: "video", items: [{ id: "x777", f: "x.mp4", t: "Junk", d: 60 }], custom: true };
      localStorage.setItem("nostalgem:custom", JSON.stringify([junk]));
    }
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await page.route(/^https:\/\/archive\.org\//, archive);
  // The stand-in programs are 12 seconds long, so line every channel up to start its first program at
  // the epoch and freeze the clock 3 seconds in: every channel is then mid-program, on the air.
  const lineup = JSON.parse(await readFile(join(web, "data/lineup.json"), "utf8"));
  for (const c of lineup.channels) c.offset = 0;
  // A YouTube channel whose first video refuses to embed, so the tuner has to skip it.
  lineup.channels.push({
    number: 99,
    sub: 1,
    slug: "yt-test",
    name: "Test Toons",
    tagline: "YouTube test channel",
    icon: "🤖",
    color: "#05d9e8",
    kind: "video",
    offset: 0,
    items: [
      { id: "yt:badvideo001", f: "yt", t: "Won't Embed", d: 12 },
      { id: "yt:usblocked01", f: "yt", t: "Not Here Mecha", d: 12, r: "-USCA" },
      { id: "yt:mecha000001", f: "yt", t: "Test Mecha", d: 12 },
    ],
  });
  // …and a second sub-channel under the same number, 99-2.
  lineup.channels.push({ number: 99, sub: 2, slug: "yt-test-2", name: "Test Magic", tagline: "Sub-channel test", icon: "✨", color: "#ff71ce", kind: "video", offset: 0, items: [{ id: "yt:magic000001", f: "yt", t: "Test Magic", d: 12 }] });
  // 99-3: nothing on it will play here (a region lock on the whole channel). 99-4: YouTube refuses the page.
  const blocked = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: "yt:badregion00" + n, f: "yt", t: "Blocked " + n, d: 12 }));
  lineup.channels.push({ number: 99, sub: 3, slug: "yt-test-3", name: "Test Locked", tagline: "Region lock test", icon: "🔒", color: "#b967ff", kind: "video", offset: 0, items: blocked });
  lineup.channels.push({ number: 99, sub: 4, slug: "yt-test-4", name: "Test Refused", tagline: "Embed refusal test", icon: "⛔", color: "#ff2a6d", kind: "video", offset: 0, items: [{ id: "yt:cfgvideo0001", f: "yt", t: "Refused", d: 12 }] });
  // 99-5: YouTube runs an ad before the show.
  lineup.channels.push({ number: 99, sub: 5, slug: "yt-test-5", name: "Test Ads", tagline: "Pre-roll ad test", icon: "📺", color: "#ffb86b", kind: "video", offset: 0, items: [{ id: "yt:advideo00001", f: "yt", t: "Behind An Ad", d: 12 }] });
  // 99-10: a two-digit sub-channel, so 9 9 1 has to wait a beat for a possible 0.
  lineup.channels.push({ number: 99, sub: 10, slug: "yt-test-10", name: "Test Ten", tagline: "Two-digit sub-channel test", icon: "🔟", color: "#05d9e8", kind: "video", offset: 0, items: [{ id: "yt:tenvideo0001", f: "yt", t: "Test Ten", d: 12 }] });
  const fakeYouTube = await readFile(join(fixtures, "fake-youtube.js"), "utf8");
  await page.route("https://www.youtube.com/iframe_api", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: fakeYouTube }));
  await page.route(base + "/data/lineup.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(lineup) }));
  await page.clock.setFixedTime(new Date(Date.parse(lineup.epoch) + 3000));
  await page.goto(base + "/?ch=1", { waitUntil: "load" });
  const state = () => page.evaluate(() => window.NP && window.NP.state());
  const key = async (k, wait) => {
    await page.keyboard.press(k);
    await page.waitForTimeout(wait == null ? 250 : wait);
  };
  if (SHOTS) await mkdir(shotsDir, { recursive: true });
  const shot = async (name) => SHOTS && page.screenshot({ path: join(shotsDir, name + ".png") });

  await page.waitForFunction(() => window.NP && window.NP.state().app === "on", null, { timeout: 15000 });
  let st = await state();
  check(st.channels >= 20, `lineup loaded (${st.channels} channels)`);
  check(st.channel === 1 && st.name === "High Noon", `starts on CH 01 High Noon (got CH ${st.channel} ${st.name})`);

  // Headless Chromium may hold autoplay until a key press: the TV shows "press OK to turn on".
  await page.waitForTimeout(800);
  st = await state();
  if (st.mode === "gesture") {
    check(await page.isVisible("#card.card-gesture"), "autoplay blocked: shows PRESS OK TO TURN ON");
    await key("Enter", 600);
  }
  await page.waitForFunction(() => window.NP.state().mode === "playing", null, { timeout: 15000 }).catch(() => {});
  st = await state();
  check(st.mode === "playing", `CH 01 is on the air (${st.mode}: ${st.program})`);
  await page.waitForTimeout(1200);
  const t = await page.evaluate(() => document.getElementById("screen").currentTime);
  check(t > 3, `joined in progress and the picture is moving (at ${t.toFixed(2)}s, live point 3s)`);
  check(await page.isVisible("#banner"), "tuning in shows the info banner");
  check((await page.textContent("#banner")).includes("High Noon"), "banner names the channel");
  check((await page.textContent("#banner")).includes(st.program), "banner names the program");
  await shot("1-banner");
  await key("Enter", 300);
  check(!(await page.isVisible("#banner")), "OK hides the banner");
  check(await page.isVisible("#bug"), "the channel logo shows while watching");
  await key("Enter", 300);
  check(await page.isVisible("#banner"), "OK shows it again");

  // Channel up, then number entry.
  await key("ArrowUp", 900);
  st = await state();
  check(st.channel === 2, `▲ goes to CH 02 (got ${st.channel} ${st.name})`);
  await key("1", 120);
  await key("2", 900);
  st = await state();
  check(st.channel === 12, `typing 1 2 tunes CH 12 (got ${st.channel} ${st.name})`);
  await key("ArrowDown", 900);
  st = await state();
  check(st.channel === 11, `▼ goes to CH 11 (got ${st.channel})`);

  // Guide.
  await key("ArrowLeft", 400);
  check((await state()).overlay === "guide", "◀ opens the guide");
  const rows = await page.$$eval(".g-row", (r) => r.length);
  check(rows >= 3, `guide shows ${rows} channel rows`);
  check((await page.$$eval(".g-cell.focus", (c) => c.length)) === 1, "one program is focused");
  await key("ArrowRight", 250);
  const later = await page.textContent(".g-detail");
  check(/\d:\d\d/.test(later), "▶ moves to a later program with its start time");
  await shot("2-guide");
  await key("ArrowDown", 250);
  await key("ArrowDown", 250);
  await key("Enter", 900);
  st = await state();
  check(st.overlay === "" && st.channel === 13, `OK in the guide tunes CH 13 (got ${st.channel}, overlay "${st.overlay}")`);

  // Menu: CRT effect.
  await key("ArrowRight", 400);
  check((await state()).overlay === "menu", "▶ opens the menu");
  await shot("3-menu");
  let crtFound = false;
  for (let i = 0; i < 25 && !crtFound; i++) {
    const label = await page.textContent(".m-item.focus .l");
    if (/CRT/.test(label)) crtFound = true;
    else await key("ArrowDown", 80);
  }
  check(crtFound, "menu reaches CRT effect with ▼");
  // The menu refreshes every 2 s; it must not jump while it does (it used to snap to the top and slide back).
  await page.waitForTimeout(400);
  const steady = await page.evaluate(
    () =>
      new Promise((done) => {
        const sc = document.querySelector("#menu .m-scroll");
        const seen = new Set();
        const t0 = performance.now();
        (function look() {
          const now = document.querySelector("#menu .m-scroll");
          seen.add(now === sc ? getComputedStyle(now).transform : "replaced");
          if (performance.now() - t0 < 4500) requestAnimationFrame(look);
          else done(Array.from(seen));
        })();
      })
  );
  check(steady.length === 1 && steady[0] !== "none" && steady[0] !== "replaced", `the scrolled menu holds still while it refreshes (${steady.join(", ")})`);
  await key("ArrowRight", 200);
  check(await page.evaluate(() => document.getElementById("tv").classList.contains("crt-heavy")), "▶ on CRT effect turns it to Heavy");
  await key("ArrowLeft", 200);
  await key("Escape", 300);
  check((await state()).overlay === "", "Back closes the menu");

  // Radio channel.
  await key("4", 2200); // 4 waits a moment in case it's the start of 420
  st = await state();
  check(st.channel === 4, `CH 04 is ${st.name}`);
  await page.waitForFunction(() => !document.getElementById("radio").hidden, null, { timeout: 8000 }).catch(() => {});
  check(await page.isVisible("#radio .onair"), "radio channel shows ON THE AIR");
  await shot("4-radio");

  // Pause and back to live.
  await page.waitForFunction(() => window.NP.state().mode === "playing", null, { timeout: 8000 }).catch(() => {});
  await key(" ", 400);
  st = await state();
  check(st.mode === "paused" && st.shifted, "Space pauses (time-shifted)");
  await key("l", 800);
  st = await state();
  check(!st.shifted, "L goes back to live");

  // A YouTube channel: the first video won't embed and is skipped; the next one joins in progress.
  await key("9", 120);
  await key("9", 300);
  check((await page.textContent("#osd")).includes("99-"), "typing 9 9 waits for a sub-channel digit (shows CH 99-)");
  await page.waitForTimeout(1700); // no third digit: the first sub-channel
  await page.waitForFunction(() => window.NP.state().program === "Test Mecha" && window.NP.state().mode === "playing", null, { timeout: 8000 }).catch(() => {});
  st = await state();
  check(st.label === "99-1" && st.mode === "playing" && st.program === "Test Mecha", `9 9 tunes the first sub-channel, 99-1, and its YouTube video plays (${st.label} ${st.mode}: ${st.program})`);
  const ytLog = await page.evaluate(() => (window.__yt ? window.__yt.log : []));
  check(ytLog.some((l) => l.id === "badvideo001") && ytLog.some((l) => l.id === "mecha000001"), "a video that won't embed is skipped (" + ytLog.map((l) => l.id).join(", ") + ")");
  check(!ytLog.some((l) => l.id === "usblocked01"), "a video blocked in this TV's country is never even tried");
  const mecha = ytLog.filter((l) => l.id === "mecha000001").pop();
  check(mecha && mecha.start === 3, `the YouTube video joins in progress (starts at ${mecha && mecha.start}s, live point 3s)`);
  check((await page.isVisible("#yt")) && !(await page.isVisible("#screen")), "the YouTube player is on screen instead of the <video>");
  const vars = await page.evaluate(() => window.__yt.players[0].vars);
  check(vars.origin === base && /^http/.test(vars.widget_referrer), "the embed says where it lives (origin and referrer)");
  await key(" ", 400);
  check((await state()).mode === "paused" && (await page.evaluate(() => window.__yt.players[0].state)) === 2, "pause pauses the YouTube video");
  await key("l", 800);
  st = await state();
  check(!st.shifted && st.mode === "playing", "back to live on YouTube");
  await shot("4b-youtube");
  if (await page.isVisible("#banner")) await key("Enter", 300);
  await page.waitForTimeout(2100);
  check((await page.textContent("#bug")).includes("99-1"), "the channel logo shows 99-1");
  await key("ArrowUp", 900);
  check((await state()).label === "99-2", `▲ from 99-1 goes to 99-2 (got ${(await state()).label})`);
  await key("9", 100);
  await key("9", 100);
  await key("1", 100);
  await key("0", 900);
  check((await state()).label === "99-10", `typing 9 9 1 0 tunes the two-digit sub-channel 99-10 (got ${(await state()).label})`);
  await key("9", 100);
  await key("9", 100);
  await key("1", 600);
  check((await page.textContent("#osd")).includes("99-1"), "typing 9 9 1 waits a beat for a possible 99-10 (shows CH 99-1)");
  await page.waitForTimeout(1500);
  check((await state()).label === "99-1", `…then tunes 99-1 (got ${(await state()).label})`);
  await key("ArrowLeft", 500);
  const rowLabels = await page.$$eval(".g-row", (r) => r.map((x) => x.textContent));
  check(rowLabels.some((t) => t.includes("99-1")) && rowLabels.some((t) => t.includes("99-2")), "the guide lists 99-1 and 99-2");
  await shot("4c-guide-subchannels");
  await key("Escape", 300);

  // A whole channel that won't play here: it gives up after a few and says why, instead of cycling.
  await key("9", 100);
  await key("9", 100);
  await key("3", 300);
  await page.waitForFunction(() => window.NP.state().mode === "empty", null, { timeout: 10000 }).catch(() => {});
  const lockedTries = (await page.evaluate(() => window.__yt.log)).filter((l) => /^badregion/.test(l.id)).length;
  check((await state()).mode === "empty", `a channel where nothing will play here stops trying (mode ${(await state()).mode}, tried ${lockedTries} of 8)`);
  const lockedCard = await page.textContent("#card");
  check(/NO SIGNAL/.test(lockedCard) && /not in this country/.test(lockedCard), "…and its card says why: " + lockedCard.replace(/\s+/g, " ").slice(0, 160));
  await shot("4d-youtube-locked");
  // YouTube refusing the page is about YouTube, not the program: stand by, and don't skip the program.
  await key("9", 100);
  await key("9", 100);
  await key("4", 300);
  await page.waitForFunction(() => window.NP.state().mode === "standby", null, { timeout: 10000 }).catch(() => {});
  check((await state()).mode === "standby" && /won't play videos inside this page/.test(await page.textContent("#card")), "YouTube refusing the page shows stand-by with that reason");
  const badList = await page.evaluate(() => localStorage.getItem("nostalgem:bad") || "");
  check(badList.includes("badregion001") && !badList.includes("cfgvideo0001"), "programs that can't play here are skipped for a day; one YouTube refused isn't");
  // The problems list remembers each one and why.
  await key("ArrowRight", 300);
  await page.click('#menu .m-item:has-text("Playback problems")');
  await page.waitForTimeout(300);
  const probs = await page.textContent("#dialog");
  check(/Playback problems/.test(probs) && /Won't Embed/.test(probs) && /Blocked 1/.test(probs) && /error 153/.test(probs), "Menu ▸ Playback problems lists what didn't play and why");
  await shot("4e-problems");
  await key("Escape", 300);

  // A pre-roll ad: no "press OK" card, the ad is muted behind a stand-by card, OK doesn't restart it.
  await key("9", 100);
  await key("9", 100);
  await key("5", 300);
  await page.waitForFunction(() => window.NP.state().mode === "adbreak", null, { timeout: 10000 }).catch(() => {});
  check((await state()).mode === "adbreak" && (await page.isVisible("#card.card-adbreak")), "an ad ahead of a YouTube show gets the ad-break card, not PRESS OK: " + (await page.textContent("#card")).trim().slice(0, 80));
  check(await page.evaluate(() => window.__yt.players[0].muted), "…and the ad is muted");
  const adLoads = (await page.evaluate(() => window.__yt.log)).filter((l) => l.id === "advideo00001").length;
  await key("Enter", 300);
  check((await page.evaluate(() => window.__yt.log)).filter((l) => l.id === "advideo00001").length === adLoads, "OK during the ad doesn't load the video again (which would restart the ad)");
  await page.waitForFunction(() => window.NP.state().mode === "playing", null, { timeout: 10000 }).catch(() => {});
  check((await state()).mode === "playing" && !(await page.isVisible("#card.card-adbreak")), "when the ad is done the show starts by itself");
  check(!(await page.evaluate(() => window.__yt.players[0].muted)), "…with its sound on");

  // Find a show: every channel is searched, and OK plays it from the start, off the schedule.
  await key("ArrowRight", 300);
  for (let i = 0; i < 25; i++) {
    const label = await page.textContent(".m-item.focus .l");
    if (/Find a show/.test(label)) break;
    await key("ArrowDown", 60);
  }
  await key("Enter", 300);
  check((await state()).overlay === "dialog" && (await page.textContent("#dialog")).includes("Find a show"), "Menu ▸ Find a show opens a search");
  await page.keyboard.type("mecha");
  await key("Enter", 200); // to the Find button
  await key("Enter", 400); // Find
  check((await state()).overlay === "menu" && (await page.textContent("#menu")).includes("Test Mecha") && (await page.textContent("#menu")).includes("CH 99-1"), "it lists the program and its channel");
  check(!(await page.textContent("#menu")).includes("Not Here Mecha"), "a YouTube program blocked in this TV's country (" + (await state()).country + ") isn't on the schedule");
  await shot("4f-find");
  await key("Enter", 1500); // watch it
  st = await state();
  check(st.label === "99-1" && st.program === "Test Mecha" && st.shifted, `OK watches it from the start (${st.label} ${st.program}, shifted: ${st.shifted})`);
  const onDemand = (await page.evaluate(() => window.__yt.log)).pop();
  check(onDemand && onDemand.id === "mecha000001" && onDemand.start === 0, "…from 0:00 (" + JSON.stringify(onDemand) + ")");
  check((await page.textContent("#banner")).includes("ON DEMAND"), "the banner says ON DEMAND");
  await key("l", 800);
  check(!(await state()).shifted, "L goes back to the schedule");

  // On a YouTube channel, SVG filters run on a see-through layer above the player (browsers won't
  // filter another site's page directly).
  {
    const { LOOKS } = await import("../web/js/looks.js");
    const pop = LOOKS.findIndex((l) => l.id === "pop-red");
    for (let i = 0; i < pop; i++) await key("v", 60);
    await page.waitForTimeout(400);
    const bd = await page.evaluate(() => {
      const el = document.querySelector(".lookbd");
      const cs = getComputedStyle(el);
      return { display: cs.display, filter: cs.backdropFilter || cs.webkitBackdropFilter || "", yt: getComputedStyle(document.getElementById("yt")).filter };
    });
    check(bd.display === "block" && /ng-look-pop-red/.test(bd.filter) && bd.yt === "none", "Sin City on a YouTube channel filters the player through the backdrop layer (" + JSON.stringify(bd) + ")");
    for (let i = pop; i < LOOKS.length; i++) await key("v", 60);
  }

  await key("4", 2200); // 4 waits a moment in case it's the start of 420
  check((await page.isVisible("#screen")) && !(await page.isVisible("#yt")), "leaving YouTube puts the <video> back");

  // Add a channel from a search (the Archive is faked).
  await key("ArrowRight", 300);
  for (let i = 0; i < 25; i++) {
    const label = await page.textContent(".m-item.focus .l");
    if (/Add a channel/.test(label)) break;
    await key("ArrowDown", 60);
  }
  await key("Enter", 300);
  check((await page.textContent("#menu")).includes("Quick add"), "Add a channel lists quick-add channels");
  await key("Enter", 300); // Search the Archive…
  check((await state()).overlay === "dialog", "Search opens a dialog");
  await page.keyboard.type("rodeo");
  await key("Enter", 200); // to the first button
  await key("Enter", 2500); // Make a TV channel
  st = await state();
  check(st.channel >= 30 && /Rodeo/.test(st.name), `a new channel was built and tuned (CH ${st.channel} ${st.name})`);
  check(st.program === "Test Rodeo", `it plays the search result (${st.program})`);
  // Ambience (lo-fi vinyl) stops outright when the TV app goes to the background, and comes back after.
  {
    await key("ArrowRight", 300);
    for (let i = 0; i < 60; i++) {
      const label = await page.textContent(".m-item.focus .l");
      if (/Ambience/.test(label)) break;
      await key("ArrowDown", 40);
    }
    await key("ArrowRight", 600); // ▶ the first ambience: lo-fi vinyl
    await key("Escape", 200);
    await key("Escape", 200);
    await page.waitForTimeout(800);
    let amb = (await state()).ambience;
    check(amb.mode === "lofi" && amb.on, `Menu ▸ Ambience ▶ turns on lo-fi vinyl (${JSON.stringify(amb)})`);
    await page.evaluate(() => window.NP.suspend());
    await page.waitForTimeout(300);
    amb = (await state()).ambience;
    check(!amb.on && amb.audio !== "running", `…and it goes quiet when the TV app goes to the background (${JSON.stringify(amb)})`);
    await page.evaluate(() => window.NP.resume());
    await page.waitForTimeout(1200);
    amb = (await state()).ambience;
    check(amb.on, `…and comes back with the app (${JSON.stringify(amb)})`);
    await key("ArrowRight", 300);
    for (let i = 0; i < 60; i++) {
      const label = await page.textContent(".m-item.focus .l");
      if (/Ambience/.test(label)) break;
      await key("ArrowDown", 40);
    }
    await key("ArrowLeft", 400); // back to off
    await key("Escape", 200);
    await key("Escape", 200);
  }
  // A channel number typed into Search tunes it; it doesn't build a channel called "15-2".
  {
    const before = st.channels;
    await key("ArrowRight", 300);
    for (let i = 0; i < 25; i++) {
      const label = await page.textContent(".m-item.focus .l");
      if (/Add a channel/.test(label)) break;
      await key("ArrowDown", 60);
    }
    await key("Enter", 300);
    await key("Enter", 300); // Search the Archive…
    await page.keyboard.type("15-2");
    await key("Enter", 200);
    await key("Enter", 1200); // Make a TV channel
    st = await state();
    check(st.label === "15-2" && st.channels === before && st.overlay === "", `typing 15-2 into Search tunes CH 15-2 (${st.label} ${st.name}, ${st.channels} channels, overlay "${st.overlay}")`);
    const customs = await page.evaluate(() => JSON.parse(localStorage.getItem("nostalgem:custom") || "[]").map((c) => c.name));
    check(!customs.includes("777"), "a channel an older version built from a search for 777 is gone (" + customs.join(", ") + ")");
  }

  // Mix with: a second, color filter. ▶ on its row picks the first one; ◀ goes back to nothing.
  {
    await key("ArrowRight", 300);
    for (let i = 0; i < 50; i++) {
      const label = await page.textContent(".m-item.focus .l");
      if (/Mix with/.test(label)) break;
      await key("ArrowDown", 40);
    }
    await key("ArrowRight", 300);
    const mixed = await page.evaluate(() => getComputedStyle(document.getElementById("tv")).getPropertyValue("--look"));
    check(/grayscale/.test(mixed) && /Black & white/.test(await page.textContent(".m-item.focus")), "Menu ▸ Mix with ▶ puts Black & white on top (" + mixed.trim() + ")");
    await key("ArrowLeft", 300);
    check(!(await page.evaluate(() => document.getElementById("tv").classList.contains("look-on"))), "…and ◀ takes it off again");
    await key("Escape", 200);
    await key("Escape", 200);
  }

  // The number pad, for remotes without number buttons: arrows and OK only. 1, 5, 2 → GO tunes CH 15-2.
  {
    await key("ArrowRight", 300);
    for (let i = 0; i < 40; i++) {
      const label = await page.textContent(".m-item.focus .l");
      if (/Number pad/.test(label)) break;
      await key("ArrowDown", 40);
    }
    await key("Enter", 300);
    check(await page.isVisible("#numpad .np-key.focus"), "Menu ▸ Number pad opens the keypad");
    await key("Enter", 120); // 1
    await key("ArrowDown", 60);
    await key("ArrowRight", 60);
    await key("Enter", 120); // 5
    check((await page.textContent("#numpad .np-num")).trim() === "15", "…typing 1 5 with arrows and OK (" + (await page.textContent("#numpad .np-num")).trim() + ")");
    await key("ArrowUp", 60);
    await key("Enter", 200); // 2: CH 15-2 is complete, so focus moves to GO
    const focused = (await page.textContent("#numpad .np-key.focus")).trim();
    check(/GO/.test(focused) && /15-2/.test(await page.textContent("#numpad .np-name")), "…then 2: it shows CH 15-2 and moves to GO (" + (await page.textContent("#numpad .np-name")) + ")");
    await shot("4i-numpad");
    await key("Enter", 1500);
    st = await state();
    check(!(await page.isVisible("#numpad")) && st.label === "15-2", `…and GO tunes it (CH ${st.label})`);
  }

  // Picture filters: V steps through them; SVG ones draw on the program; all the way round is Off again.
  {
    const { LOOKS } = await import("../web/js/looks.js");
    await key("v", 400);
    check((await page.evaluate(() => document.getElementById("tv").classList.contains("look-on"))) && (await page.textContent("#toast")).includes(LOOKS[1].name), `V turns on the first filter (${LOOKS[1].name})`);
    const ascii = LOOKS.findIndex((l) => l.id === "ascii");
    for (let i = 1; i < ascii; i++) await key("v", 60);
    await page.waitForTimeout(1200);
    const cv = await page.evaluate(() => {
      const c = document.querySelector(".fxcv");
      return { shown: !!c && !c.hidden, w: c ? c.width : 0, screen: getComputedStyle(document.getElementById("screen")).filter };
    });
    check(cv.shown && cv.w >= 512 && cv.screen === "none" && (await page.$("#looks filter#ng-band-1")) !== null, "…and ASCII is drawn on its canvas over the program (" + JSON.stringify(cv) + ")");
    await shot("4h-ascii");
    for (let i = ascii; i < LOOKS.length; i++) await key("v", 60);
    await page.waitForTimeout(300);
    check(!(await page.evaluate(() => document.getElementById("tv").classList.contains("look-on"))) && (await page.evaluate(() => document.querySelector(".fxcv").hidden)), "…and pressing V all the way round turns filters off");
  }

  // Two Sin City looks mixed keep both colors; Filter quality ▸ Light runs an SVG look on a small canvas.
  {
    const { LOOKS, mixable } = await import("../web/js/looks.js");
    const menuTo = async (re) => {
      await key("ArrowRight", 300);
      for (let i = 0; i < 60; i++) {
        if (re.test(await page.textContent(".m-item.focus .l"))) return;
        await key("ArrowDown", 40);
      }
    };
    const pop = LOOKS.findIndex((l) => l.id === "pop-red");
    for (let i = 0; i < pop; i++) await key("v", 60);
    const mixes = LOOKS.filter((l) => l.id === "off" || mixable(l));
    const blue = mixes.findIndex((l) => l.id === "pop-blue");
    await menuTo(/Mix with/);
    for (let i = 0; i < blue; i++) await key("ArrowRight", 40);
    await page.waitForTimeout(300);
    const both = await page.evaluate(() => getComputedStyle(document.getElementById("tv")).getPropertyValue("--look").trim());
    check(both === "url(#ng-look-pop-red-blue)" && (await page.$("#looks filter#ng-look-pop-red-blue")) !== null, "Sin City · red mixed with Sin City · blue is one filter keeping both colors (" + both + ")");
    await key("ArrowDown", 40);
    while (!/Filter quality/.test(await page.textContent(".m-item.focus .l"))) await key("ArrowDown", 40);
    await key("ArrowRight", 100); // Full
    await key("ArrowRight", 300); // Light
    await key("Escape", 200);
    await key("Escape", 200);
    // Tune in again: the 12-second stand-in program may have run out by now.
    for (const d of "152") await key(d, 120);
    await page.waitForFunction(() => window.NP.state().mode === "playing", null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(900);
    const lite = await page.evaluate(() => {
      const c = document.querySelector(".fxcv");
      return { shown: !!c && !c.hidden, w: c ? c.width : 0, screen: getComputedStyle(document.getElementById("screen")).filter, look: window.NP.state().look };
    });
    check(lite.look.lite && lite.shown && lite.w === 640 && lite.screen === "none", "Filter quality ▸ Light draws the filter on a small canvas, not over the whole screen (" + JSON.stringify(lite) + ")");
    await shot("4j-sincity-light");
    await menuTo(/Filter quality/);
    await key("ArrowRight", 300); // Auto
    check(!(await state()).look.lite && (await state()).look.quality === "auto", "…and Auto is the full version again until this TV proves too slow for it");
    await key("ArrowUp", 40);
    while (!/Mix with/.test(await page.textContent(".m-item.focus .l"))) await key("ArrowUp", 40);
    for (let i = 0; i < blue; i++) await key("ArrowLeft", 40);
    await key("Escape", 200);
    await key("Escape", 200);
    for (let i = pop; i < LOOKS.length; i++) await key("v", 60);
    await page.waitForTimeout(300);
    check((await state()).look.id === "off" && (await state()).look.mix === "off", "…filters back off (" + JSON.stringify((await state()).look) + ")");
  }

  // The hidden link-out stations: tuned by number only; a card with a link and a QR code; not in the guide.
  for (const [num, name, word] of [
    ["420", "South Park", "SOUTH PARK"],
    ["555", "ASCII City", "ASCII CITY"],
    ["777", "RetroGames.cc", "RETROGAMES.CC"],
  ]) {
    for (const d of num) await key(d, 120);
    await page.waitForFunction((n) => window.NP.state().name === n, name, { timeout: 5000 }).catch(() => {});
    st = await state();
    check(st.name === name && (await page.textContent("#card")).includes(word), `CH ${num} shows the ${name} card (got ${st.name})`);
    await page.waitForSelector("#card .link-qr svg", { timeout: 5000 }).catch(() => {});
    check(await page.isVisible("#card .link-qr svg"), `…with a QR code so a phone can open it`);
    await page.waitForTimeout(800);
    check(!(await page.evaluate(() => document.getElementById("static").classList.contains("on"))) && !(await page.isVisible("#banner")), "…and the snow and the last channel's banner clear off it");
    await shot("4g-link-" + num);
  }
  await key("g", 600);
  const guideText = await page.textContent("#guide");
  check((await state()).overlay === "guide" && !/South Park|RetroGames|ASCII City/.test(guideText), "the guide doesn't list the hidden stations");
  await key("Escape", 300);

  // Mouse and touch: a big channel rocker and a dock; 123 on the dock opens the number pad.
  {
    await key("1", 120);
    await key("2", 2200);
    await page.mouse.move(400, 300);
    await page.waitForTimeout(300);
    check((await page.isVisible("#touch .t-rocker")) && (await page.isVisible("#touch .t-dock")), "moving the mouse shows the channel rocker and the dock");
    const sizes = await page.$$eval("#touch button", (bs) => bs.map((b) => Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height)));
    check(Math.min(...sizes) >= 52, "…and every button is big enough for a finger (" + sizes.map(Math.round).join(", ") + ")");
    await page.click('#touch [data-act="chup"]');
    await page.waitForTimeout(900);
    check((await state()).channel === 13, `the rocker's ▲ changes channel (CH ${(await state()).label})`);
    await page.click('#touch [data-act="numpad"]');
    await page.waitForTimeout(200);
    check(await page.isVisible("#numpad .np-box"), "…123 on the dock opens the number pad");
    await page.mouse.click(30, 30);
    await page.waitForTimeout(200);
    check(!(await page.isVisible("#numpad .np-box")), "…and a tap beside the pad closes it");
  }

  // A game controller: the poller starts when a pad connects, and its D-pad changes channel.
  await key("1", 120);
  await key("2", 2200);
  const padFrom = (await state()).channel;
  await page.evaluate(() => {
    const pad = { connected: true, id: "Test Pad", buttons: Array.from({ length: 17 }, () => ({ pressed: false })), axes: [0, 0, 0, 0] };
    window.__pad = pad;
    navigator.getGamepads = () => [pad];
    const ev = new Event("gamepadconnected");
    ev.gamepad = pad;
    window.dispatchEvent(ev);
  });
  await page.evaluate(() => (window.__pad.buttons[12].pressed = true));
  await page.waitForTimeout(200);
  await page.evaluate(() => (window.__pad.buttons[12].pressed = false));
  await page.waitForTimeout(1200);
  const padTo = (await state()).channel;
  check(padFrom === 12 && padTo !== 12, `a controller's D-pad changes channel (CH ${padFrom} → CH ${padTo})`);

  // Outage: every download fails, so after a few tries the TV stands by.
  fake.failing = true;
  await key("7", 300);
  await page.waitForFunction(() => window.NP.state().mode === "standby", null, { timeout: 20000 }).catch(() => {});
  check((await state()).mode === "standby", "an Archive outage shows TECHNICAL DIFFICULTIES");
  check((await page.textContent("#card")).includes("STAND BY"), "stand-by card says PLEASE STAND BY");
  await page.waitForTimeout(700);
  check(!(await page.evaluate(() => document.getElementById("static").classList.contains("on"))), "the snow clears so the stand-by card shows");
  await shot("5-standby");
  fake.failing = false;

  // Help, then Back twice.
  await key("h", 300);
  check((await state()).overlay === "dialog" && (await page.textContent("#dialog")).includes("Remote buttons"), "H shows the remote help");
  await key("Escape", 200);
  check((await state()).overlay === "", "Back closes help");

  // Clicking a menu row that opens a dialog must leave the dialog open (the click used to fall through
  // to the picture and press OK on the dialog's first button, closing it at once).
  await key("ArrowRight", 300);
  await page.click('#menu .m-item:has-text("Phone remote")');
  await page.waitForTimeout(400);
  check((await state()).overlay === "dialog", "clicking Phone remote with the mouse keeps its dialog open");
  await key("Escape", 300);

  // Phone remote: pair through the menu, then drive the TV from a second page acting as the phone.
  await key("ArrowRight", 300);
  for (let i = 0; i < 25; i++) {
    const label = await page.textContent(".m-item.focus .l");
    if (/Phone remote/.test(label)) break;
    await key("ArrowDown", 60);
  }
  await key("Enter", 400);
  await page.waitForSelector("#dialog .pair-qr svg", { timeout: 5000 }).catch(() => {});
  check(await page.isVisible("#dialog .pair-qr svg"), "Menu ▸ Phone remote shows a QR code");
  await page.waitForFunction(() => window.NP.state().phone.status === "ready", null, { timeout: 5000 }).catch(() => {});
  st = await state();
  check(st.phone.on && st.phone.status === "ready", `the TV is waiting for a phone (${st.phone.status})`);
  const shownCode = (await page.textContent("#dialog .pair-code")).replace("-", "");
  check(shownCode === st.phone.code && /^[2-9A-Z]{6}$/.test(shownCode), `it shows the pairing code (${shownCode})`);
  check((await page.textContent("#dialog")).includes("theupdoge.github.io/Nostalgem/remote"), "it shows the published remote's address");
  await shot("8-pairing");

  const phone = await ctx.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  phone.on("pageerror", (e) => errors.push("phone: " + e.message));
  phone.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("phone: " + m.text());
  });
  await phone.goto(base + "/remote.html#" + st.phone.code, { waitUntil: "load" });
  const pst = () => phone.evaluate(() => window.NGRemote.state());
  const tap = async (sel, wait) => {
    await phone.click(sel);
    await phone.waitForTimeout(wait == null ? 300 : wait);
  };
  await phone.waitForFunction(() => window.NGRemote.state().status === "connected", null, { timeout: 8000 }).catch(() => {});
  check((await pst()).status === "connected", "the phone connects with the code from the QR link");
  await page.waitForTimeout(300);
  check((await page.textContent("#dialog .d-status")).includes("1 phone connected"), "the TV says a phone connected");
  st = await state();
  await phone.waitForFunction(() => window.NGRemote.state().tv && window.NGRemote.state().channels > 10, null, { timeout: 4000 }).catch(() => {});
  check((await phone.textContent("#now .now-num")) === "CH " + String(st.channel).padStart(2, "0"), "the phone shows the channel that's on");
  check((await phone.textContent("#now .now-title")).length > 2, "the phone shows the program title");
  await shot("9-pairing-connected");
  if (SHOTS) await phone.screenshot({ path: join(shotsDir, "p1-remote.png") });

  await tap('[data-key="back"]');
  check((await state()).overlay === "", "phone Back closes the TV's dialog");
  const before = (await state()).channel;
  await tap('[data-key="chup"]', 900);
  st = await state();
  check(st.channel !== before, `phone CH ▲ changes the channel (${before} → ${st.channel})`);
  await phone.waitForTimeout(600);
  check((await phone.textContent("#now .now-num")) === "CH " + String(st.channel).padStart(2, "0"), "the phone follows the new channel");
  await tap("#padBtn", 150);
  await tap('[data-digit="1"]', 120);
  await tap('[data-digit="2"]', 900);
  check((await state()).channel === 12, `phone number pad 1 2 tunes CH 12 (got ${(await state()).channel})`);
  await tap('[data-key="right"]', 300);
  check((await state()).overlay === "menu", "phone ▶ opens the TV menu");
  await tap('[data-key="back"]', 300);

  await tap('[data-tab="channels"]', 200);
  const rowCount = await phone.$$eval("#chList [data-slug]", (r) => r.length);
  check(rowCount >= 20, `the phone lists ${rowCount} channels`);
  if (SHOTS) await phone.screenshot({ path: join(shotsDir, "p2-channels.png") });
  // The row whose label reads 05 (sub-channels like 3-2 sit between the numbers, so don't count rows).
  const fifth = await phone.$$eval("#chList [data-slug]", (rows) => {
    const row = rows.filter((r) => r.querySelector(".cn").textContent.trim() === "05")[0];
    return row ? row.getAttribute("data-slug") : "";
  });
  await tap('#chList [data-slug="' + fifth + '"]', 1000);
  st = await state();
  check(st.channel === 5, `tapping a channel on the phone tunes it (CH ${st.channel})`);
  await phone.waitForTimeout(500);
  check((await phone.getAttribute("#chList .cur", "data-slug")) === fifth, "the phone highlights the channel that's on");

  await tap('[data-tab="search"]', 200);
  await phone.fill("#searchInput", "mecha");
  await tap('#searchForm [data-kind="find"]', 700);
  check((await state()).overlay === "menu" && (await page.textContent("#menu")).includes("Find: mecha"), "Find a show typed on the phone lists what it found on the TV");
  check(await phone.isVisible("#remote"), "…and the phone switches to the remote to pick one");
  await tap('[data-key="back"]', 300);
  await tap('[data-tab="search"]', 200);
  await phone.fill("#searchInput", "rodeo");
  await tap('#searchForm [data-kind="video"]', 2500);
  st = await state();
  check(st.channel >= 30 && /Rodeo/.test(st.name), `a search typed on the phone builds a channel on the TV (CH ${st.channel} ${st.name})`);
  await phone.waitForTimeout(600);
  check((await phone.textContent("#searchMsg")).includes("Now on CH " + st.channel), "the phone says where it landed");
  if (SHOTS) await phone.screenshot({ path: join(shotsDir, "p3-search.png") });

  await page.evaluate(() => window.__fakeBroker.dropAll());
  await page.waitForTimeout(200);
  check((await pst()).status !== "connected", "the phone notices when the link drops");
  await phone.waitForFunction(() => window.NGRemote.state().status === "connected", null, { timeout: 8000 }).catch(() => {});
  check((await pst()).status === "connected", "and reconnects by itself");
  await tap('[data-tab="remote"]', 200);
  await tap('[data-key="mute"]', 400);
  check(await page.evaluate(() => document.getElementById("screen").muted), "phone mute works after reconnecting");
  await tap('[data-key="mute"]', 300);
  const phoneOverflow = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!phoneOverflow, "the phone remote has no sideways scrolling");
  await phone.close();

  // Phone, held upright.
  await page.setViewportSize({ width: 390, height: 844 });
  await key("1", 1200);
  await key("Enter", 400);
  await shot("6-phone");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, "no sideways scrolling on a phone");

  // Android TV WebView size (960x540 CSS pixels at 2x).
  await page.setViewportSize({ width: 960, height: 540 });
  await key("ArrowLeft", 500);
  await shot("7-guide-540");
  const fits = await page.evaluate(() => {
    const g = document.querySelector(".g-rows");
    return g && g.scrollHeight <= g.clientHeight + 2;
  });
  check(fits, "guide rows fit a 960x540 TV viewport");
  await key("Escape", 200);

  // The TV app (?tv=android) asks the website for the daily lineup, keeps a copy, and falls back to it
  // (or to the lineup inside the APK) when offline.
  const published = JSON.parse(JSON.stringify(lineup));
  published.built = new Date(Date.parse(lineup.built || "2026-01-01T00:00:00Z") + 86400000).toISOString();
  published.format = 2;
  published.channels.push(Object.assign({}, published.channels[0], { number: 29, slug: "fresh-from-web", name: "Fresh From The Web" }));
  const appPage = async (liveRoute) => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push("app: " + e.message));
    await p.route(/^https:\/\/archive\.org\//, archive);
    await p.route(base + "/data/lineup.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(lineup) }));
    await p.route(/^https:\/\/theupdoge\.github\.io\/Nostalgem\/data\/lineup\.json/, liveRoute);
    await p.goto(base + "/?tv=android&ch=1", { waitUntil: "load" });
    await p.waitForFunction(() => window.NP && window.NP.state().app === "on", null, { timeout: 15000 });
    return p;
  };
  let tvApp = await appPage((r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(published) }));
  const viaWeb = await tvApp.evaluate(() => window.NP.state());
  await tvApp.close();
  tvApp = await appPage((r) => r.abort());
  const viaSaved = await tvApp.evaluate(() => window.NP.state());
  await tvApp.evaluate(() => caches.delete("ng-lineup"));
  await tvApp.close();
  tvApp = await appPage((r) => r.abort());
  const viaApp = await tvApp.evaluate(() => window.NP.state());
  await tvApp.close();
  check(viaWeb.lineup.source === "web" && viaWeb.lineup.built === published.built, `the TV app uses the published lineup (${viaWeb.lineup.source}, built ${viaWeb.lineup.built})`);
  check(viaWeb.channels === viaApp.channels + 1, `…which has the channel the app's own lineup lacks (${viaWeb.channels} vs ${viaApp.channels})`);
  check(viaSaved.lineup.source === "saved" && viaSaved.channels === viaWeb.channels, `offline, it uses the copy it saved (${viaSaved.lineup.source}, ${viaSaved.channels} channels)`);
  check(viaApp.lineup.source === "bundled", `with no copy, the lineup inside the app (${viaApp.lineup.source})`);

  check(errors.length === 0, "no script errors" + (errors.length ? ": " + errors.join(" | ") : ""));
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  console.error(`\n${problems.length} check(s) failed`);
  process.exit(1);
}
console.log("\nall browser checks passed");
