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
// The Reading Room's books: a 7-page book, a two-volume manga (5 and 4 pages), and one the Archive only lends.
const BOOKS = {
  test_book: { md: { identifier: "test_book", title: "Test Book", creator: "Carroll, Lewis, 1832-1898", date: "1911", imagecount: "7", description: "A book made for testing." }, vols: { test_book: 7 } },
  // The manga's volumes sit in a folder with brackets and braces in its name, its pages come straight from
  // its own server, and it has no page-number files: the scan's page list counts its pages.
  test_manga: { md: { identifier: "test_manga", title: "MANGA: Test Manga", collection: ["manga_library"] }, server: "ia800001.us.archive.org", dir: "/1/items/test_manga", scandata: true, vols: { "!Test [grp]{HD}/Test Manga v01 (Digital) (grp)": 5, "!Test [grp]{HD}/Test Manga v02 (Digital) (grp)": 4 } },
  test_lent: { md: { identifier: "test_lent", title: "Lent Book", "access-restricted-item": "true" }, vols: { test_lent: 9 } },
};
const json = (route, body) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
// A portrait page that shows its own number, so a screenshot shows the order. 404 past the end.
function pageImage(route, id, vol, n) {
  const book = BOOKS[id];
  const pages = book && book.vols[vol];
  fake.pages = (fake.pages || 0) + 1;
  if (!pages || n >= pages) return route.fulfill({ status: 404, body: "" });
  const k = n + 1;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#f4ecd8"/><rect x="40" y="60" width="520" height="300" fill="hsl(${k * 47},55%,60%)"/><text x="300" y="560" font-size="160" text-anchor="middle" font-family="serif" fill="#3a2a18">${k}</text><text x="300" y="820" font-size="36" text-anchor="middle" font-family="serif" fill="#6b5634">${id} · page ${k}</text></svg>`;
  return route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg });
}
// Stand-in for an item's own server, where page images come from.
async function itemServer(route) {
  const url = new URL(route.request().url());
  if (url.pathname !== "/BookReader/BookReaderImages.php") return route.fulfill({ status: 404, body: "" });
  const id = url.searchParams.get("id");
  const book = BOOKS[id];
  const page = /^n(\d+)(?:_w\d+)?\.jpg$/.exec(url.searchParams.get("page") || "");
  if (!book || !page || url.searchParams.get("itemPath") !== book.dir || url.searchParams.get("server") !== url.hostname) return route.fulfill({ status: 404, body: "" });
  fake.direct = (fake.direct || 0) + 1;
  return pageImage(route, id, url.searchParams.get("subPrefix") || id, Number(page[1]));
}
async function archive(route) {
  const url = new URL(route.request().url());
  const p = url.pathname;
  const page = /^\/download\/([^/]+)\/(?:(.+)\/)?page\/n(\d+)(?:_w\d+)?\.jpg$/.exec(p);
  if (page) return pageImage(route, page[1], page[2] ? decodeURIComponent(page[2]) : page[1], Number(page[3]));
  const numbers = /^\/cors\/([^/]+)\/(.+)_(page_numbers\.json|scandata\.xml)$/.exec(p);
  if (numbers) {
    const book = BOOKS[numbers[1]];
    const n = book && book.vols[decodeURIComponent(numbers[2])];
    const xml = numbers[3] === "scandata.xml";
    if (!n || xml !== !!book.scandata) return route.fulfill({ status: 404, body: "" });
    if (xml) {
      const pages = Array.from({ length: n + 1 }, (_, i) => `<page leafNum="${i}"><addToAccessFormats>${i === n ? "false" : "true"}</addToAccessFormats></page>`).join("");
      return route.fulfill({ status: 200, contentType: "text/xml", headers: { "access-control-allow-origin": "*" }, body: `<book><bookData><leafCount>${n + 1}</leafCount></bookData><pageData>${pages}</pageData></book>` });
    }
    return json(route, { pages: Array.from({ length: n }, (_, i) => ({ leafNum: i + 1, pageNumber: i < 2 ? "" : String(i - 1) })) });
  }
  const meta = /^\/metadata\/(test_book|test_manga|test_lent)$/.exec(p);
  if (meta) {
    const book = BOOKS[meta[1]];
    return json(route, { server: book.server, dir: book.dir, metadata: book.md, files: Object.keys(book.vols).map((v) => ({ name: v + "_jp2.zip" })) });
  }
  if (p === "/advancedsearch.php" && /mediatype:texts/.test(url.searchParams.get("q") || "")) {
    return json(route, { response: { numFound: 3, docs: Object.values(BOOKS).map((b) => ({ identifier: b.md.identifier, title: b.md.title, creator: b.md.creator, date: b.md.date })) } });
  }
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
    localStorage.setItem("nostalgem:seenVersion", JSON.stringify("999.0.0")); // no What's new page in the way
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
  await page.route(/^https:\/\/ia800001\.us\.archive\.org\//, itemServer);
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
  // The secret stations that play: 069 Bible Boys Church (a leading 0 waits for the rest), 666 Dead Air.
  for (const d of "069") await key(d, 150);
  await page.waitForFunction(() => window.NP.state().station === "bible-boys-church", null, { timeout: 5000 }).catch(() => {});
  st = await state();
  check(st.station === "bible-boys-church" && st.channel === 69 && st.intro && /BIBLE BOYS CHURCH/.test(await page.textContent("#intro")) && /You typed 69/.test(await page.textContent("#intro")), `0 6 9 tunes Bible Boys Church, with its card (CH ${st.channel} ${st.name})`);
  await page.waitForTimeout(800);
  await shot("4r-bbc");
  await key("Enter", 300);
  check(!(await state()).intro, "…any button skips the card");
  await page.waitForTimeout(1500);
  await key(" ", 300);
  check(/Pausing the sermon/.test(await page.textContent("#toast")), "pausing the sermon gets a look: " + (await page.textContent("#toast")));
  await key(" ", 300);
  for (const d of "666") await key(d, 150);
  await page.waitForFunction(() => window.NP.state().station === "dead-air", null, { timeout: 5000 }).catch(() => {});
  st = await state();
  check(st.station === "dead-air" && st.channel === 666 && /NOT ASSIGNED/.test(await page.textContent("#intro")) && (await page.evaluate(() => document.getElementById("tv").classList.contains("station-dead-air"))), `6 6 6 tunes Dead Air, with its card and its red glow (CH ${st.channel} ${st.name})`);
  await page.waitForTimeout(800);
  await shot("4s-dead-air");
  await page.waitForTimeout(5400);
  check((await page.isVisible("#banner")) && /6:66/.test(await page.textContent("#banner .b-clock")), "…then the banner, where the clock reads " + (await page.textContent("#banner .b-clock")));
  await key("1", 120);
  await key("2", 2200);
  check(!(await page.evaluate(() => document.getElementById("tv").classList.contains("station-dead-air"))) && /here when you get back/.test(await page.textContent("#toast")), "leaving Dead Air takes the glow away, with a parting word");
  await key("g", 600);
  const guideText = await page.textContent("#guide");
  check((await state()).overlay === "guide" && !/South Park|RetroGames|ASCII City|Bible Boys|Dead Air/.test(guideText), "the guide doesn't list the hidden stations");
  await key("Escape", 300);

  // Mouse and touch: a big channel rocker and a dock; 123 on the dock opens the number pad.
  {
    await key("1", 120);
    await key("2", 2200);
    await page.mouse.move(400, 300);
    await page.waitForTimeout(300);
    check((await page.isVisible("#touch .t-rocker")) && (await page.isVisible("#touch .t-dock")), "moving the mouse shows the channel rocker and the dock");
    const sizes = await page.$$eval("#touch button", (bs) => bs.filter((b) => b.offsetParent).map((b) => Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height)));
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

  // The Video Club: sign for a library card, check out two tapes, a third has to wait, rewind and return.
  {
    const dialogText = () => page.textContent("#dialog");
    const btn = async (re, wait) => {
      await page.locator("#dialog .d-btn", { hasText: re }).first().click();
      await page.waitForTimeout(wait == null ? 300 : wait);
    };
    const toClub = async () => {
      for (let i = 0; i < 6 && (await state()).overlay; i++) await key("Escape", 150);
      await key("ArrowRight", 300);
      await page.click('#menu .m-item:has-text("Video Club")');
      await page.waitForTimeout(300);
    };
    await toClub();
    const clubMenu = await page.textContent("#menu");
    check(/Get a library card/.test(clubMenu) && /Shelves/.test(clubMenu) && /New this week/.test(clubMenu), "Menu ▸ 📼 Video Club has shelves of tapes and offers a library card");
    await page.click('#menu .m-item:has-text("Get a library card")');
    await page.waitForTimeout(300);
    check(/1\/3/.test(await dialogText()) && /two tapes/.test(await dialogText()), "…signing up starts with how the club works (1/3)");
    await btn(/Next/);
    check(/2\/3/.test(await dialogText()) && /non-profit library/.test(await dialogText()), "…then what the Internet Archive is (2/3)");
    await btn(/Next/);
    const fine = await dialogText();
    check(/3\/3/.test(fine) && /not an archive\.org account/.test(fine) && /terms of use/.test(fine) && (await page.isVisible("#dialog input")), "…then the fine print, with a line to sign (3/3)");
    await btn(/I agree/);
    check(/Sign with your name/.test(await page.textContent("#dialog .d-status")), "…no card without a signature");
    await page.fill("#dialog input", "Marty McFly");
    await btn(/I agree/);
    st = await state();
    check(st.club.card === "Marty McFly" && /Welcome to the club/.test(await dialogText()) && /NG \d{4} \d{4} \d{4}/.test(await dialogText()), "…signed: a library card with a number, in the member's name");
    await shot("4k-library-card");
    await btn(/Close/);

    const checkOutTape = async (i) => {
      await toClub();
      await page.click('#menu .m-item:has-text("New this week")');
      await page.waitForTimeout(300);
      const title = (await page.textContent("#menu .m-item[data-i='" + i + "'] .l")).trim();
      await page.click("#menu .m-item[data-i='" + i + "']");
      await page.waitForTimeout(300);
      return title;
    };
    const first = await checkOutTape(0);
    check(/Check out/.test(await dialogText()) && (await page.$("#dialog .club-art img")) !== null, `a tape's box (${first}) has its cover and ⏏ Check out & play`);
    await shot("4l-tape-box");
    await btn(/Check out/, 2000);
    st = await state();
    check(st.club.loans.length === 1 && !!st.club.tape && st.shifted && st.program === first, `checked out, it plays off the schedule (${st.program}, ${st.mode})`);
    const second = await checkOutTape(1);
    await btn(/Check out/, 1500);
    st = await state();
    check(st.club.loans.length === 2 && st.program === second && st.club.loans[0].pos > 0 && st.club.loans[0].pos < 30, `a second tape; the first one keeps its place (${JSON.stringify(st.club.loans)})`);
    await checkOutTape(2);
    check(/2 tapes out/.test(await dialogText()) && !(await page.locator("#dialog .d-btn", { hasText: /Check out/ }).count()), "a third tape has to wait: two at a time");
    await btn(/Close/);
    await key("Escape", 200);
    await key("Escape", 200);
    await key("Escape", 200);

    // Return the first one: it has been played, so it needs rewinding first.
    await toClub();
    await page.click('#menu .m-item:has-text("📼 ' + first.replace(/"/g, '\\"') + '")');
    await page.waitForTimeout(300);
    await btn(/Return/);
    check(/Be kind, rewind/.test(await page.textContent("#dialog .d-status")), "returning a played tape: Be kind, rewind!");
    await btn(/Rewind/, 600);
    check((await page.isVisible("#rewind .rw-reel")) && /REWIND/.test(await page.textContent("#rewind")), "◀◀ Rewind shows the reels spinning back and the counter running down");
    await shot("4m-rewind");
    await page.waitForFunction(() => document.getElementById("rewind").hidden && document.querySelector("#dialog .d-btn.focus"), null, { timeout: 8000 }).catch(() => {});
    check(/Return/.test(await page.textContent("#dialog .d-btn.focus")), "…then the box comes back with ⏏ Return ready");
    await key("Enter", 400);
    st = await state();
    check(st.club.loans.length === 1 && st.club.returned === 1 && st.club.loans[0].t === second, `…and it's back on the shelf: one tape out (${JSON.stringify(st.club)})`);
    await key("Escape", 200);
    await key("Escape", 200);
    await key("Escape", 200);
    await key("l", 800);
  }

  // The Reading Room: borrow a book on the library card, turn its pages two at a time, a manga right to
  // left, volumes, the end of the book, a book the Archive only lends, and returning one.
  {
    const dialogText = () => page.textContent("#dialog");
    const btn = async (re, wait) => {
      await page.locator("#dialog .d-btn", { hasText: re }).first().click();
      await page.waitForTimeout(wait == null ? 300 : wait);
    };
    const reading = async () => (await state()).reader;
    const toShelf = async () => {
      for (let i = 0; i < 6 && (await state()).overlay; i++) await key("Escape", 150);
      await key("ArrowRight", 300);
      await page.click('#menu .m-item:has-text("Reading Room")');
      await page.waitForTimeout(400);
      await page.click('#menu .m-item:has-text("🗾 Manga")');
      await page.waitForFunction(() => /Lent Book/.test(document.getElementById("menu").textContent), null, { timeout: 5000 }).catch(() => {});
    };
    await toShelf();
    check(/Test Book/.test(await page.textContent("#menu")) && /Test Manga/.test(await page.textContent("#menu")), "Menu ▸ 📚 Reading Room ▸ a shelf lists books from the Archive");
    await page.click('#menu .m-item:has-text("Test Book")');
    await page.waitForFunction(() => /Borrow/.test(document.getElementById("dialog").textContent), null, { timeout: 5000 }).catch(() => {});
    const box = await dialogText();
    check(/Lewis Carroll/.test(box) && /1911/.test(box) && /Borrow & read/.test(box) && (await page.$("#dialog .bk-cover img")) !== null, "a book's box: cover, author, year and ⏏ Borrow & read");
    await shot("4n-book-box");
    const pagesBefore = fake.pages || 0;
    await btn(/Borrow/, 1200);
    let rd = await reading();
    check(rd.open && rd.id === "test_book" && rd.two && JSON.stringify(rd.view) === "[0]" && rd.count === 7 && (await state()).mode === "off", `borrowed, it opens on its cover, alone, and the TV channel pauses (${JSON.stringify(rd)}, TV ${(await state()).mode})`);
    check((fake.pages || 0) > pagesBefore, "…the pages come from the Archive's page images");
    await key("ArrowRight", 700);
    rd = await reading();
    check(JSON.stringify(rd.view) === "[1,2]" && (await page.$$("#reader .rd-page.ok")).length === 2, `▶ turns to two pages side by side, like an open book (${JSON.stringify(rd.view)})`);
    await shot("4o-reader-spread");
    await key("5", 100);
    check(/Go to page 5/.test(await page.textContent("#reader .rd-osd")), "typing a number shows Go to page 5");
    await page.waitForTimeout(1700);
    rd = await reading();
    check(rd.view.includes(4), `…and goes to page 5 (${JSON.stringify(rd.view)}, counter ${await page.textContent("#reader .rd-folio")})`);
    const beforeTap = (await reading()).p;
    await page.mouse.click(1850, 540);
    await page.waitForTimeout(500);
    rd = await reading();
    check(rd.p > beforeTap && !rd.controls, `tapping the right edge turns the page, and only that (${beforeTap} → ${rd.p}, settings ${rd.controls ? "open" : "closed"})`);
    await page.mouse.click(960, 540);
    await page.waitForTimeout(300);
    check((await reading()).controls, "…tapping the middle opens the reader's settings");
    await page.mouse.click(960, 540);
    await page.waitForTimeout(300);
    for (let i = 0; i < 4 && !(await reading()).end; i++) await key("ArrowRight", 500);
    check((await reading()).end && /THE END/.test(await page.textContent("#reader .rd-end")) && (await reading()).p === 5, "past the last pages (6–7): THE END");
    await key("Enter", 1200);
    st = await state();
    check(!st.reader.open && st.mode !== "off", `OK closes the book and the TV comes back on (${st.mode})`);
    check(st.club.books.length === 1 && st.club.books[0].mark && st.club.books[0].mark.p === 5, "…with a bookmark where it was left: " + JSON.stringify(st.club.books));

    // A manga: right to left, two volumes.
    await toShelf();
    await page.click('#menu .m-item:has-text("Test Manga")');
    await page.waitForFunction(() => /Borrow/.test(document.getElementById("dialog").textContent), null, { timeout: 5000 }).catch(() => {});
    check(/right to left/.test(await dialogText()) && /2 volumes/.test(await dialogText()), "a manga's box says it reads right to left, and has 2 volumes");
    await btn(/Borrow/, 1200);
    rd = await reading();
    check(rd.open && rd.rtl && rd.count === 5 && (fake.direct || 0) > 0 && (await page.$$("#reader .rd-page.ok")).length > 0, `the manga opens right to left, pages straight from its server, counted from its scan list (${JSON.stringify(rd)}, ${fake.direct || 0} direct)`);
    await key("ArrowLeft", 700);
    rd = await reading();
    const order = await page.$$eval("#reader .rd-page", (f) => f.map((x) => Number(x.getAttribute("data-k"))));
    check(JSON.stringify(rd.view) === "[1,2]" && JSON.stringify(order) === "[2,1]", `◀ turns a manga forward, and its pages sit right to left (on screen: ${JSON.stringify(order)})`);
    await shot("4p-reader-manga");
    await key("Enter", 300);
    check((await reading()).controls && /Volume/.test(await page.textContent("#reader .rd-controls")), "OK opens the reader's settings, with the volume");
    for (let i = 0; i < 8 && !/Volume/.test(await page.textContent("#reader .rd-c-item.focus")); i++) await key("ArrowDown", 80);
    await key("ArrowRight", 900);
    rd = await reading();
    check(rd.v === 1 && rd.p === 0 && rd.count === 4, `…▶ on Volume goes to volume 2 (${JSON.stringify(rd)})`);
    await key("Escape", 200);
    await key("Escape", 900);
    check(!(await reading()).open, "BACK closes the settings, then the book");

    // One the Archive only lends: no borrowing here, a code to open it on archive.org instead.
    await toShelf();
    await page.click('#menu .m-item:has-text("Lent Book")');
    await page.waitForFunction(() => /only lends/.test(document.getElementById("dialog").textContent), null, { timeout: 5000 }).catch(() => {});
    check(/only lends/.test(await dialogText()) && !(await page.locator("#dialog .d-btn", { hasText: /Borrow/ }).count()) && (await page.$("#dialog .link-qr")) !== null, "a book the Archive only lends can't be borrowed here: it has a code to open it on archive.org");
    await btn(/Close/);

    // Returning a book.
    for (let i = 0; i < 6 && (await state()).overlay; i++) await key("Escape", 150);
    await key("ArrowRight", 300);
    await page.click('#menu .m-item:has-text("Reading Room")');
    await page.waitForTimeout(300);
    await page.click('#menu .m-item:has-text("📖 Test Book")');
    await page.waitForFunction(() => /Return/.test(document.getElementById("dialog").textContent), null, { timeout: 5000 }).catch(() => {});
    check(/DATE DUE/.test(await dialogText()) && /bookmark at page \d/.test(await dialogText()), "a borrowed book's box has its stamped due date and the bookmark");
    await shot("4q-book-due");
    await btn(/Return/, 400);
    st = await state();
    check(st.club.books.length === 1 && st.club.books[0].id === "test_manga", "⏏ Return puts it back: one book out (" + JSON.stringify(st.club.books.map((b) => b.id)) + ")");
    for (let i = 0; i < 6 && (await state()).overlay; i++) await key("Escape", 150);
    await key("l", 800);
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
