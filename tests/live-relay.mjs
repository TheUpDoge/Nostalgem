// Live check of the phone link's relay (relay.js) through the real public message brokers. Needs real
// internet (run it on GitHub Actions: "Live Archive check"). Prints what it found.
//
//   1. Each broker on its own, no app: messages of growing size (and bursts of four pack pieces) sent to
//      ourselves. Which sizes come back, and does the broker drop the connection? Reported, never failed:
//      it says what the brokers do today, which is what the pack sender has to live with.
//   2. In the app, phone and TV with no WebRTC (so only the relay can carry them), on each broker alone and
//      then on all of them the way the app runs: a single small pack and a ~45 KB .zip of packs, sent from
//      the phone's Channels page. The TV must ask "Load ...?" and OK must put the packs on the air.
//
//   node tests/live-relay.mjs [https://theupdoge.github.io/Nostalgem/ | local]

import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { makeZip } from "./fixtures/make-zip.mjs";
import { RELAY_BROKERS as PUBLIC, brokerName } from "../web/js/relay.js";
// RELAY_BROKERS=wss://a,wss://b tries other brokers (a local one, to try this script itself).
const RELAY_BROKERS = process.env.RELAY_BROKERS ? process.env.RELAY_BROKERS.split(",") : PUBLIC;
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

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });

// ---------- 1. the brokers on their own ----------
console.log("The brokers, live (each one alone, messages to ourselves):");
{
  const page = await browser.newPage();
  await page.goto(site + "remote.html");
  for (const url of RELAY_BROKERS) {
    const r = await page.evaluate(
      async (a) => {
        const { Broker } = await import(a.site + "js/relay.js");
        const SIZES = [600, 4100, 8200, 12300, 16400, 24600, 49200];
        const topic = "ngprobe/" + Math.random().toString(36).slice(2);
        const got = {};
        let downs = 0;
        let upAt = 0;
        // Two connections, like the phone and the TV: one sends, the other listens.
        const rx = new Broker(
          a.url,
          function (t, bytes) {
            got[bytes.length] = (got[bytes.length] || 0) + 1;
          },
          function (up) {
            if (!up) downs++;
          }
        );
        const b = new Broker(a.url, null, function (up) {
          if (up && !upAt) upAt = Date.now();
          if (!up) downs++;
        });
        const t0 = Date.now();
        rx.subscribe(topic);
        rx.start();
        b.start();
        const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
        while (!(b.up && rx.up) && Date.now() - t0 < 12000) await wait(100);
        if (!(b.up && rx.up)) {
          b.stop();
          rx.stop();
          return { up: false };
        }
        const connectMs = upAt - t0;
        await wait(800);
        const sizes = [];
        for (const n of SIZES) {
          const before = downs;
          const sent = b.publish(topic, new Uint8Array(n).fill(65));
          const t = Date.now();
          while (!got[n] && Date.now() - t < 4000) await wait(50);
          sizes.push(n + (got[n] ? " ok" : sent ? " LOST" : " not sent") + (downs > before ? " (dropped the connection)" : ""));
          if (!(b.up && rx.up)) {
            const t2 = Date.now();
            while (!(b.up && rx.up) && Date.now() - t2 < 8000) await wait(100);
          }
        }
        const burst = async (n) => {
          const before = got[n + 1] || 0;
          for (let i = 0; i < 4; i++) b.publish(topic, new Uint8Array(n + 1).fill(66));
          const t = Date.now();
          while ((got[n + 1] || 0) - before < 4 && Date.now() - t < 5000) await wait(50);
          return (got[n + 1] || 0) - before;
        };
        const burstBig = await burst(12300);
        const burstSmall = await burst(4100);
        const dropped = downs;
        b.stop();
        rx.stop();
        return { up: true, connectMs, sizes, burstBig, burstSmall, downs: dropped };
      },
      { site, url }
    );
    if (!r.up) {
      note(`${brokerName(url)}: couldn't connect from here`);
      continue;
    }
    note(`${brokerName(url)}: connected in ${r.connectMs} ms`);
    note(`   one at a time (bytes): ${r.sizes.join(", ")}`);
    note(`   four 12.3 KB pieces at once: ${r.burstBig} of 4 came back; four 4.1 KB pieces at once: ${r.burstSmall} of 4`);
    if (r.downs) note(`   the connection dropped ${r.downs} time(s)`);
  }
  await page.close();
}

