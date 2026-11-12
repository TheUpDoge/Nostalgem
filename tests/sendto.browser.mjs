// Send to TV (sendto.js, phone.js, main.js): a link sent from the phone remote plays on the TV, on demand.
//
//   An archive.org film pasted on the phone plays on the TV, off the schedule, and the phone moves through it
//   (the bar, ⏪ ⏩), pauses it, and BACK goes back to the channel. An item in parts plays one after the other,
//   with ⏮ ⏭; a link to one file starts there; a recording brings up the radio panel. Links the TV can't
//   play say why on the phone (lending only, adult, a collection, nothing playable, not there). A YouTube
//   video plays through YouTube's player (a stand-in here), learns its title and length, and a playlist
//   lines up, skipping one that won't play. A link from the phone's Share sheet waits for one tap. The
//   phone's own Archive search lists what it found (adult left out) and a tap plays one. Through the relay
//   (no WebRTC, a local broker) a link gets there too.
//
//   npm install --no-save playwright && node tests/sendto.browser.mjs

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { startBroker } from "./fixtures/mqtt-broker.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..", "web");
const fixtures = join(here, "fixtures");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
const lineup = JSON.parse(await readFile(join(web, "data", "lineup.json"), "utf8"));
for (const c of lineup.channels) c.offset = 0;
const NOW = Date.parse(lineup.epoch) + 3000; // the TV's clock: every live program is three seconds in

// Programs are served like archive.org serves them: with byte ranges, so the player can seek.
async function serveMedia(req, res, file, type) {
  const body = await readFile(file);
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
  if (!m) return res.writeHead(200, { "content-type": type, "content-length": body.length, "accept-ranges": "bytes" }).end(body);
  const start = m[1] ? Number(m[1]) : 0;
  const end = m[2] ? Math.min(Number(m[2]), body.length - 1) : body.length - 1;
  res.writeHead(206, { "content-type": type, "content-length": end - start + 1, "content-range": `bytes ${start}-${end}/${body.length}`, "accept-ranges": "bytes" }).end(body.subarray(start, end + 1));
}
const site = createServer(async (q, s) => {
  const path = new URL(q.url, "http://x").pathname;
  if (path === "/__media/test.mp4") return serveMedia(q, s, join(fixtures, "test.mp4"), "video/mp4");
  if (path === "/__media/test.mp3") return serveMedia(q, s, join(fixtures, "test.mp3"), "audio/mpeg");
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
const fakeYouTube = await readFile(join(fixtures, "fake-youtube.js"), "utf8");

let failures = 0;
const check = (ok, what) => {
  console.log((ok ? "  ok   " : "  FAIL ") + what);
  if (!ok) failures++;
};
const errors = [];
const watch = (who, p) => p.on("pageerror", (e) => errors.push(who + ": " + e.message));
// SHOTS=1 keeps pictures of the phone and the TV in tests/shots/.
const SHOTS = process.env.SHOTS ? join(here, "shots") : "";
const shot = async (page, name) => {
  if (!SHOTS) return;
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(SHOTS, name + ".png") });
};

