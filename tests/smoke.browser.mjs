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
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await page.route(/^https:\/\/archive\.org\//, archive);
  // The stand-in programs are 12 seconds long, so line every channel up to start its first program at
  // the epoch and freeze the clock 3 seconds in: every channel is then mid-program, on the air.
  const lineup = JSON.parse(await readFile(join(web, "data/lineup.json"), "utf8"));
  for (const c of lineup.channels) c.offset = 0;
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
  await key("ArrowRight", 200);
  check(await page.evaluate(() => document.getElementById("tv").classList.contains("crt-heavy")), "▶ on CRT effect turns it to Heavy");
  await key("ArrowLeft", 200);
  await key("Escape", 300);
  check((await state()).overlay === "", "Back closes the menu");

  // Radio channel.
  await key("4", 1500);
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
