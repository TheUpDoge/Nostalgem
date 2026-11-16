// Box sets in the Video Club (library.js seriesShelves / checkOutBox / nextEpisode, main.js openBox /
// playBox): a whole series checked out as one loan.
//   Menu ▸ Video Club ▸ Box sets lists the series on the series channels. A box set's slipcase checks it
//   out and plays episode 1 off the schedule; when an episode ends the next one starts by itself; changing
//   channel keeps the place, which survives a restart, and the box resumes there. One box set at a time,
//   apart from the tapes. Return puts it back on the shelf from wherever the viewer got to.
//
//   npm install --no-save playwright && node tests/boxsets.browser.mjs

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..", "web");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/json" };
const video = await readFile(join(here, "fixtures", "test.mp4")); // 12 s: one "episode"
// Rerun City (CH 11) carries two short series: four episodes of one, three of the other.
const lineup = JSON.parse(await readFile(join(web, "data", "lineup.json"), "utf8"));
const rerun = lineup.channels.find((c) => c.slug === "rerun-city");
const ep = (show, n) => ({ id: "test_" + show.replace(/\W/g, "") + "_" + n, f: "e" + n + ".mp4", t: show + " - Episode " + n + " (1954)", d: 12, y: 1954 });
rerun.items = [ep("Test Show", 3), ep("Other Show", 1), ep("Test Show", 1), ep("Test Show", 4), ep("Other Show", 2), ep("Test Show", 2), ep("Other Show", 3)];
const site = createServer(async (q, s) => {
  const path = new URL(q.url, "http://x").pathname;
  if (path === "/__media/test.mp4") {
    // Byte ranges, as the Archive serves them, so a resumed episode can start part-way.
    const range = /bytes=(\d+)-(\d*)/.exec(q.headers.range || "");
    if (range) {
      const a = Number(range[1]);
      const b = range[2] ? Number(range[2]) : video.length - 1;
      return s.writeHead(206, { "content-type": "video/mp4", "content-range": `bytes ${a}-${b}/${video.length}`, "content-length": b - a + 1, "accept-ranges": "bytes" }).end(video.subarray(a, b + 1));
    }
    return s.writeHead(200, { "content-type": "video/mp4", "content-length": video.length, "accept-ranges": "bytes" }).end(video);
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

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => {
  window.NostalGemRelayBrokers = [];
  localStorage.setItem("nostalgem:seenVersion", JSON.stringify("999.0.0"));
  // A member already (the sign-up is the smoke test's): only on the first load, so the box set survives a reload.
  if (!localStorage.getItem("nostalgem:library")) {
    localStorage.setItem("nostalgem:library", JSON.stringify({ card: { name: "Test Member", number: "NG 1234 5678 9012", issued: 1, terms: 1 }, loans: [], history: [], books: [], marks: {} }));
  }
});
await ctx.route(/^https:\/\/archive\.org\//, (r) => r.fulfill({ status: 302, headers: { location: base + "__media/test.mp4" } }));
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)(?!archive\.org)/, (r) => r.abort());
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(base + "?ch=1");
await page.waitForFunction(() => window.NP && window.NP.state().app === "on" && window.NP.state().mode === "playing", null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(400);
const st = () => page.evaluate(() => window.NP.state());
const key = async (k, wait) => {
  await page.keyboard.press(k);
  await page.waitForTimeout(wait == null ? 200 : wait);
};
const dialogText = () => page.textContent("#dialog");
const btn = async (re, wait) => {
  await page.locator("#dialog .d-btn", { hasText: re }).first().click();
  await page.waitForTimeout(wait == null ? 400 : wait);
};
const toClub = async () => {
  for (let i = 0; i < 6 && (await st()).overlay; i++) await key("Escape", 150);
  await key("ArrowRight", 300);
  await page.click('#menu .m-item:has-text("Video Club")');
  await page.waitForTimeout(300);
};
const toBox = async (show) => {
  await toClub();
  await page.click('#menu .m-item:has-text("Box sets: whole series")');
  await page.waitForTimeout(300);
  await page.click(`#menu .m-item:has-text("${show}")`);
  await page.waitForTimeout(400);
};

// ---------- the shelf ----------
await toClub();
let menuText = await page.textContent("#menu");
check(/Your box set · 0 of 1/.test(menuText) && /Box sets: whole series\s*\d+ sets/.test(menuText), "Menu ▸ Video Club has a Box sets shelf, and a place for your box set");
await page.click('#menu .m-item:has-text("Box sets: whole series")');
await page.waitForTimeout(300);
menuText = await page.textContent("#menu");
check(/Rerun City/.test(menuText) && /Test Show\s*4 episodes/.test(menuText) && /Other Show\s*3 episodes/.test(menuText) && /1 at a time, 7 days/.test(menuText), "…listing the series by channel, with their episode counts: " + menuText.replace(/\s+/g, " ").slice(0, 160));
await page.click('#menu .m-item:has-text("Test Show")');
await page.waitForTimeout(400);
let d = await dialogText();
check((await page.$("#dialog .boxset .bs-case")) !== null && (await page.$("#dialog .club-sleeve")) === null && /THE BOX SET/.test(d) && /4 EPISODES/.test(d), "a box set has its own slipcase, not a tape box");
check(/1\. Episode 1/.test(d) && /2\. Episode 2/.test(d) && /doesn't count against your 2 tapes/.test(d), "…its episodes in order, and the loan's terms");

// ---------- check out: episode 1, then 2 by itself ----------
await btn(/Check out & play/, 1200);
let s = await st();
check(s.club.boxes.length === 1 && s.club.box && /Test Show - Episode 1/.test(s.program) && s.shifted && s.channel === 11, `checked out, it plays episode 1 off the schedule, on its channel (${s.program}, CH ${s.channel})`);
await page.waitForFunction(() => /Episode 2/.test(window.NP.state().program) && window.NP.state().mode === "playing", null, { timeout: 30000 }).catch(() => {});
s = await st();
check(/Test Show - Episode 2/.test(s.program) && s.club.boxes[0].ep === 1 && /Next: episode 2 of 4/.test(await page.textContent("#toast")), `when episode 1 ends, episode 2 starts by itself (${s.program})`);
await page.waitForTimeout(7000); // the place is saved every 5 s
s = await st();
const at = s.club.boxes[0].pos;
check(at >= 3, `…and the box keeps its place as it plays (episode 2 at ${at} s)`);

// ---------- leave, restart, resume ----------
await key("PageUp", 1500);
s = await st();
check(!s.club.box && !s.shifted && s.club.boxes[0].ep === 1 && s.club.boxes[0].pos >= at, `changing channel takes the box set off the screen and keeps its place (episode 2 at ${s.club.boxes[0].pos} s)`);
const kept = s.club.boxes[0].pos;
await page.reload();
await page.waitForFunction(() => window.NP && window.NP.state().app === "on", null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(600);
s = await st();
check(s.club.boxes.length === 1 && s.club.boxes[0].ep === 1 && s.club.boxes[0].pos === kept, "…and the place is still there after a restart");
await toClub();
menuText = await page.textContent("#menu");
check(/Your box set · 1 of 1/.test(menuText) && /📦 Test Show\s*episode 2 of 4 at 0:\d\d · due back in 7 days/.test(menuText) && /Your tapes · 0 of 2/.test(menuText), "the Club shows the box set out, where it's at and when it's due, and the tapes still free: " + (menuText.match(/📦 Test Show[^📼]*/) || [""])[0].slice(0, 80));
await page.click('#menu .m-item:has-text("📦 Test Show")');
await page.waitForTimeout(400);
d = await dialogText();
check(/Resume episode 2 at 0:\d\d/.test(d) && /Skip to episode 3/.test(d) && /Back to episode 1/.test(d) && /Return box set/.test(d) && (await page.$("#dialog .bs-spines i.seen")) !== null && (await page.$("#dialog .bs-spines i.now")) !== null, "its slipcase offers Resume episode 2, skip on, back to 1, and return, with episode 1 ticked off");
await btn(/Resume episode 2/, 1200);
s = await st();
check(/Test Show - Episode 2/.test(s.program) && s.at >= kept - 1.5 && s.club.box, `Resume plays episode 2 from where it was left (${s.at} s, left at ${kept} s)`);

// ---------- one at a time ----------
await toBox("Other Show");
d = await dialogText();
check(/You have a box set out \(Test Show\)/.test(d) && !/Check out & play/.test(d) && /Your box set/.test(d), "a second box set has to wait: one out at a time");
await key("Escape");

// ---------- the last episode, and returning ----------
await toBox("📦 Test Show".slice(2));
await btn(/Skip to episode 3/, 400);
await btn(/Play episode 3/, 1200);
await page.waitForFunction(() => /Episode 4/.test(window.NP.state().program), null, { timeout: 30000 }).catch(() => {});
await page.waitForFunction(() => window.NP.state().club.boxes[0] && window.NP.state().club.boxes[0].done, null, { timeout: 30000 }).catch(() => {});
s = await st();
check(s.club.boxes[0].done && !s.club.box && !s.shifted && /last episode of Test Show/.test(await page.textContent("#toast")), "after the last episode the channel goes back to its schedule, and the TV says the box is finished");
await toBox("Test Show");
d = await dialogText();
check(/finished · due back/.test(d) && /Watch again from episode 1/.test(d), "…its slipcase says finished, and offers it again from episode 1");
await btn(/Return box set/, 400);
s = await st();
check(s.club.boxes.length === 0 && /Returned Test Show/.test(await page.textContent("#toast")), "Return puts it back on the shelf, from wherever the viewer got to");
await toBox("Other Show");
check(/Check out & play/.test(await dialogText()), "…and the next box set can go out");

check(!errors.length, "no page errors " + errors.join(" | "));
await browser.close();
site.close();
console.log(failures ? failures + " check(s) failed" : "BOX SETS: ALL GOOD");
process.exit(failures ? 1 : 0);
