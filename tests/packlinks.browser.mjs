// Channel packs with direct links (sources[].urls, packs.js buildLinkPrograms), on the web path:
//   The Pack Builder's example (CH 142 and 143 from Archive items, CH 144 only links) loads through Menu ▸
//   Load a channel pack; CH 144 tunes, is in the guide, and plays both links in turn from their own
//   addresses. A mixed channel rotates Archive programs and links together. A dead link and a YouTube page
//   are left out with the reason (in the "Load these packs?" screen and after loading), and the rest of
//   the channel plays.
//
//   npm install --no-save playwright && node tests/packlinks.browser.mjs

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { makeZip } from "./fixtures/make-zip.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..", "web");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/json" };
const video = await readFile(join(here, "fixtures", "test.mp4"));
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

const BUNNY = "https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4";
const DREAM = "https://archive.org/download/ElephantsDream/ed_1024_512kb.mp4";
const DEAD = "https://files.example.org/films/gone.mp4";
const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const ITEMS = { test_link_a: "Archive Film A", test_link_b: "Archive Film B", test_link_c: "Archive Film C" };
const fetched = [];
async function archive(r) {
  const url = new URL(r.request().url());
  fetched.push(url.href);
  // Every Archive file is the test film (the links' files too).
  if (url.pathname.startsWith("/download/")) return r.fulfill({ status: 302, headers: { location: base + "__media/test.mp4" } });
  const id = url.pathname.replace(/^\/metadata\//, "");
  if (ITEMS[id]) {
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ metadata: { identifier: id, title: ITEMS[id], year: "1950" }, files: [{ name: id + ".mp4", format: "h.264", source: "original", length: "12" }] }), // the test film's length
    });
  }
  return r.fulfill({ status: 404, body: "" });
}

// The Pack Builder's example, in shape, and a second pack with a mixed channel and two bad links.
// minMinutes 0: the test film is a few seconds long.
const builder = {
  pack: "Pack Builder example",
  version: 1,
  channels: [
    { name: "Archive One", number: 142, minMinutes: 0, sources: [{ items: ["test_link_a"] }] },
    { name: "Archive Two", number: 143, minMinutes: 0, sources: [{ items: ["test_link_b"] }] },
    { name: "Open Movies — via URL", number: 144, minMinutes: 0, sources: [{ urls: [BUNNY, DREAM] }] },
  ],
};
const mixed = {
  pack: "Mixed links",
  version: 1,
  channels: [{ name: "Mixed Bag", number: 145, minMinutes: 0, sources: [{ items: ["test_link_a", "test_link_c"] }, { urls: [BUNNY, DEAD, YT] }] }],
};

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => {
  window.NostalGemRelayBrokers = [];
  localStorage.setItem("nostalgem:seenVersion", JSON.stringify("999.0.0"));
});
await ctx.route(/^https:\/\/archive\.org\//, archive);
await ctx.route(/^https:\/\/files\.example\.org\//, (r) => {
  fetched.push(r.request().url());
  return r.fulfill({ status: 404, body: "gone" });
});
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)(?!archive\.org)(?!files\.example\.org)/, (r) => {
  fetched.push(r.request().url());
  return r.abort();
});
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
const choosers = [];
page.on("filechooser", (fc) => choosers.push(fc));
await page.clock.install();
await page.goto(base + "?ch=1");
await page.waitForFunction(() => window.NP && window.NP.state().app === "on", null, { timeout: 15000 });
await page.waitForTimeout(400);
const st = () => page.evaluate(() => window.NP.state());
const dialogText = () => page.evaluate(() => (window.NP.state().overlay === "dialog" ? document.getElementById("dialog").textContent : ""));
const press = (k) => page.keyboard.press(k);
const focused = () => page.evaluate(() => (document.querySelector("#menu .m-item.focus") || {}).textContent || "");

// Menu ▸ Load a channel pack ▸ Choose a file, with this screen's keys.
async function loadFile(name, buffer, mime) {
  for (let i = 0; i < 6 && (await st()).overlay; i++) await press("Escape");
  await press("ArrowRight");
  await page.waitForFunction(() => window.NP.state().overlay === "menu", null, { timeout: 3000 }).catch(() => {});
  for (let i = 0; i < 80 && !/Load a channel pack/.test(await focused()); i++) await press("ArrowDown");
  await press("Enter");
  await page.waitForTimeout(250);
  const before = choosers.length;
  await press("Enter");
  for (let i = 0; i < 30 && choosers.length === before; i++) await page.waitForTimeout(100);
  await choosers[choosers.length - 1].setFiles({ name, mimeType: mime, buffer });
  await page.waitForFunction(() => /Load th/.test(document.getElementById("dialog").textContent), null, { timeout: 8000 }).catch(() => {});
}
async function okAndWait(want) {
  const asked = await dialogText();
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("#dialog button")).find((x) => /^Load/.test(x.textContent.trim()));
    if (b) b.click();
  });
  await page.waitForFunction((w) => w.every((n) => window.NP.programs(n)), want, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
  return asked;
}

