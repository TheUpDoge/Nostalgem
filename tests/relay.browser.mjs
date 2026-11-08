// The phone remote through the relay: the TV and the phone can't open a WebRTC link at all (no
// RTCPeerConnection, as on a network that blocks it), so the only way through is a message broker. Uses a
// local broker (tests/fixtures/mqtt-broker.mjs). Checks that they pair, that the phone changes the
// channel and sees what's on, that a second dead broker in the list doesn't get in the way, and that
// nothing readable passes through the broker.
//
//   npm install --no-save playwright peer && node tests/relay.browser.mjs

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { startBroker } from "./fixtures/mqtt-broker.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const web = join(dirname(fileURLToPath(import.meta.url)), "..", "web");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/json" };
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
const base = "http://127.0.0.1:" + (await listen(site)) + "/";
const broker = await startBroker();
// The first broker in the list is dead, as a blocked one would be.
const brokers = ["ws://127.0.0.1:9/", broker.url];
const CODE = "RTY234";

let failures = 0;
const check = (ok, what) => {
  console.log((ok ? "  ok   " : "  FAIL ") + what);
  if (!ok) failures++;
};

const browser = await chromium.launch();
const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const phCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
for (const ctx of [tvCtx, phCtx]) {
  await ctx.addInitScript((b) => {
    window.NostalGemRelayBrokers = b;
    // No WebRTC at all: the relay is the only way.
    window.RTCPeerConnection = undefined;
    window.webkitRTCPeerConnection = undefined;
  }, brokers);
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
}
await tvCtx.addInitScript((code) => {
  localStorage.setItem("nostalgem:settings", JSON.stringify({ phone: true }));
  localStorage.setItem("nostalgem:phoneCode", JSON.stringify(code));
}, CODE);

const tv = await tvCtx.newPage();
const ph = await phCtx.newPage();
const errors = [];
for (const [who, p] of [["TV", tv], ["phone", ph]]) {
  p.on("pageerror", (e) => errors.push(who + ": " + e.message));
}

await tv.goto(base + "?ch=1");
await tv.waitForFunction(() => window.NP && window.NP.state().phone.status === "ready", null, { timeout: 20000 }).catch(() => {});
check((await tv.evaluate(() => window.NP.state().phone.status)) === "ready", "with no WebRTC, the TV is ready for phones through the relay");

await ph.goto(base + "remote.html#" + CODE);
await ph.waitForFunction(() => window.NGRemote && window.NGRemote.state().status === "connected", null, { timeout: 25000 }).catch(() => {});
check((await ph.evaluate(() => window.NGRemote.state().status)) === "connected", "the phone links up through the relay");
check(/via relay/.test(await ph.textContent("#link")), "…and says so: " + (await ph.textContent("#link")));
await ph.waitForTimeout(800);
check((await tv.evaluate(() => window.NP.state().phone.phones)) === 1, "the TV counts one phone");
check(!!(await ph.evaluate(() => window.NGRemote.state().tv)), "the phone shows what's on the TV");

const before = await tv.evaluate(() => window.NP.state().channel);
await ph.click('[data-key="chup"]');
await tv.waitForTimeout(1500);
const after = await tv.evaluate(() => window.NP.state().channel);
check(after !== before, `CH ▲ on the phone changes the TV's channel (${before} → ${after})`);

// The TV's pairing screen lists each way in: here no direct link, a dead relay server and a live one.
await tv.keyboard.press("ArrowRight");
await tv.waitForTimeout(300);
await tv.click('#menu .m-item:has-text("Phone remote")');
await tv.waitForTimeout(2500);
const pairText = (await tv.textContent("#dialog .d-status")) || "";
check(/This TV: Direct ✗ · 127\.0\.0\.1 ✗ · 127\.0\.0\.1 ✓/.test(pairText), "the TV's pairing screen shows which ways in are open: " + pairText);
await tv.keyboard.press("Escape");
await tv.waitForTimeout(300);

const plain = broker.seen.map((b) => b.toString("latin1")).join("\n");
check(broker.seen.length > 3 && !/chup|hello|state|channels|RTY234/.test(plain), `nothing readable went through the broker (${broker.seen.length} messages)`);

// The TV goes away and comes back: the phone links up again by itself.
await tv.reload();
await ph.waitForFunction(() => window.NGRemote.state().status === "connected", null, { timeout: 30000 }).catch(() => {});
await tv.waitForTimeout(1500);
check((await tv.evaluate(() => window.NP.state().phone.phones)) === 1, "after the TV restarts, the phone is back on it");

check(!errors.length, "no page errors " + errors.join(" | "));
await browser.close();
broker.close();
site.close();
console.log(failures ? failures + " check(s) failed" : "PHONE REMOTE THROUGH THE RELAY: ALL GOOD");
process.exit(failures ? 1 : 0);