// ---------- 2. packs from the phone, through the relay only ----------
// Packs made up for the test; their channels use films the built-in lineup already plays.
const lineup = JSON.parse(await readFile(join(web, "data", "lineup.json"), "utf8"));
const films = lineup.channels.find((c) => c.slug === "creature-feature").items.map((it) => it.id).filter((id) => !String(id).startsWith("yt:"));
const filler = (n) => randomBytes(n).toString("base64"); // doesn't compress, so the zip stays big
const pack = (name, number, ids, pad) => JSON.stringify({ pack: name, version: 1, notes: filler(pad || 0), channels: [{ name: name, number: number, sources: [{ items: ids }] }] }, null, 1);
const single = pack("Relay Single", 46, films.slice(0, 2), 6000);
const zip = Buffer.from(makeZip([
  { name: "relay-one.json", data: pack("Relay One", 44, films.slice(0, 2), 11000), method: 0 },
  { name: "relay-two.json", data: pack("Relay Two", 45, films.slice(1, 3), 11000), method: 0 },
  { name: "relay-three.json", data: pack("Relay Three", 43, films.slice(2, 4), 11000), method: 0 },
]));
note(`the single pack is ${(single.length / 1024).toFixed(1)} KB, the zip ${(zip.length / 1024).toFixed(1)} KB`);

async function sendBoth(label, brokers) {
  console.log(label);
  const ABC = "23456789ABCDEFGHJKMNPQRSTWXYZ";
  const code = Array.from(randomBytes(6), (x) => ABC[x % ABC.length]).join("");
  const ctxs = [];
  const make = async (vp) => {
    const ctx = await browser.newContext({ viewport: vp });
    ctxs.push(ctx);
    await ctx.addInitScript(
      (a) => {
        if (a.brokers) window.NostalGemRelayBrokers = a.brokers;
        localStorage.setItem("nostalgem:seenVersion", JSON.stringify("999.0.0"));
        localStorage.setItem("nostalgem:settings", JSON.stringify({ phone: true }));
        localStorage.setItem("nostalgem:phoneCode", JSON.stringify(a.code));
        window.RTCPeerConnection = undefined;
        window.webkitRTCPeerConnection = undefined;
      },
      { code, brokers }
    );
    return ctx.newPage();
  };
  const tv = await make({ width: 1280, height: 720 });
  const ph = await make({ width: 390, height: 844 });
  const errors = [];
  for (const [who, p] of [["TV", tv], ["phone", ph]]) p.on("pageerror", (e) => errors.push(who + ": " + e.message));
  try {
    await tv.goto(site + "?ch=1");
    await tv.waitForFunction(() => window.NP && window.NP.state().phone.status === "ready", null, { timeout: 30000 }).catch(() => {});
    await ph.goto(site + "remote.html#" + code);
    await ph.waitForFunction(() => window.NGRemote && window.NGRemote.state().status === "connected" && window.NGRemote.state().tv, null, { timeout: 40000 }).catch(() => {});
    const linked = (await ph.evaluate(() => window.NGRemote.state().status)) === "connected";
    check(linked, "the phone pairs through the relay");
    if (!linked) return;
    await ph.click('#tabs [data-tab="channels"]');
    for (const [name, buffer, want, mime] of [
      ["relay-single.json", Buffer.from(single), ["Relay Single"], "application/json"],
      ["relay-packs.zip", zip, ["Relay One", "Relay Two", "Relay Three"], "application/zip"],
    ]) {
      const t0 = Date.now();
      const [chooser] = await Promise.all([ph.waitForEvent("filechooser"), ph.click("#packBtn")]);
      await chooser.setFiles({ name, mimeType: mime, buffer });
      const asked = await tv
        .waitForFunction(() => /Load th/.test(document.getElementById("dialog").textContent), null, { timeout: 90000 })
        .then(() => true)
        .catch(() => false);
      const said = await ph.evaluate(() => window.NGRemote.state().pack);
      const dialog = await tv.textContent("#dialog");
      check(asked && want.every((w) => dialog.includes(w)), `${name} (${(buffer.length / 1024).toFixed(1)} KB): the TV asks to load ${want.join(", ")} after ${((Date.now() - t0) / 1000).toFixed(1)} s (phone: ${JSON.stringify(said)})`);
      if (!asked) continue;
      await ph.evaluate(() => window.NGRemote.send({ t: "key", type: "ok" }));
      const on = await ph
        .waitForFunction(() => /On the air/.test(window.NGRemote.state().pack), null, { timeout: 30000 })
        .then(() => true)
        .catch(() => false);
      const aired = await ph.evaluate(() => window.NGRemote.state().pack);
      check(on && want.every((w) => aired.includes(w)), `…OK from the phone puts ${want.length === 1 ? "it" : "them"} on the air (${aired.slice(0, 90)})`);
      await tv.waitForTimeout(1500);
    }
  } finally {
    if (errors.length) note("page errors: " + errors.join(" | "));
    for (const c of ctxs) await c.close();
  }
}

for (const url of RELAY_BROKERS) await sendBoth(`Packs through ${brokerName(url)} alone:`, [url]);
await sendBoth("Packs through all the brokers at once (how the app runs):", process.env.RELAY_BROKERS ? RELAY_BROKERS : null);

await browser.close();
console.log(failures ? failures + " check(s) failed" : "THE RELAY: ALL GOOD");
process.exit(failures ? 1 : 0);