// The Archive: a film, a serial in three parts, a radio show, and five that can't play. Each clip is the
// 12-second test clip, and its listing says 12 seconds.
const mp4 = (name) => ({ name: name, format: "h.264", source: "original", length: "12" });
const ITEMS = {
  test_sent_film: { metadata: { identifier: "test_sent_film", title: "The Sent Film", year: "1950", mediatype: "movies", description: "A film a phone sent to the TV, for the test." }, files: [mp4("test_sent_film.mp4")] },
  test_sent_serial: { metadata: { identifier: "test_sent_serial", title: "The Sent Serial", year: "1940", mediatype: "movies" }, files: [mp4("Chapter 01 The Trap.mp4"), mp4("Chapter 02 The Escape.mp4"), mp4("Chapter 03 The End.mp4")] },
  test_sent_radio: { metadata: { identifier: "test_sent_radio", title: "The Sent Radio Show", year: "1947", mediatype: "audio" }, files: [{ name: "show.mp3", format: "VBR MP3", source: "original", length: "12" }] },
  test_sent_lending: { metadata: { identifier: "test_sent_lending", title: "The Lent Film", mediatype: "movies", "access-restricted-item": "true" }, files: [mp4("lent.mp4")] },
  test_sent_adult: { metadata: { identifier: "test_sent_adult", title: "Nude on the Moon", mediatype: "movies" }, files: [mp4("moon.mp4")] },
  test_sent_coll: { metadata: { identifier: "test_sent_coll", title: "A Whole Collection", mediatype: "collection" }, files: [] },
  test_sent_docs: { metadata: { identifier: "test_sent_docs", title: "Just Papers", mediatype: "texts" }, files: [{ name: "papers.pdf", format: "Text PDF", source: "original" }] },
};
const searches = [];
async function archive(r) {
  const url = new URL(r.request().url());
  const json = (body) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  if (url.pathname.startsWith("/download/")) return r.fulfill({ status: 302, headers: { location: base + (/\.mp3$/i.test(url.pathname) ? "__media/test.mp3" : "__media/test.mp4") } });
  if (url.pathname.startsWith("/metadata/")) return json(ITEMS[url.pathname.replace(/^\/metadata\//, "")] || {}); // the Archive answers {} for an item it hasn't got
  if (url.pathname === "/advancedsearch.php") {
    const q = url.searchParams.get("q") || "";
    searches.push({ q: q, fields: url.searchParams.getAll("fl[]") });
    // Nothing has "moon men" in its title; plenty mention it.
    if (/^title:\(moon men\)/.test(q)) return json({ response: { numFound: 0, docs: [] } });
    return json({
      response: {
        numFound: 3,
        docs: [
          { identifier: "test_sent_film", title: "The Sent Film", year: 1950, mediatype: "movies" },
          { identifier: "test_sent_adult", title: "Nude on the Moon", year: 1961, mediatype: "movies" },
          { identifier: "test_sent_radio", title: "The Sent Radio Show", year: 1947, mediatype: "audio" },
        ],
      },
    });
  }
  return r.fulfill({ status: 404, body: "" });
}

async function setup(ctx, code, extra) {
  await ctx.addInitScript(
    (a) => {
      window.NostalGemRelayBrokers = a.brokers || [];
      window.__ytLists = {
        PLtestlist0000000001: ["listvideo001", "listvideo002", "badlistvid03", "listvideo004"],
        // Every one refused, as on an address YouTube turns away.
        PLallrefused00000001: ["badlistvid11", "badlistvid12", "badlistvid13", "badlistvid14", "badlistvid15", "badlistvid16", "badlistvid17", "badlistvid18", "badlistvid19"],
      };
      localStorage.setItem("nostalgem:seenVersion", JSON.stringify("999.0.0"));
      localStorage.setItem("nostalgem:settings", JSON.stringify({ phone: true, staticFx: "silent" }));
      localStorage.setItem("nostalgem:phoneCode", JSON.stringify(a.code));
      if (a.noRtc) {
        window.RTCPeerConnection = undefined;
        window.webkitRTCPeerConnection = undefined;
      }
    },
    Object.assign({ code: code }, extra || {})
  );
  await ctx.route(/^https:\/\/archive\.org\//, archive);
  await ctx.route("https://www.youtube.com/iframe_api", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: fakeYouTube }));
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)(?!archive\.org)(?!www\.youtube\.com\/iframe_api)/, (r) => r.abort());
}

async function pair(tv, ph, tvUrl, phUrl, timeout) {
  await tv.clock.setFixedTime(new Date(NOW));
  await tv.goto(base + tvUrl);
  await tv.waitForFunction(() => window.NP && window.NP.state().app === "on" && window.NP.state().phone.status === "ready", null, { timeout: timeout || 15000 }).catch(() => {});
  await ph.goto(base + phUrl);
  await ph.waitForFunction(() => window.NGRemote && window.NGRemote.state().status === "connected" && window.NGRemote.state().tv, null, { timeout: timeout || 15000 }).catch(() => {});
  return (await ph.evaluate(() => window.NGRemote.state().status)) === "connected";
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });

