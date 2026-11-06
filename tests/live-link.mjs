// Live check of the phone remote against the published site and the real PeerJS broker. Needs real
// internet (run it on GitHub Actions: "Phone link check"). Prints a timeline of what each side saw.
//
//   node tests/live-link.mjs [https://theupdoge.github.io/Nostalgem/]

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const site = (process.argv[2] || "https://theupdoge.github.io/Nostalgem/").replace(/\/?$/, "/");
const ABC = "23456789ABCDEFGHJKMNPQRSTWXYZ"; // the alphabet link.js uses (no 0/O, 1/I/L, U/V)
let code = "";
for (let i = 0; i < 6; i++) code += ABC[Math.floor(Math.random() * ABC.length)];
const t0 = Date.now();
const say = (who, msg) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s ${who.padEnd(5)} ${msg}`);

try {
  const r = await fetch("https://0.peerjs.com/peerjs/id?ts=" + Date.now());
  say("net", `broker /peerjs/id → HTTP ${r.status} ${(await r.text()).slice(0, 60)}`);
} catch (e) {
  say("net", "broker unreachable: " + e.message);
}

// The TV app fetches the published lineup from another origin, so Pages must allow that (CORS).
try {
  const r = await fetch(site + "data/lineup.json", { headers: { origin: "https://appassets.androidplatform.net" } });
  const body = await r.json();
  say("net", `published lineup → HTTP ${r.status}, access-control-allow-origin: ${r.headers.get("access-control-allow-origin")}, format ${body.format || 1}, built ${body.built}, ${body.channels.length} channels`);
  if (r.headers.get("access-control-allow-origin") !== "*") say("net", "WARNING: the TV app can't read the published lineup (no CORS)");
} catch (e) {
  say("net", "published lineup: " + e.message);
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const debug = { debug: 3 };
const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await tvCtx.addInitScript(
  ([c, o]) => {
    localStorage.setItem("nostalgem:settings", JSON.stringify({ phone: true }));
    localStorage.setItem("nostalgem:phoneCode", JSON.stringify(c));
    window.NostalGemPeerOptions = o;
  },
  [code, debug]
);
const phCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await phCtx.addInitScript((o) => {
  window.NostalGemPeerOptions = o;
}, debug);
const tv = await tvCtx.newPage();
const ph = await phCtx.newPage();
for (const [who, p] of [["TV", tv], ["phone", ph]]) {
  p.on("console", (m) => say(who, "console." + m.type() + ": " + m.text().slice(0, 300)));
  p.on("pageerror", (e) => say(who, "PAGE ERROR: " + e.message));
  p.on("requestfailed", (r) => say(who, "request failed: " + r.url().slice(0, 120) + " " + (r.failure() && r.failure().errorText)));
}

let ok = false;
try {
  await tv.goto(site + "?ch=1");
  let last = "";
  for (let i = 0; i < 60; i++) {
    const st = await tv.evaluate(() => (window.NP ? window.NP.state().phone : null)).catch(() => null);
    const s = JSON.stringify(st);
    if (s !== last) say("TV", "phone link: " + s);
    last = s;
    if (st && st.status === "ready") break;
    await tv.waitForTimeout(500);
  }
  await ph.goto(site + "remote.html#" + code);
  last = "";
  for (let i = 0; i < 80; i++) {
    const st = await ph.evaluate(() => (window.NGRemote ? window.NGRemote.state().status : "loading")).catch(() => "?");
    const msg = await ph.textContent("#pairMsg").catch(() => "");
    if (st + msg !== last) say("phone", "status: " + st + (msg ? " · " + msg : ""));
    last = st + msg;
    if (st === "connected") break;
    await ph.waitForTimeout(500);
  }
  if ((await ph.evaluate(() => window.NGRemote.state().status)) === "connected") {
    const before = await tv.evaluate(() => window.NP.state().channel);
    await ph.click('[data-key="chup"]');
    await tv.waitForTimeout(1500);
    const after = await tv.evaluate(() => window.NP.state().channel);
    say("check", `CH ▲ from the phone: ${before} → ${after}`);
    ok = after !== before;
  }
} finally {
  say("done", ok ? "PHONE LINK WORKS" : "PHONE LINK FAILED");
  await browser.close();
}
process.exit(ok ? 0 : 1);