// ---------- the Pack Builder's example ----------
const zip = Buffer.from(makeZip([{ name: "builder-example.json", data: JSON.stringify(builder) }]));
await loadFile("builder-example.zip", zip, "application/zip");
let asked = await okAndWait([142, 143, 144]);
check(/Open Movies/.test(asked) && /CH 144/.test(asked) && !/Heads up/.test(asked), "the Pack Builder's example loads clean: " + asked.replace(/\s+/g, " ").slice(0, 140));
const p144 = await page.evaluate(() => window.NP.programs(144));
check(!!p144 && p144.length === 2 && p144.every((p) => p.u) && p144.some((p) => p.u === BUNNY) && p144.some((p) => p.u === DREAM), "CH 144, built only from links, is on the dial with both: " + JSON.stringify((p144 || []).map((p) => p.t)));
check(!!(await page.evaluate(() => window.NP.programs(142))) && !!(await page.evaluate(() => window.NP.programs(143))), "…and CH 142 and 143 from Archive items load beside it");
for (const d of "144") await press(d);
await page.waitForFunction(() => window.NP.state().channel === 144 && window.NP.state().mode === "playing", null, { timeout: 15000 }).catch(() => {});
let s = await st();
let src = await page.evaluate(() => document.querySelector("video.main, #video, video") && document.querySelector("video").getAttribute("src"));
const first = s.link;
check(s.channel === 144 && s.mode === "playing" && [BUNNY, DREAM].includes(first) && (src || "").startsWith(first), `CH 144 tunes and plays a link from its own address (${s.program}, ${s.mode})`);
// Past this program and its break: the other link is on.
await page.clock.fastForward(Math.max(1000, s.slotEnd - (await page.evaluate(() => Date.now())) + 1500));
await page.waitForFunction((f) => window.NP.state().link && window.NP.state().link !== f && window.NP.state().mode === "playing", first, { timeout: 15000 }).catch(() => {});
s = await st();
check([BUNNY, DREAM].includes(s.link) && s.link !== first && s.mode === "playing", `…then the other link, in turn (${s.program})`);
// The guide lists the channel and what's on.
await press("g");
await page.waitForFunction(() => window.NP.state().overlay === "guide", null, { timeout: 3000 }).catch(() => {});
const guide = await page.evaluate(() => document.getElementById("guide").textContent);
check(/Open Movies/.test(guide) && /(Big Buck Bunny|Ed 1024)/.test(guide), "CH 144 is in the guide with its programs");
await press("Escape");

// ---------- a mixed channel, a dead link and a YouTube page ----------
fetched.length = 0;
await loadFile("mixed-links.json", Buffer.from(JSON.stringify(mixed)), "application/json");
asked = await dialogText();
check(/Heads up/.test(asked) && /left out www\.youtube\.com\/watch\?v=dQw4w9WgXcQ — a YouTube page, not a video file/.test(asked), "a YouTube page in urls is flagged on the Load screen: " + (asked.match(/Heads up.*/) || [""])[0].slice(0, 120));
await okAndWait([145]);
await page.waitForFunction(() => /left out/.test(document.getElementById("dialog").textContent), null, { timeout: 15000 }).catch(() => {});
const after = await dialogText();
check(/1 link|2 links/.test(after) && /files\.example\.org\/films\/gone\.mp4 — /.test(after) && /YouTube page/.test(after), "after loading, the TV says which links were left out and why: " + after.replace(/\s+/g, " ").slice(0, 200));
const p145 = await page.evaluate(() => window.NP.programs(145));
check(!!p145 && p145.length === 3 && p145.filter((p) => p.u).length === 1 && p145.filter((p) => !p.u).length === 2, "the mixed channel loads with its Archive films and the good link, the bad ones left out: " + JSON.stringify((p145 || []).map((p) => p.t)));
check(!fetched.some((u) => /youtube/.test(u)), "the YouTube page was never loaded");
check(fetched.some((u) => /files\.example\.org/.test(u)), "the dead link was tried, and left out");
await press("Escape");
for (const d of "145") await press(d);
await page.waitForFunction(() => window.NP.state().channel === 145 && window.NP.state().mode === "playing", null, { timeout: 15000 }).catch(() => {});
s = await st();
check(s.channel === 145 && s.mode === "playing", `the mixed channel plays (${s.program})`);
// Its rotation: the link among the films, both kinds airing on the one schedule.
const kinds = [];
for (let i = 0; i < 4; i++) {
  s = await st();
  kinds.push(s.link ? "link" : "archive");
  await page.clock.fastForward(Math.max(1000, s.slotEnd - (await page.evaluate(() => Date.now())) + 1500));
  await page.waitForFunction((t) => window.NP.state().slotEnd > t && window.NP.state().mode === "playing", s.slotEnd, { timeout: 15000 }).catch(() => {});
}
check(kinds.includes("link") && kinds.includes("archive"), "…and rotates Archive programs and the link together: " + kinds.join(", "));

check(!errors.length, "no page errors " + errors.join(" | "));
await browser.close();
site.close();
console.log(failures ? failures + " check(s) failed" : "PACKS WITH DIRECT LINKS: ALL GOOD");
process.exit(failures ? 1 : 0);