// ---------- a browser TV, a phone paired with it ----------
{
  const CODE = "SND234";
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript({ path: join(fixtures, "fake-peer.js") });
  await setup(ctx, CODE);
  const tv = await ctx.newPage();
  const ph = await ctx.newPage();
  await ph.setViewportSize({ width: 390, height: 844 });
  watch("TV", tv);
  watch("phone", ph);
  const st = () => tv.evaluate(() => window.NP.state());
  const phone = () =>
    ph.evaluate(() => ({
      tab: window.NGRemote.state().tab,
      tv: window.NGRemote.state().tv,
      msg: document.getElementById("sendMsg").textContent,
      bad: document.getElementById("sendMsg").classList.contains("bad"),
      badge: document.querySelector("#now .now-badge").textContent,
      title: document.querySelector("#now .now-title").textContent,
      next: document.querySelector("#now .now-next").textContent,
      seek: !document.getElementById("seekBar").hidden,
      seekMax: Number(document.getElementById("seekBar").max),
      seekRow: !document.getElementById("seekRow").hidden,
      prev: !document.getElementById("prevBtn").disabled,
      nextBtn: !document.getElementById("nextBtn").disabled,
      box: document.getElementById("sendInput").value,
      search: document.getElementById("searchInput").value,
    }));
  const tvPlays = (title, timeout) => tv.waitForFunction((t) => window.NP.state().mode === "playing" && window.NP.state().program === t && window.NP.state().shifted, title, { timeout: timeout || 12000 }).catch(() => {});
  const tvLive = () => tv.waitForFunction(() => !window.NP.state().sent && !window.NP.state().shifted, null, { timeout: 12000 }).catch(() => {});
  const sendFromBox = async (text) => {
    await ph.click('#tabs [data-tab="search"]');
    await ph.fill("#sendInput", text);
    await ph.click("#sendBtn");
  };
  const says = (re, timeout) => ph.waitForFunction((src) => new RegExp(src).test(document.getElementById("sendMsg").textContent), re.source, { timeout: timeout || 8000 }).catch(() => {});

  check(await pair(tv, ph, "?ch=1", "remote.html#" + CODE), "the phone pairs with the TV");
  await tv.waitForFunction(() => window.NP.state().mode === "playing", null, { timeout: 15000 }).catch(() => {});
  const live = await st();
  check(live.mode === "playing" && !live.shifted, `the TV is on CH 01, live (${live.program})`);

  // Not a link the TV can play: the phone says so, and nothing is sent.
  await ph.click('#tabs [data-tab="search"]');
  check((await ph.isVisible("#sendInput")) && (await ph.isVisible("#sendBtn")), "the phone's Search page has a Send to TV box");
  await sendFromBox("https://example.com/watch?v=abcdefghijk");
  let p = await phone();
  check(p.bad && /isn't a link the TV can play/.test(p.msg) && !(await st()).sent, "a link from somewhere else isn't sent: " + p.msg);

  // An Archive film: plays on demand, and the phone goes to the remote with a bar to move through it.
  await sendFromBox("Watch this: https://archive.org/details/test_sent_film");
  await tvPlays("The Sent Film");
  let s = await st();
  check(s.mode === "playing" && s.shifted && s.program === "The Sent Film" && s.sent && s.sent.n === 1 && s.channel === 1, `an archive.org link pasted on the phone plays on the TV, on demand, on the channel it was on (${s.program}, CH ${s.channel})`);
  check(/FROM YOUR PHONE/.test(await tv.textContent("#banner")) && /ON DEMAND/.test(await tv.textContent("#banner")), "…and the TV's banner says it's from the phone, on demand");
  await ph.waitForFunction(() => window.NGRemote.state().tab === "remote" && window.NGRemote.state().tv.sent, null, { timeout: 6000 }).catch(() => {});
  p = await phone();
  check(p.tab === "remote" && p.badge === "FROM PHONE" && /The Sent Film/.test(p.title), `the phone goes to the remote and shows it (${p.badge}: ${p.title})`);
  check(p.seek && p.seekMax === 12 && p.seekRow && !p.prev && !p.nextBtn, `…with a bar to drag through its 12 seconds, and ⏪ ⏩ (⏮ ⏭ off: it's in one part)`);
  check(/▶ On the TV: The Sent Film/.test(p.msg), "…and the Send box says it's on: " + p.msg);
  await shot(tv, "sendto-tv-banner");
  await shot(ph, "sendto-phone-now");
  await ph.click('#tabs [data-tab="search"]');
  await shot(ph, "sendto-phone-box");
  await ph.click('#tabs [data-tab="remote"]');

  // The bar: let go at 8 seconds and the TV goes there. ⏪ 15 goes back to the start.
  await ph.evaluate(() => {
    const bar = document.getElementById("seekBar");
    bar.value = "8";
    bar.dispatchEvent(new Event("input", { bubbles: true }));
    bar.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await tv.waitForFunction(() => window.NP.state().at >= 7.5, null, { timeout: 5000 }).catch(() => {});
  s = await st();
  check(s.at >= 7.5 && s.at < 11 && s.mode === "playing", `dragging the phone's bar to 0:08 moves the TV there (${s.at}s)`);
  await ph.click('#seekRow [data-seek="-15"]');
  await tv.waitForFunction(() => window.NP.state().at < 3, null, { timeout: 5000 }).catch(() => {});
  check((await st()).at < 3, `⏪ 15 goes back (to ${(await st()).at}s)`);
  await ph.click("#playBtn");
  await tv.waitForFunction(() => window.NP.state().mode === "paused", null, { timeout: 5000 }).catch(() => {});
  await ph.waitForFunction(() => document.querySelector("#now .now-badge").textContent === "PAUSED", null, { timeout: 5000 }).catch(() => {});
  check((await st()).mode === "paused" && (await phone()).badge === "PAUSED", "the phone's pause pauses it");
  await ph.click("#playBtn");
  await tv.waitForFunction(() => window.NP.state().mode === "playing", null, { timeout: 5000 }).catch(() => {});

  // BACK: back to the channel.
  await ph.click('#remote [data-key="back"]');
  await tvLive();
  s = await st();
  check(!s.sent && !s.shifted && s.program === live.program && s.channel === 1, `BACK goes back to the channel (${s.program}, live)`);
  await ph.waitForFunction(() => !window.NGRemote.state().tv.sent && !window.NGRemote.state().tv.demand, null, { timeout: 5000 }).catch(() => {});
  p = await phone();
  check(!p.seek && !p.seekRow && p.msg === "", "…and the phone's bar and ⏪ ⏩ go away");

  // A live channel's program can't be moved through: the shared clock isn't the phone's to move.
  await ph.evaluate(() => window.NGRemote.send({ t: "seek", to: 9 }));
  await tv.waitForTimeout(500);
  s = await st();
  check(!s.shifted && s.at < 8, `a seek while a channel is live does nothing (${s.at}s, live)`);

  // A serial in three parts: one after the other, with ⏮ ⏭.
  await sendFromBox("https://archive.org/details/test_sent_serial");
  await tv.waitForFunction(() => window.NP.state().sent && window.NP.state().sent.n === 3 && window.NP.state().mode === "playing", null, { timeout: 12000 }).catch(() => {});
  s = await st();
  check(s.sent && s.sent.n === 3 && s.sent.i === 0 && /The Trap/.test(s.sent.titles[0]), `an item in parts lines them all up (${s.sent && s.sent.titles.join(" | ")})`);
  await ph.waitForFunction(() => /Part 1 of 3/.test(document.querySelector("#now .now-next").textContent), null, { timeout: 5000 }).catch(() => {});
  p = await phone();
  check(/Part 1 of 3 · next: Chapter 02 The Escape/.test(p.next) && /The Trap/.test(p.title) && p.nextBtn && !p.prev, `the phone says which part, and what's next (${p.next})`);
  await shot(ph, "sendto-phone-parts");
  await ph.click("#nextBtn");
  await tv.waitForFunction(() => window.NP.state().sent && window.NP.state().sent.i === 1 && window.NP.state().mode === "playing", null, { timeout: 8000 }).catch(() => {});
  check((await st()).sent.i === 1, "⏭ plays the next part");
  // Near the end of part 2: part 3 starts by itself.
  await ph.evaluate(() => window.NGRemote.send({ t: "seek", to: 10 }));
  await tv.waitForFunction(() => window.NP.state().sent && window.NP.state().sent.i === 2 && window.NP.state().mode === "playing", null, { timeout: 12000 }).catch(() => {});
  s = await st();
  check(s.sent && s.sent.i === 2 && s.at < 6, `when a part ends the next one starts by itself (part ${s.sent ? s.sent.i + 1 : "?"})`);
  await ph.click("#prevBtn");
  await tv.waitForFunction(() => window.NP.state().sent && window.NP.state().sent.i === 1, null, { timeout: 8000 }).catch(() => {});
  check((await st()).sent.i === 1, "⏮ goes back a part");
  // The last part ends: back to the channel.
  await ph.click("#nextBtn");
  await tv.waitForFunction(() => window.NP.state().sent && window.NP.state().sent.i === 2 && window.NP.state().mode === "playing", null, { timeout: 8000 }).catch(() => {});
  await ph.evaluate(() => window.NGRemote.send({ t: "seek", to: 10 }));
  await tvLive();
  s = await st();
  check(!s.sent && !s.shifted && s.program === live.program, "when the last part ends the channel comes back");

  // A link to one file of it starts there.
  await sendFromBox("https://archive.org/download/test_sent_serial/Chapter%2003%20The%20End.mp4");
  await tv.waitForFunction(() => window.NP.state().sent && window.NP.state().mode === "playing", null, { timeout: 12000 }).catch(() => {});
  s = await st();
  check(s.sent && s.sent.i === 2 && s.sent.n === 3, `a link to one file starts at that part (part ${s.sent ? s.sent.i + 1 : "?"} of 3)`);
  // Changing channel leaves it.
  await ph.click('#tabs [data-tab="remote"]');
  await ph.click('#remote [data-key="chup"]');
  await tv.waitForFunction(() => !window.NP.state().sent && window.NP.state().channel !== 1, null, { timeout: 8000 }).catch(() => {});
  s = await st();
  check(!s.sent && s.channel !== 1 && !s.shifted, `changing channel leaves it (CH ${s.label})`);

  // A recording: the radio panel, on a TV channel.
  const before = await st();
  await sendFromBox("archive.org/details/test_sent_radio");
  await tvPlays("The Sent Radio Show");
  s = await st();
  check(s.program === "The Sent Radio Show" && s.radio && !before.radio, "a recording that was sent brings up the radio panel, on a TV channel");
  await tv.evaluate(() => window.NP.back());
  await tvLive();
  check(!(await st()).radio, "…and BACK on the TV's own remote takes it away again");

  // On a station with its own look and speed (666: red ASCII, half speed), what's sent plays as made.
  for (const d of [6, 6, 6]) await ph.evaluate((n) => window.NGRemote.send({ t: "key", type: "digit", digit: n }), d);
  await tv.waitForFunction(() => window.NP.state().station === "dead-air" && !window.NP.state().intro, null, { timeout: 15000 }).catch(() => {});
  s = await st();
  check(s.station === "dead-air" && s.look.id === "ascii-666", `the TV is on 666, in its own look (${s.look.id})`);
  await sendFromBox("https://archive.org/details/test_sent_film");
  await tvPlays("The Sent Film");
  s = await st();
  check(s.program === "The Sent Film" && s.look.id !== "ascii-666" && s.sound.rate === 1, `a film sent there plays as made: the viewer's own filter (${s.look.id}), full speed (×${s.sound.rate})`);
  await tv.evaluate(() => window.NP.back());
  await tvLive();
  s = await st();
  check(s.station === "dead-air" && s.look.id === "ascii-666", `…and BACK puts the station's look back (${s.look.id})`);
  await ph.evaluate(() => window.NGRemote.send({ t: "tune", slug: "high-noon" }));
  await tv.waitForFunction(() => window.NP.state().channel === 1 && window.NP.state().station === "", null, { timeout: 8000 }).catch(() => {});

  // What can't play, and why.
  const refused = async (id, re, what) => {
    await sendFromBox("https://archive.org/details/" + id);
    await says(re);
    const m = await phone();
    const t = await st();
    check(re.test(m.msg) && !t.sent && !t.shifted, what + ": " + m.msg);
    return m;
  };
  p = await refused("test_sent_lending", /signed-in member/, "an item the Archive keeps for signed-in members is refused, and the phone says why");
  await shot(ph, "sendto-phone-refused");
  check(p.bad && p.tab === "search", "…in red, staying on the Search page");
  await refused("test_sent_adult", /leave-out list/, "adult material is refused");
  await refused("test_sent_docs", /no MP4 video and no MP3/, "an item with nothing a TV plays is refused");
  await refused("test_sent_nothing_here", /nothing at that address/, "an item that isn't there is refused");
  p = await refused("test_sent_coll", /whole collection/, "a collection isn't a program");
  check(p.search === "https://archive.org/details/test_sent_coll" && !p.bad, "…its link goes in the search box, for 📡 New TV channel (" + p.search + ")");
  await sendFromBox("https://archive.org/search?query=lone+ranger");
  p = await phone();
  check(/channel's worth/.test(p.msg) && /query=lone%20ranger/.test(p.search), "an archive.org search page is a channel's worth too: " + p.msg);

  // YouTube: its own player, the title and the length once it plays, and where t= says to start.
  await sendFromBox("https://youtu.be/sentvideo001?si=xyz&t=5");
  await tvPlays("Title of sentvideo001");
  s = await st();
  const yt = await tv.evaluate(() => window.__yt.log.filter((l) => l.id === "sentvideo001"));
  check(s.program === "Title of sentvideo001" && s.length === 12 && yt.length === 1 && yt[0].start === 5, `a YouTube link plays through YouTube's player from 0:05, and learns its title and length (${s.program}, ${s.length}s, from ${yt[0] && yt[0].start}s)`);
  await ph.waitForFunction(() => /Title of sentvideo001/.test(document.querySelector("#now .now-title").textContent) && !document.getElementById("seekBar").hidden, null, { timeout: 6000 }).catch(() => {});
  p = await phone();
  check(/Title of sentvideo001/.test(p.title) && p.seek && p.seekMax === 12, `the phone gets the title and a bar once they're known (${p.title}, ${p.seekMax}s)`);
  check(/▶ On the TV: Title of sentvideo001/.test(p.msg), "…and so does the Send box: " + p.msg);
  await ph.click('#seekRow [data-seek="-15"]');
  await tv.waitForFunction(() => window.NP.state().at < 4, null, { timeout: 5000 }).catch(() => {});
  check((await st()).at < 4, "⏪ works on a YouTube video");

  // One that YouTube won't play outside its own site: the phone hears why, and the channel comes back.
  await sendFromBox("https://www.youtube.com/watch?v=badvideo0001");
  await says(/✖/);
  await tvLive();
  p = await phone();
  check(p.bad && /YouTube/.test(p.msg) && !(await st()).sent, "a video YouTube won't embed: the phone hears why and the channel comes back: " + p.msg);

  // A playlist: every video in order; one that won't play is skipped.
  await sendFromBox("https://www.youtube.com/playlist?list=PLtestlist0000000001");
  await tv.waitForFunction(() => window.NP.state().sent && window.NP.state().sent.n === 4 && window.NP.state().mode === "playing", null, { timeout: 12000 }).catch(() => {});
  s = await st();
  check(s.sent && s.sent.n === 4 && s.sent.i === 0 && s.program === "Title of listvideo001", `a playlist lines up its videos (${s.sent ? s.sent.n : 0}, playing ${s.program})`);
  check((await tv.evaluate(() => window.__yt.players.filter((x) => !x.destroyed).length)) === 1, "…and the player that read the list is gone again");
  await ph.click('#tabs [data-tab="remote"]');
  await ph.click("#nextBtn");
  await tv.waitForFunction(() => window.NP.state().sent && window.NP.state().sent.i === 1 && window.NP.state().mode === "playing", null, { timeout: 8000 }).catch(() => {});
  await ph.click("#nextBtn");
  await tv.waitForFunction(() => window.NP.state().sent && window.NP.state().sent.i === 3 && window.NP.state().mode === "playing", null, { timeout: 12000 }).catch(() => {});
  s = await st();
  check(s.sent && s.sent.i === 3 && s.program === "Title of listvideo004", `a video on it that won't play is skipped for the next (now ${s.sent ? s.sent.i + 1 : "?"} of 4: ${s.program})`);
  await tv.evaluate(() => window.NP.back());
  await tvLive();

  // A video's link that names its playlist: the video now, the rest behind it.
  await sendFromBox("https://www.youtube.com/watch?v=listvideo002&list=PLtestlist0000000001");
  await tv.waitForFunction(() => window.NP.state().sent && window.NP.state().sent.n === 4 && window.NP.state().mode === "playing", null, { timeout: 12000 }).catch(() => {});
  s = await st();
  check(s.sent && s.sent.n === 4 && s.sent.i === 1 && s.program === "Title of listvideo002", `a video's link with its playlist plays the video, with the rest lined up (${s.sent ? s.sent.i + 1 : "?"} of ${s.sent ? s.sent.n : "?"})`);
  await tv.evaluate(() => window.NP.back());
  await tvLive();
  // A playlist where one after another is refused: it gives up, the channel comes back (not "nothing
  // plays on this channel"), and the phone hears why.
  await sendFromBox("https://www.youtube.com/playlist?list=PLallrefused00000001");
  await says(/✖/, 15000);
  await tv.waitForFunction(() => !window.NP.state().sent && (window.NP.state().mode === "playing" || window.NP.state().mode === "gap"), null, { timeout: 12000 }).catch(() => {});
  s = await st();
  p = await phone();
  check(!s.sent && !s.shifted && s.mode !== "empty" && s.program === live.program, `a playlist where one after another won't play gives up and the channel comes back (${s.mode}: ${s.program})`);
  check(p.bad && /doesn't let it play here/.test(p.msg), "…and the phone hears why: " + p.msg);
  await sendFromBox("https://www.youtube.com/playlist?list=PLnosuchlist00000001");
  await says(/wouldn't hand over that playlist/, 20000);
  check(/wouldn't hand over that playlist/.test((await phone()).msg) && !(await st()).sent, "a playlist YouTube won't list is refused, in words");

  // The phone's own Archive search: what it found, adult left out, and a tap plays one.
  await ph.click('#tabs [data-tab="search"]');
  await ph.fill("#searchInput", "sent (film)");
  await ph.click('#searchForm [data-kind="archive"]');
  await ph.waitForFunction(() => !document.getElementById("foundList").hidden, null, { timeout: 8000 }).catch(() => {});
  const found = await ph.evaluate(() => Array.from(document.querySelectorAll("#foundList button")).map((b) => b.textContent));
  const asked = searches[searches.length - 1] || { q: "", fields: [] };
  check(found.length === 2 && /The Sent Film/.test(found[0]) && /1950/.test(found[0]) && /The Sent Radio Show/.test(found[1]), `🌐 Search the Archive lists what it found on the phone, adult material left out (${found.length}: ${found.join(" | ").slice(0, 110)})`);
  await shot(ph, "sendto-phone-found");
  check(/^title:\(sent film\) AND mediatype:\(movies OR audio\) AND -access-restricted-item:true$/.test(asked.q) && asked.fields.includes("mediatype"), "…asking the Archive for titles, films and recordings only: " + asked.q);
  await ph.click("#foundList button >> nth=0");
  await tvPlays("The Sent Film");
  check((await st()).program === "The Sent Film" && (await st()).sent, "…and tapping one plays it on the TV");
  await tv.evaluate(() => window.NP.back());
  await tvLive();
  await ph.click('#tabs [data-tab="search"]');
  await ph.fill("#searchInput", "moon men");
  await ph.click('#searchForm [data-kind="archive"]');
  for (let i = 0; i < 60 && !searches.some((x) => /^\(moon men\) AND/.test(x.q)); i++) await ph.waitForTimeout(100);
  await ph.waitForFunction(() => /tap one to play/.test(document.getElementById("searchMsg").textContent), null, { timeout: 8000 }).catch(() => {});
  check(searches.some((x) => /^title:\(moon men\)/.test(x.q)) && /^\(moon men\) AND/.test((searches[searches.length - 1] || {}).q || "") && (await ph.evaluate(() => window.NGRemote.state().found)) === 2, "words in no title are looked for anywhere instead");
  // A link typed in the search box is something to play.
  await ph.fill("#searchInput", "https://archive.org/details/test_sent_film");
  await ph.click('#searchForm [data-kind="find"]');
  await tvPlays("The Sent Film");
  check((await st()).program === "The Sent Film", "a link typed in the search box plays too");
  await tv.evaluate(() => window.NP.back());
  await tvLive();

  // The bar is for anything on demand: "watch from the start" (Find a show) gets it too.
  const word = live.program.split(/\s+/).filter((w) => w.length > 3)[0] || live.program;
  await ph.evaluate((t) => window.NGRemote.send({ t: "find", text: t }), word);
  await tv.waitForFunction(() => window.NP.state().overlay === "menu", null, { timeout: 8000 }).catch(() => {});
  await ph.evaluate(() => window.NGRemote.send({ t: "key", type: "ok" }));
  await tv.waitForFunction(() => window.NP.state().shifted && window.NP.state().mode === "playing" && !window.NP.state().sent, null, { timeout: 12000 }).catch(() => {});
  await ph.waitForFunction(() => window.NGRemote.state().tv.demand && !window.NGRemote.state().tv.sent && !document.getElementById("seekBar").hidden, null, { timeout: 6000 }).catch(() => {});
  p = await phone();
  s = await st();
  check(s.shifted && !s.sent && p.badge === "ON DEMAND" && p.seek && p.seekRow && !p.prev && !p.nextBtn, `a show watched from the start (${s.program}) gets the phone's bar too (${p.badge})`);
  await ph.evaluate(() => window.NGRemote.send({ t: "seek", to: 7 }));
  await tv.waitForFunction(() => window.NP.state().at >= 6.5, null, { timeout: 6000 }).catch(() => {});
  check((await st()).at >= 6.5, `…and it moves it (${(await st()).at}s)`);
  await ph.click('#tabs [data-tab="remote"]');
  await ph.click("#liveBtn");
  await tvLive();

  check(!errors.length, "no page errors " + errors.join(" | "));
  await ctx.close();
}

// ---------- a link from the phone's Share sheet ----------
{
  errors.length = 0;
  const CODE = "SHR234";
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript({ path: join(fixtures, "fake-peer.js") });
  await setup(ctx, CODE);
  const tv = await ctx.newPage();
  const ph = await ctx.newPage();
  await ph.setViewportSize({ width: 390, height: 844 });
  watch("TV", tv);
  watch("phone", ph);
  const manifest = JSON.parse(await readFile(join(web, "remote.webmanifest"), "utf8"));
  check(manifest.share_target && manifest.share_target.action === "remote.html" && manifest.share_target.params.text === "text" && manifest.share_target.params.url === "url", "the remote's manifest makes it a share target (Android's Share menu)");
  // What Android hands over from the YouTube app: the title, and the address in the text.
  const shared = "remote.html?title=" + encodeURIComponent("A Shared Video") + "&text=" + encodeURIComponent("Look at this https://youtu.be/sharedvid001?si=abc") + "#" + CODE;
  check(await pair(tv, ph, "?ch=1", shared), "opened from Share, the remote pairs as usual");
  await tv.waitForFunction(() => window.NP.state().mode === "playing", null, { timeout: 15000 }).catch(() => {});
  const p = await ph.evaluate(() => ({ url: location.search, tab: window.NGRemote.state().tab, box: document.getElementById("sendInput").value, msg: document.getElementById("sendMsg").textContent, shown: !document.getElementById("search").hidden }));
  check(p.url === "" && p.tab === "search" && p.shown && p.box === "https://www.youtube.com/watch?v=sharedvid001" && /Shared with NostalGem: a YouTube video/.test(p.msg), `the shared link is waiting in the Send to TV box (${p.box}): ${p.msg}`);
  await tv.waitForTimeout(700);
  check(!(await tv.evaluate(() => window.NP.state().sent)), "…and nothing plays until it's tapped: a link somebody else made can't put something on the TV");
  await ph.click("#sendBtn");
  await tv.waitForFunction(() => window.NP.state().mode === "playing" && window.NP.state().program === "Title of sharedvid001", null, { timeout: 12000 }).catch(() => {});
  check((await tv.evaluate(() => window.NP.state().program)) === "Title of sharedvid001", "▶ Play on TV sends it");
  check(!errors.length, "no page errors " + errors.join(" | "));
  await ctx.close();
}

// ---------- inside the TV app, and through the relay (no WebRTC at all) ----------
{
  errors.length = 0;
  const CODE = "RWY567";
  const broker = await startBroker();
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  await setup(ctx, CODE, { brokers: [broker.url], noRtc: true });
  const tv = await ctx.newPage();
  const ph = await ctx.newPage();
  await ph.setViewportSize({ width: 390, height: 844 });
  watch("TV", tv);
  watch("phone", ph);
  check(await pair(tv, ph, "?ch=1&tv=android", "remote.html#" + CODE, 30000), "the TV app's page and a phone pair through the relay (no WebRTC)");
  await ph.click('#tabs [data-tab="search"]');
  await ph.fill("#sendInput", "https://archive.org/details/test_sent_film");
  await ph.click("#sendBtn");
  await tv.waitForFunction(() => window.NP.state().mode === "playing" && window.NP.state().program === "The Sent Film", null, { timeout: 20000 }).catch(() => {});
  let s = await tv.evaluate(() => window.NP.state());
  check(s.program === "The Sent Film" && s.sent && s.shifted, "a link sent through the relay plays in the TV app's page");
  await ph.waitForFunction(() => window.NGRemote.state().tv && window.NGRemote.state().tv.sent && !document.getElementById("seekBar").hidden, null, { timeout: 8000 }).catch(() => {});
  await ph.evaluate(() => window.NGRemote.send({ t: "seek", to: 8 }));
  await tv.waitForFunction(() => window.NP.state().at >= 7.5, null, { timeout: 8000 }).catch(() => {});
  check((await tv.evaluate(() => window.NP.state().at)) >= 7.5, "…and the phone moves through it from there too");
  // The app's BACK button (MainActivity asks the page): back to the channel, without leaving the app.
  const stayed = await tv.evaluate(() => window.NP.back());
  await tv.waitForFunction(() => !window.NP.state().sent && !window.NP.state().shifted, null, { timeout: 8000 }).catch(() => {});
  s = await tv.evaluate(() => window.NP.state());
  check(stayed === true && !s.sent && !s.shifted, "the TV remote's BACK goes back to the channel, and the app stays open");
  const plain = broker.seen.map((b) => b.toString("latin1")).join("\n");
  check(broker.seen.length > 3 && !/test_sent_film|archive\.org|Sent Film/.test(plain), `nothing readable about the link crosses the relay server (${broker.seen.length} messages)`);
  check(!errors.length, "no page errors " + errors.join(" | "));
  await ctx.close();
  broker.close();
}

await browser.close();
site.close();
console.log(failures ? failures + " check(s) failed" : "SEND TO TV: ALL GOOD");
process.exit(failures ? 1 : 0);
