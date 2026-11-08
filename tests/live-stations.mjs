// Live check of the secret stations against the real Internet Archive. Needs real internet (run it on
// GitHub Actions: "Live Archive check"). Prints what it found.
//
//   1. Every film on 069, 666 and 111 plays in a browser, joined partway in, the way the app plays them.
//      Whether 111's could load with CORS (for the full reverb) is reported, with the answers of each
//      server on the way (the Archive's video servers haven't allowed it).
//   2. The app itself: 1 1 1 tunes Pearly Gates, its film plays, and its sound rings: the reverb, or
//      echoes in step with it. 6 6 6 plays at half speed with the pitch down.
//
//   node tests/live-stations.mjs [https://theupdoge.github.io/Nostalgem/ | local]

import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SECRET_STATIONS } from "../web/js/secrets.js";
import { downloadUrl } from "../web/js/archive.js";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const web = join(dirname(fileURLToPath(import.meta.url)), "..", "web");
let site = (process.argv[2] || "local").replace(/\/?$/, "/");
if (site === "local/") {
  const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/json" };
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

// 1. Every film, joined a few minutes in, from another site like the app (CORS where the church needs it).
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(site);
  for (const ch of SECRET_STATIONS) {
    const cors = false;
    let played = 0;
    for (const it of ch.items) {
      const url = downloadUrl(it.id, it.f);
      const r = await page.evaluate(
        (a) =>
          new Promise((done) => {
            const v = document.createElement("video");
            v.muted = true;
            if (a.cors) v.crossOrigin = "anonymous";
            const at = Math.min(180, Math.floor(a.d / 3));
            const t0 = performance.now();
            const finish = (how) => {
              const out = { how, ms: Math.round(performance.now() - t0), w: v.videoWidth, h: v.videoHeight, dur: Math.round(v.duration || 0), at: Math.round(v.currentTime), err: v.error ? v.error.code : 0 };
              v.removeAttribute("src");
              v.load();
              done(out);
            };
            v.addEventListener("playing", () => setTimeout(() => finish("playing"), 400), { once: true });
            v.addEventListener("error", () => finish("error"), { once: true });
            setTimeout(() => finish("timeout"), 60000);
            v.src = a.url + "#t=" + at;
            v.play().catch(() => {});
          }),
        { url, cors, d: it.d }
      );
      const ok = r.how === "playing" && r.w > 0;
      if (ok) played++;
      const lengthOk = !r.dur || Math.abs(r.dur - it.d) < Math.max(30, it.d * 0.05);
      check(ok, `${ch.number} ${it.t}: ${r.how} in ${r.ms} ms, ${r.w}×${r.h}, at ${r.at}s of ${r.dur}s${r.err ? ", error " + r.err : ""}`);
      if (ok && !lengthOk) note(`…listed as ${it.d}s, the file is ${r.dur}s`);
    }
    note(`${ch.number} ${ch.name}: ${played} of ${ch.items.length} films play`);
  }
  // Could a church film load with CORS, for the full reverb? In the browser, and server by server.
  const first = SECRET_STATIONS.find((c) => c.sound === "church").items[0];
  const corsOk = await page.evaluate(
    (url) =>
      new Promise((done) => {
        const v = document.createElement("video");
        v.muted = true;
        v.crossOrigin = "anonymous";
        v.addEventListener("loadedmetadata", () => done("loads"), { once: true });
        v.addEventListener("error", () => done("refused (error " + (v.error && v.error.code) + ")"), { once: true });
        setTimeout(() => done("timeout"), 30000);
        v.src = url;
      }),
    downloadUrl(first.id, first.f)
  );
  note(`with CORS, ${first.t} ${corsOk}`);
  const meta = await (await fetch("https://archive.org/metadata/" + first.id)).json().catch(() => ({}));
  const direct = meta.server && meta.dir ? "https://" + meta.server + meta.dir + "/" + encodeURIComponent(first.f) : "";
  for (const [what, url, origin] of [
    ["download", downloadUrl(first.id, first.f), "https://theupdoge.github.io"],
    ["download, after a redirect (Origin null)", downloadUrl(first.id, first.f), "null"],
    ["cors", "https://archive.org/cors/" + first.id + "/" + encodeURIComponent(first.f), "https://theupdoge.github.io"],
    ["its server, directly", direct, "https://theupdoge.github.io"],
  ]) {
    if (url) note(`${what}: ${await hops(url, origin)}`);
  }
  await ctx.close();
}

// Each answer on the way to a file: status, CORS permission and byte ranges.
async function hops(url, origin) {
  const out = [];
  for (let i = 0; i < 5 && url; i++) {
    let r;
    try {
      r = await fetch(url, { redirect: "manual", headers: { Origin: origin, Range: "bytes=1000-1999" } });
    } catch (e) {
      out.push("failed: " + e.message);
      break;
    }
    out.push(`${r.status} ${new URL(url).host} acao=${r.headers.get("access-control-allow-origin")} range=${r.headers.get("content-range")}`);
    const loc = r.headers.get("location");
    try {
      await r.body?.cancel();
    } catch {
      /* fine */
    }
    url = loc ? new URL(loc, url).href : "";
  }
  return out.join(" → ");
}

// 2. The app: 111 in the church, 666 slow and low.
for (const [num, slug] of [
  ["111", "pearly-gates"],
  ["666", "dead-air"],
]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => {
    localStorage.setItem("nostalgem:seenVersion", JSON.stringify("999.0.0"));
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(site + "?ch=" + num);
  await page.waitForFunction(() => window.NP && window.NP.state().app === "on", null, { timeout: 30000 }).catch(() => {});
  await page.keyboard.press("Enter");
  const played = await page.waitForFunction(() => window.NP.state().mode === "playing", null, { timeout: 90000 }).then(
    () => true,
    () => false
  );
  await page.waitForTimeout(4000);
  const s = await page.evaluate(() => window.NP.state());
  check(played && s.station === slug, `${num} tunes ${s.name} and plays ${s.program} (${s.mode})`);
  if (slug === "pearly-gates") {
    let level = 0;
    for (let i = 0; i < 20 && !level; i++) {
      level = (await page.evaluate(() => window.NP.state().sound.level)) || 0;
      if (!level) await page.waitForTimeout(500);
    }
    await page.waitForFunction(() => window.NP.state().sound.inChurch || window.NP.state().sound.echo.on === 3, null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const snd = (await page.evaluate(() => window.NP.state())).sound;
    check((snd.inChurch && level > 0) || (snd.echo.on === 3 && snd.echo.off < 400), `…and its sound rings around the church (${snd.inChurch ? "reverb, level " + level : "echoes"}: ${JSON.stringify(snd)})`);
  } else {
    check(s.sound.rate === 0.5 && s.sound.pitch === false, `…at half speed, an octave down (${JSON.stringify(s.sound)})`);
  }
  check(s.look.id === (slug === "pearly-gates" ? "glass" : "ascii-666"), `…in its own look (${s.look.id})`);
  await page.screenshot({ path: "live-" + num + ".png" });
  check(!errors.length, "no page errors " + errors.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(failures ? failures + " check(s) failed" : "LIVE STATIONS: ALL GOOD");
process.exit(failures ? 1 : 0);
