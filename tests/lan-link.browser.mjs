// The phone remote over a real WebRTC handshake, on a network like a typical home Wi-Fi: neither device
// can look up the other's hidden ".local" address (Wi-Fi that filters multicast, and an Android app that
// doesn't hear multicast), and there's no STUN or TURN server, so the only way through is directly
// across the local network.
//
//   A. The TV app tells the page this TV's real address (window.NostalGemTV): the phone must link up and
//      change the channel.
//   B. No app (a browser): the link can't come up, and both sides must say so with details.
//
// Uses a local PeerJS broker. Needs Playwright and PeerJS's server: npm install --no-save playwright peer
//   node tests/lan-link.browser.mjs

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { PeerServer } = require("peer");

const web = join(dirname(fileURLToPath(import.meta.url)), "..", "web");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/json" };

// This machine's address on its network, standing in for the TV's Wi-Fi address.
let lanIp = "";
for (const list of Object.values(networkInterfaces())) {
  for (const a of list || []) if (!lanIp && a.family === "IPv4" && !a.internal) lanIp = a.address;
}
if (!lanIp) {
  console.log("SKIP: no network address on this machine");
  process.exit(0);
}

const listen = (srv) => new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok(srv.address().port)));
const site = createServer(async (q, s) => {
  const path = new URL(q.url, "http://x").pathname;
  const file = normalize(join(web, path === "/" ? "index.html" : path));
  if (!file.startsWith(web)) return s.writeHead(403).end();
  try {
    s.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(await readFile(file));
  } catch {
    s.writeHead(404).end();
  }
});
const sitePort = await listen(site);
const broker = await new Promise((ok) => {
  const srv = PeerServer({ host: "127.0.0.1", port: 0, path: "/" }, (s) => ok(s));
  return srv;
});
const peerOpts = { host: "127.0.0.1", port: broker.address().port, path: "/", secure: false, config: { iceServers: [] } };
const base = "http://127.0.0.1:" + sitePort + "/";

let failures = 0;
const check = (ok, what) => {
  console.log((ok ? "  ok   " : "  FAIL ") + what);
  if (!ok) failures++;
};

// Drops hidden addresses instead of looking them up, as a device on such a network ends up doing.
function cannotResolveHidden() {
  window.__got = [];
  const add = RTCPeerConnection.prototype.addIceCandidate;
  RTCPeerConnection.prototype.addIceCandidate = function (c) {
    const text = (c && c.candidate) || "";
    window.__got.push(text);
    if (/\.local /.test(text)) return Promise.resolve();
    return add.apply(this, arguments);
  };
}

async function pairUp(code, withApp) {
  const browser = await chromium.launch();
  const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const phCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  for (const ctx of [tvCtx, phCtx]) {
    await ctx.addInitScript((o) => {
      window.NostalGemPeerOptions = o;
      window.NostalGemRelayBrokers = []; // this test is about the direct link
      localStorage.setItem("nostalgem:seenVersion", JSON.stringify("999.0.0")); // no What's new page in the way
    }, peerOpts);
    await ctx.addInitScript(cannotResolveHidden);
    // Nothing from the internet: programs, the published lineup and YouTube stay out of it.
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  }
  await tvCtx.addInitScript(
    ([c, ip, app]) => {
      localStorage.setItem("nostalgem:settings", JSON.stringify({ phone: true }));
      localStorage.setItem("nostalgem:phoneCode", JSON.stringify(c));
      // What the Android app injects (WebViewCompat.addWebMessageListener).
      if (app)
        window.NostalGemTV = {
          onmessage: null,
          postMessage(m) {
            if (m === "hello") setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify({ lan: [ip], app: "1.0.test" }) }), 10);
          },
        };
    },
    [code, lanIp, withApp]
  );
  const tv = await tvCtx.newPage();
  const ph = await phCtx.newPage();
  const errors = [];
  for (const p of [tv, ph]) p.on("pageerror", (e) => errors.push(e.message));
  await tv.goto(base + "?ch=1&tv=android");
  await tv.waitForFunction(() => window.NP && window.NP.state().phone.status === "ready", null, { timeout: 30000 });
  const tvState = await tv.evaluate(() => window.NP.state());
  await ph.goto(base + "remote.html#" + code);
  const t0 = Date.now();
  await ph.waitForFunction(() => window.NGRemote && (window.NGRemote.state().status === "connected" || document.getElementById("pairWhy").textContent), null, { timeout: 40000 });
  const result = {
    tvState,
    seconds: (Date.now() - t0) / 1000,
    status: await ph.evaluate(() => window.NGRemote.state().status),
    msg: await ph.textContent("#pairMsg"),
    why: await ph.textContent("#pairWhy"),
    got: await ph.evaluate(() => window.__got),
    errors,
    tv,
    ph,
    browser,
  };
  return result;
}

console.log("A. TV app on the same Wi-Fi (address " + lanIp + ")");
const a = await pairUp("K7PQ2M", true);
check(a.tvState.phone.lan === 1 && a.tvState.tvApp === "1.0.test", "the page got the TV app's address and version");
check(a.got.some((c) => /\.local /.test(c)) && a.got.some((c) => c.indexOf(" " + lanIp + " ") > 0), "the phone got the hidden address and a real copy");
check(a.status === "connected", "the phone linked up (" + a.seconds.toFixed(1) + " s)" + (a.status !== "connected" ? ": " + a.msg + " " + a.why : ""));
if (a.status === "connected") {
  await a.ph.waitForFunction(() => window.NGRemote.state().channels > 5, null, { timeout: 5000 }).catch(() => {});
  const before = await a.tv.evaluate(() => window.NP.state().channel);
  await a.ph.click('[data-key="chup"]');
  await a.tv.waitForFunction((b) => window.NP.state().channel !== b, before, { timeout: 5000 }).catch(() => {});
  const after = await a.tv.evaluate(() => window.NP.state().channel);
  check(after !== before, "CH ▲ on the phone changed the TV's channel (" + before + " → " + after + ")");
  check((await a.tv.evaluate(() => window.NP.state().phone.phones)) === 1, "the TV counts one phone");
}
check(!a.errors.length, "no page errors" + (a.errors.length ? ": " + a.errors.join(" | ") : ""));
await a.browser.close();

console.log("B. A browser as the TV: no real address to give");
const b = await pairUp("GHJKMN", false);
check(b.status !== "connected", "no link (as on such a network)");
check(/^Step 3 of 3 failed: your TV answered/.test(b.msg), "the phone says the TV answered but they couldn't reach each other");
check(/^Details: answered · ICE /.test(b.why), "the phone shows the details: " + b.why);
await b.tv.waitForFunction(() => window.NP.state().phone.calling === "failed", null, { timeout: 15000 }).catch(() => {});
const tvSide = await b.tv.evaluate(() => window.NP.state().phone);
check(tvSide.calling === "failed" && /^answered · ICE /.test(tvSide.why), "the TV says the call failed, with details: " + tvSide.why);
check(!b.errors.length, "no page errors" + (b.errors.length ? ": " + b.errors.join(" | ") : ""));
await b.browser.close();

site.close();
broker.close();
console.log(failures ? failures + " FAILED" : "PHONE LINK ON A LOCAL NETWORK: ALL GOOD");
process.exit(failures ? 1 : 0);
