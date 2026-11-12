// Live check of Send to TV against the real Internet Archive and real YouTube. Needs real internet (run it
// on GitHub Actions: "Live Archive check"). Prints what it found.
//
//   1. The Archive: what the TV makes of real items sent to it (a film, an item in parts, a radio serial,
//      a collection), from their live metadata.
//   2. In the app, with a phone paired (the link between them is a stand-in: it isn't what's checked here):
//      a real film sent from the phone plays, and the phone's bar moves it ten minutes in.
//   3. YouTube, its real player: a video from the lineup plays and gives its title and length; a channel's
//      uploads playlist says what's on it, and sent as a playlist it lines up. YouTube sometimes turns away
//      data-center addresses like a GitHub runner's, so this part is reported and never fails the run.
//
//   node tests/live-sendto.mjs [https://theupdoge.github.io/Nostalgem/ | local]
//   ONLY=archive node tests/live-sendto.mjs     part 1 alone: no browser, just the Archive's metadata

import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { archivePlan, whyNot } from "../web/js/sendto.js";
import { metadataUrl } from "../web/js/archive.js";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..", "web");
let site = (process.argv[2] || "local").replace(/\/?$/, "/");
if (site === "local/") {
  const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
  const srv = createServer(async (q, res) => {
    const path = new URL(q.url, "http://x").pathname;
    const file = normalize(join(web, path === "/" ? "index.html" : path));
    if (!file.startsWith(web)) return res.writeHead(403).end();
    try {
      res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  srv.unref();
  site = "http://127.0.0.1:" + srv.address().port + "/";
}

let failures = 0;
const check = (ok, what) => {
  console.log((ok ? "  ok   " : "  FAIL ") + what);
  if (!ok) failures++;
};
const note = (what) => console.log("  ..   " + what);

// What to send: programs the lineup already carries (their ids came from live checks when it was built).
const lineup = JSON.parse(await readFile(join(web, "data", "lineup.json"), "utf8"));
const count = {};
let radioId = "";
for (const c of lineup.channels) {
  for (const it of c.items) {
    if (String(it.id).startsWith("yt:")) continue;
    count[it.id] = (count[it.id] || 0) + 1;
    if (c.kind === "audio" && !radioId) radioId = it.id;
  }
}
const film = lineup.channels.find((c) => c.slug === "creature-feature").items[0];
const partsId = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
const ytItem = lineup.channels.find((c) => c.slug === "yt-pledge-drive").items.find((it) => !it.live);
const ytId = ytItem.id.slice(3);

// ---------- 1. the Archive's own word on real items ----------
console.log("The Archive, live:");
const meta = async (id) => (await fetch(metadataUrl(id))).json();
{
  const one = archivePlan(await meta(film.id));
  check(!one.why && one.kind === "video" && one.programs.length >= 1 && one.programs.some((p) => p.f === film.f), `${film.id}: ${one.why ? whyNot(one.why) : one.programs.length + " program(s), " + one.programs[0].f + ", " + one.programs[0].d + "s"} (the lineup plays ${film.f})`);
  const many = archivePlan(await meta(partsId));
  check(!many.why && many.programs.length > 1, `${partsId}: ${many.why ? whyNot(many.why) : many.programs.length + " parts, in order from " + many.programs[0].f}`);
  if (!many.why && many.programs.length > 2) {
    const third = many.programs[2].f;
    check(archivePlan(await meta(partsId), third).start === 2, `…and a link to ${third} starts at part 3`);
  }
  const radio = archivePlan(await meta(radioId));
  check(!radio.why && radio.kind === "audio", `${radioId}: ${radio.why ? whyNot(radio.why) : radio.kind + ", " + radio.programs.length + " part(s)"}`);
  const coll = archivePlan(await meta("feature_films"));
  check(coll.why === "collection", `feature_films is a collection: ${whyNot(coll.why)}`);
  const none = archivePlan(await meta("nostalgem_no_such_item_" + Date.now()));
  check(none.why === "notfound", `an item that isn't there: ${whyNot(none.why)}`);
}

if (process.env.ONLY === "archive") {
  console.log(failures ? failures + " check(s) failed" : "SEND TO TV, LIVE (the Archive's metadata only): ALL GOOD");
  process.exit(failures ? 1 : 0);
}

// ---------- 2. in the app: a real film, sent from the phone ----------
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const CODE = "TRY234"; // only letters a pairing code uses (no L, V, I, O, U)
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript({ path: join(here, "fixtures", "fake-peer.js") });
await ctx.addInitScript((code) => {
  window.NostalGemRelayBrokers = [];
  localStorage.setItem("nostalgem:seenVersion", JSON.stringify("999.0.0"));
  localStorage.setItem("nostalgem:settings", JSON.stringify({ phone: true, staticFx: "silent" }));
  localStorage.setItem("nostalgem:phoneCode", JSON.stringify(code));
}, CODE);
const tv = await ctx.newPage();
const ph = await ctx.newPage();
await ph.setViewportSize({ width: 390, height: 844 });
const errors = [];
tv.on("pageerror", (e) => errors.push("TV: " + e.message));
ph.on("pageerror", (e) => errors.push("phone: " + e.message));
const st = () => tv.evaluate(() => window.NP.state());
const sendMsg = () => ph.evaluate(() => document.getElementById("sendMsg").textContent);
const sendFromBox = async (text) => {
  await ph.click('#tabs [data-tab="search"]');
  await ph.fill("#sendInput", text);
  await ph.click("#sendBtn");
};

console.log("In the app:");
await tv.goto(site + "?ch=1");
await tv.waitForFunction(() => window.NP && window.NP.state().app === "on" && window.NP.state().phone.status === "ready", null, { timeout: 30000 }).catch(() => {});
await ph.goto(site + "remote.html#" + CODE);
await ph.waitForFunction(() => window.NGRemote && window.NGRemote.state().status === "connected" && window.NGRemote.state().tv, null, { timeout: 30000 }).catch(() => {});
const phoneIs = await ph.evaluate(() => (window.NGRemote ? window.NGRemote.state().status + " " + window.NGRemote.state().code : "no remote"));
const paired = /^connected /.test(phoneIs);
check(paired && (await ph.evaluate(() => !!document.getElementById("sendInput"))), `the phone is paired, and its Search page has the Send to TV box (phone: ${phoneIs}; TV: ${JSON.stringify((await st()).phone)})`);

if (paired) {
  await sendFromBox("https://archive.org/details/" + film.id);
  await tv.waitForFunction((t) => window.NP.state().mode === "playing" && window.NP.state().sent && window.NP.state().program === t, film.t, { timeout: 90000 }).catch(() => {});
  let s = await st();
  check(s.mode === "playing" && s.sent && s.program === film.t && s.shifted, `a real film sent from the phone plays on demand: ${s.program} (${s.mode}, ${s.length}s long); the phone says: ${await sendMsg()}`);
  // A runner starts a film slowly (it buffers, and has no graphics card): give it a while to get going.
  const at0 = s.at;
  await tv.waitForFunction((from) => window.NP.state().at >= from + 2, at0, { timeout: 20000 }).catch(() => {});
  s = await st();
  check(s.at >= at0 + 2 && s.mode === "playing", `…and it's moving (${at0}s → ${s.at}s)`);
  await ph.waitForFunction(() => window.NGRemote.state().tv && window.NGRemote.state().tv.sent && !document.getElementById("seekBar").hidden, null, { timeout: 10000 }).catch(() => {});
  check(await ph.evaluate(() => !document.getElementById("seekBar").hidden && Number(document.getElementById("seekBar").max) > 600), "the phone has the bar, as long as the film");
  await ph.evaluate(() => {
    const bar = document.getElementById("seekBar");
    bar.value = "600";
    bar.dispatchEvent(new Event("input", { bubbles: true }));
    bar.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await tv.waitForFunction(() => window.NP.state().at >= 598 && window.NP.state().mode === "playing", null, { timeout: 45000 }).catch(() => {});
  await tv.waitForTimeout(2500);
  s = await st();
  check(s.at >= 600 && s.at < 660 && s.mode === "playing", `dragging the phone's bar to 10:00 moves the real film there and it plays on (${s.at}s, ${s.mode})`);
  await tv.screenshot({ path: "live-sendto-archive.png" });
  await ph.screenshot({ path: "live-sendto-phone.png" });
  await tv.evaluate(() => window.NP.back());
  await tv.waitForFunction(() => !window.NP.state().sent && !window.NP.state().shifted, null, { timeout: 20000 }).catch(() => {});
  s = await st();
  check(!s.sent && !s.shifted, `BACK goes back to CH ${s.label} ${s.name}`);

  // ---------- 3. YouTube, its real player (reported, never failed) ----------
  console.log("YouTube, live (reported only):");
  // What the TV goes through and what the phone is told, for the record.
  await ph.evaluate(() => {
    window.__said = [];
    new MutationObserver(() => {
      const t = document.getElementById("sendMsg").textContent;
      if (t && window.__said[window.__said.length - 1] !== t) window.__said.push(t);
    }).observe(document.getElementById("sendMsg"), { childList: true, characterData: true, subtree: true });
  });
  const said = () => ph.evaluate(() => window.__said.splice(0).join(" → ") || "(nothing)");
  const timeline = async (ms, done) => {
    const seen = [];
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const x = await st();
      const line = x.mode + (x.sent ? " " + (x.sent.i + 1) + "/" + x.sent.n : "") + ' "' + x.program + '"';
      if (seen[seen.length - 1] !== line) seen.push(line);
      if (done(x)) break;
      await tv.waitForTimeout(400);
    }
    return seen.join(" → ");
  };
  // A press on the TV's own remote first, as a viewer would have made: a browser tab may then start sound.
  await tv.bringToFront();
  await tv.keyboard.press("i");
  await tv.keyboard.press("i");

  await sendFromBox("https://youtu.be/" + ytId);
  note("the TV: " + (await timeline(45000, (x) => x.mode === "playing" && x.sent && x.length > 0)));
  note("the phone was told: " + (await said()));
  s = await st();
  if (s.mode === "playing" && s.sent) {
    note(`a video from the lineup (${ytId}) plays: "${s.program}", ${s.length}s long (the lineup calls it "${ytItem.t}", ${ytItem.d}s)`);
    note(`its title was learned from the player: ${s.program !== "YouTube video" ? "yes" : "NO, still the placeholder"}`);
    await ph.evaluate(() => window.NGRemote.send({ t: "seek", to: 300 }));
    await tv.waitForFunction(() => window.NP.state().at >= 298, null, { timeout: 20000 }).catch(() => {});
    note(`a seek to 5:00 from the phone: now at ${(await st()).at}s`);
  } else {
    note(`the video did not play here (mode ${s.mode})`);
    note("problems on the TV: " + (await tv.evaluate(() => localStorage.getItem("nostalgem:problems") || "none")).slice(0, 300));
  }
  await tv.screenshot({ path: "live-sendto-youtube.png" });
  await tv.evaluate(() => window.NP.back());
  await tv.waitForTimeout(1500);

  // A playlist anyone may watch: the uploads of the channel that video is from.
  let list = "";
  try {
    const html = await (await fetch("https://www.youtube.com/watch?v=" + ytId, { headers: { "accept-language": "en-US,en" } })).text();
    const m = /"channelId":"(UC[\w-]{22})"/.exec(html);
    if (m) list = "UU" + m[1].slice(2);
  } catch (e) {
    note("couldn't look up the video's channel: " + e.message);
  }

  // YouTube's player by itself, outside the app: what it says about a video and about a playlist from this
  // address. box: how the player sits on the page (the app reads a playlist in one nobody sees).
  const HIDDEN = "position:absolute;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none";
  const SHOWN = "position:absolute;left:0;top:0;width:320px;height:180px;z-index:99";
  const ytSays = (opts) =>
    tv.evaluate(
      (a) =>
        new Promise((done) => {
          const log = [];
          const t0 = performance.now();
          const say = (x) => log.push(Math.round(performance.now() - t0) + "ms " + x);
          const count = (p) => {
            try {
              const l = p.getPlaylist();
              return Array.isArray(l) ? l.length : String(l);
            } catch (e) {
              return "threw";
            }
          };
          const run = () => {
            const box = document.createElement("div");
            box.style.cssText = a.css;
            const mount = document.createElement("div");
            box.appendChild(mount);
            document.body.appendChild(box);
            const loc = window.location;
            const vars = Object.assign({ playsinline: 1, controls: 0, origin: loc.protocol + "//" + loc.host, widget_referrer: loc.href.replace(/#.*$/, "") }, a.vars);
            const o = { width: "320", height: "180", playerVars: vars, events: {} };
            if (a.host) o.host = a.host;
            if (a.videoId) o.videoId = a.videoId;
            let p = null;
            o.events.onReady = () => {
              say("ready, list " + count(p));
              if (a.cue) {
                try {
                  p.cuePlaylist(a.cue);
                  say("cuePlaylist asked");
                } catch (e) {
                  say("cuePlaylist threw " + e.message);
                }
              }
            };
            o.events.onStateChange = (e) => say("state " + e.data + ", list " + count(p));
            o.events.onError = (e) => say("error " + e.data);
            p = new window.YT.Player(mount, o);
            setTimeout(() => {
              say("in the end: list " + count(p));
              try {
                const d = p.getVideoData();
                say("video " + (d && d.video_id) + " “" + (d && d.title) + "”");
              } catch (e) {
                say("getVideoData threw");
              }
              try {
                p.destroy();
              } catch (e) {
                /* fine */
              }
              box.remove();
              done(log.join("; "));
            }, a.ms);
          };
          if (window.YT && window.YT.Player) run();
          else {
            const prev = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
              if (typeof prev === "function") prev();
              run();
            };
            const sc = document.createElement("script");
            sc.src = "https://www.youtube.com/iframe_api";
            sc.onerror = () => done("YouTube's player script didn't load");
            document.head.appendChild(sc);
          }
        }),
      opts
    );
  const NOCOOKIE = "https://www.youtube-nocookie.com";
  note("YouTube's player alone, the video: " + (await ytSays({ css: SHOWN, host: NOCOOKIE, videoId: ytId, vars: { autoplay: 1 }, ms: 12000 })));
  if (!list) note("no playlist to try: the video's page didn't name its channel (a consent page, or a changed layout)");
  else {
    const asList = { listType: "playlist", list: list, autoplay: 0 };
    note(`YouTube's player alone, the playlist ${list}, unseen (as the app asks): ` + (await ytSays({ css: HIDDEN, host: NOCOOKIE, vars: asList, cue: { listType: "playlist", list: list }, ms: 12000 })));
    note("…the same, in plain sight: " + (await ytSays({ css: SHOWN, host: NOCOOKIE, vars: asList, cue: { listType: "playlist", list: list }, ms: 12000 })));
    note("…in plain sight, from youtube.com rather than youtube-nocookie.com: " + (await ytSays({ css: SHOWN, vars: asList, cue: { listType: "playlist", list: list }, ms: 12000 })));
    note("…in plain sight, the list in the player's settings only (no cuePlaylist): " + (await ytSays({ css: SHOWN, host: NOCOOKIE, vars: asList, ms: 12000 })));
    const ids = await tv.evaluate((l) => import("./js/youtube.js").then((m) => m.playlistIds(l, document.getElementById("tv"), 60, 20000)).then((x) => x, (e) => "failed: " + e.message), list);
    note(`the app's own reading of it: ${Array.isArray(ids) ? ids.length + " videos, first " + ids.slice(0, 3).join(", ") : ids}`);
    await said();
    await sendFromBox("https://www.youtube.com/playlist?list=" + list);
    note("sent as a playlist, the TV: " + (await timeline(60000, (x) => x.sent && x.sent.n > 1 && x.mode === "playing")));
    note("the phone was told: " + (await said()));
    s = await st();
    note(s.sent && s.sent.n > 1 ? `${s.sent.n} videos lined up, on "${s.program}" (${s.mode})` : `it did not line up (mode ${s.mode})`);
    await tv.screenshot({ path: "live-sendto-playlist.png" });
  }
}

check(!errors.length, "no page errors " + errors.join(" | "));
await browser.close();
console.log(failures ? failures + " check(s) failed" : "SEND TO TV, LIVE: ALL GOOD");
process.exit(failures ? 1 : 0);
