// Live check of the phone remote against the published site and the real PeerJS broker. Needs real
// internet (run it on GitHub Actions: "Phone link check"). Prints a timeline of what each side saw.
//
//   1. A browser as the TV, the usual way.
//   2. The TV app on home Wi-Fi: neither side can look up the other's hidden ".local" address and no
//      STUN or TURN server helps, so only the real address the TV app hands the page gets them linked.
//
//   node tests/live-link.mjs [https://theupdoge.github.io/Nostalgem/]

import { createRequire } from "node:module";
import { networkInterfaces } from "node:os";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const site = (process.argv[2] || "https://theupdoge.github.io/Nostalgem/").replace(/\/?$/, "/");
const ABC = "23456789ABCDEFGHJKMNPQRSTWXYZ"; // the alphabet link.js uses (no 0/O, 1/I/L, U/V)
const newCode = () => {
  let c = "";
  for (let i = 0; i < 6; i++) c += ABC[Math.floor(Math.random() * ABC.length)];
  return c;
};
const t0 = Date.now();
const say = (who, msg) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s ${who.padEnd(5)} ${msg}`);

let lanIp = "";
for (const list of Object.values(networkInterfaces())) for (const a of list || []) if (!lanIp && a.family === "IPv4" && !a.internal) lanIp = a.address;

try {
  const r = await fetch("https://0.peerjs.com/peerjs/id?ts=" + Date.now());
  say("net", `broker /peerjs/id → HTTP ${r.status} ${(await r.text()).slice(0, 60)}`);
} catch (e) {
  say("net", "broker unreachable: " + e.message);
}

// The TV app's offline copy fetches the published lineup from another origin, so Pages must allow that (CORS).
try {
  const r = await fetch(site + "data/lineup.json", { headers: { origin: "https://appassets.androidplatform.net" } });
  const body = await r.json();
  say("net", `published lineup → HTTP ${r.status}, access-control-allow-origin: ${r.headers.get("access-control-allow-origin")}, format ${body.format || 1}, built ${body.built}, ${body.channels.length} channels`);
  if (r.headers.get("access-control-allow-origin") !== "*") say("net", "WARNING: the TV app can't read the published lineup (no CORS)");
} catch (e) {
  say("net", "published lineup: " + e.message);
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });

// Drops hidden addresses instead of looking them up, as a device on such a network ends up doing.
function cannotResolveHidden() {
  const add = RTCPeerConnection.prototype.addIceCandidate;
  RTCPeerConnection.prototype.addIceCandidate = function (c) {
    if (/\.local /.test((c && c.candidate) || "")) return Promise.resolve();
    return add.apply(this, arguments);
  };
}

async function pairUp(name, app) {
  const code = newCode();
  say("test", `--- ${name} (code ${code})`);
  const peerOpts = app ? { debug: 2, config: { iceServers: [] } } : { debug: 2 };
  const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const phCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  for (const ctx of [tvCtx, phCtx]) {
    await ctx.addInitScript((o) => {
      window.NostalGemPeerOptions = o;
    }, peerOpts);
    if (app) await ctx.addInitScript(cannotResolveHidden);
  }
  await tvCtx.addInitScript(
    ([c, ip, app]) => {
      localStorage.setItem("nostalgem:settings", JSON.stringify({ phone: true }));
      localStorage.setItem("nostalgem:phoneCode", JSON.stringify(c));
      if (app)
        window.NostalGemTV = {
          onmessage: null,
          postMessage(m) {
            if (m === "hello") setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify({ lan: [ip], app: "live-check" }) }), 10);
          },
        };
    },
    [code, lanIp, app]
  );
  const tv = await tvCtx.newPage();
  const ph = await phCtx.newPage();
  for (const [who, p] of [["TV", tv], ["phone", ph]]) {
    p.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") say(who, "console." + m.type() + ": " + m.text().slice(0, 300));
    });
    p.on("pageerror", (e) => say(who, "PAGE ERROR: " + e.message));
    p.on("requestfailed", (r) => {
      if (!/archive\.org|youtube|ytimg/.test(r.url())) say(who, "request failed: " + r.url().slice(0, 120) + " " + (r.failure() && r.failure().errorText));
    });
  }
  let ok = false;
  try {
    await tv.goto(site + "?ch=1" + (app ? "&tv=android" : ""));
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
      const msg = (await ph.textContent("#pairMsg").catch(() => "")) + " " + (await ph.textContent("#pairWhy").catch(() => ""));
      if (st + msg !== last) say("phone", "status: " + st + (msg.trim() ? " · " + msg.trim() : ""));
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
    say("done", name + ": " + (ok ? "PHONE LINK WORKS" : "PHONE LINK FAILED"));
    await tvCtx.close();
    await phCtx.close();
  }
  return ok;
}

const plain = await pairUp("browser as the TV", false);
const app = lanIp ? await pairUp("TV app on home Wi-Fi (address " + lanIp + ")", true) : true;
await browser.close();
process.exit(plain && app ? 0 : 1);
