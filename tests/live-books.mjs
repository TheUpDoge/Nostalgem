// Live check of the Reading Room against the real Internet Archive. Needs real internet (run it on
// GitHub Actions: "Reading Room check"). Prints what it found.
//
//   1. Every shelf in web/data/books.json finds books.
//   2. In a browser, from another site (like the app): a book's details, its page list (CORS) and its
//      page images load, for a book, a magazine and a manga.
//   3. The app itself: Menu ▸ 📚 Reading Room ▸ a shelf ▸ a book ▸ Borrow & read shows real pages, and a
//      manga opens right to left.
//
//   node tests/live-books.mjs [https://theupdoge.github.io/Nostalgem/ | local]

import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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

// 1. The shelves.
const books = await import("../web/js/books.js");
const shelves = books.parseShelves(JSON.parse(await readFile(join(web, "data/books.json"), "utf8")));
const firstOf = {};
for (const s of shelves) {
  try {
    const r = await fetch(books.bookSearchUrl(s.q, 5));
    const j = await r.json();
    const hits = books.parseBookSearch(j);
    firstOf[s.id] = hits;
    check(hits.length > 0, `${s.icon} ${s.name}: ${j.response ? j.response.numFound : "?"} found (${hits.map((h) => h.t).slice(0, 3).join(" | ")})`);
  } catch (e) {
    check(false, `${s.icon} ${s.name}: ${e.message}`);
  }
}

// 2. Details, page lists and page images, from a browser on another site.
// Autoplay allowed, as in the other live checks: the tuner starts the moment the lineup is in (the start-up
// card plays over it), and a browser that hasn't seen a press yet would leave the picture waiting for one.
// This check is about books, and its first key should open the menu, not start the picture.
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await ctx.addInitScript(() => {
  window.NostalGemRelayBrokers = [];
  localStorage.setItem("nostalgem:seenVersion", JSON.stringify("999.0.0")); // no What's new page in the way
  // A library card already, so the app goes straight to borrowing.
  localStorage.setItem("nostalgem:library", JSON.stringify({ card: { name: "Live Check", number: "NG 0000 0000 0000", issued: Date.now(), terms: 1 }, loans: [], history: [], books: [], marks: {} }));
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(site + "?ch=1");
await page.waitForFunction(() => window.NP && window.NP.state().app === "on", null, { timeout: 30000 }).catch(() => {});

// A book, a two-volume magazine, a manga in a folder named with brackets and braces (no page-number files),
// and today's first manga on the shelf.
const samples = ["alicesadventures00carr", "photoplay3334movi", "manga_Berserk"];
if (firstOf.manga && firstOf.manga[0] && samples.indexOf(firstOf.manga[0].id) < 0) samples.push(firstOf.manga[0].id);
for (const id of samples) {
  const got = await page.evaluate(async (id) => {
    const b = await import("./js/books.js");
    const out = { id };
    try {
      const meta = await (await fetch("https://archive.org/metadata/" + id, { credentials: "omit" })).json();
      const book = b.bookFromMetadata(meta);
      out.title = book.title;
      out.volumes = book.volumes.length;
      out.rtl = book.rtl;
      out.restricted = book.restricted;
      const vol = book.volumes[0];
      out.direct = !!(book.server && book.dir);
      let info = { count: 0 };
      try {
        const pn = await fetch(b.pageNumbersUrl(id, vol.stem), { credentials: "omit" });
        if (pn.ok) info = b.parsePageNumbers(await pn.json());
      } catch (e) {
        /* older scans have no page-number file */
      }
      out.from = "page numbers";
      if (!info.count) {
        const sd = await fetch(b.scandataUrl(id, vol.stem), { credentials: "omit" });
        info = b.parseScandata(await sd.text());
        out.from = "scandata";
      }
      out.count = info.count;
      const load = (url) =>
        new Promise((ok) => {
          const img = new Image();
          const t = setTimeout(() => ok({ w: 0, h: 0, err: "timeout" }), 30000);
          img.onload = () => {
            clearTimeout(t);
            ok({ w: img.naturalWidth, h: img.naturalHeight });
          };
          img.onerror = () => {
            clearTimeout(t);
            ok({ w: 0, h: 0, err: "error" });
          };
          img.src = url;
        });
      out.first = await load(b.pageUrl(id, vol.stem, 0, 800, book));
      out.middle = await load(b.pageUrl(id, vol.stem, Math.floor(info.count / 2), 800, book));
      out.last = await load(b.pageUrl(id, vol.stem, info.count - 1, 800, book));
      // The other way, through archive.org's redirect, for volumes it can name.
      if (!/[{}]/.test(vol.stem)) out.redirect = await load(b.pageUrl(id, vol.stem, 1, 800));
    } catch (e) {
      out.error = e.message;
    }
    return out;
  }, id);
  console.log("    ", JSON.stringify(got));
  check(!got.error && got.volumes > 0 && got.count > 0 && got.direct, `${id}: details and page count from its ${got.from} (${got.title}, ${got.volumes} volume(s), ${got.count} pages${got.rtl ? ", right to left" : ""})`);
  check(got.first && got.first.w >= 300 && got.middle.w >= 300 && got.last.w >= 300, `${id}: page images load straight from its server (first ${got.first && got.first.w}×${got.first && got.first.h}, last ${got.last && got.last.w}×${got.last && got.last.h})`);
  if (got.redirect) check(got.redirect.w >= 300, `${id}: …and through archive.org's redirect (${got.redirect.w}×${got.redirect.h})`);
}

// 3. The app: borrow from a shelf and read.
const key = async (k, wait) => {
  await page.keyboard.press(k);
  await page.waitForTimeout(wait == null ? 300 : wait);
};
const readFrom = async (shelfLabel) => {
  for (let i = 0; i < 6 && (await page.evaluate(() => window.NP.state().overlay || (window.NP.state().reader || {}).open)); i++) await key("Escape", 200);
  await key("ArrowRight", 400);
  await page.click('#menu .m-item:has-text("Reading Room")');
  await page.waitForTimeout(500);
  await page.click(`#menu .m-item:has-text("${shelfLabel}")`);
  await page.waitForFunction(() => document.querySelectorAll("#menu .m-item:not(.head)").length > 2, null, { timeout: 30000 }).catch(() => {});
  const title = (await page.textContent("#menu .m-item:not(.head) .l")).trim();
  await page.click("#menu .m-item:not(.head)");
  await page.waitForFunction(() => /Borrow|Read/.test(document.getElementById("dialog").textContent), null, { timeout: 30000 }).catch(() => {});
  await page.locator("#dialog .d-btn", { hasText: /Borrow|Read/ }).first().click();
  await page.waitForFunction(() => document.querySelectorAll("#reader .rd-page.ok").length > 0, null, { timeout: 45000 }).catch(() => {});
  return title;
};
const novel = await readFrom("📚 Classic novels");
let st = await page.evaluate(() => window.NP.state().reader);
const sizes = await page.$$eval("#reader .rd-page.ok img", (imgs) => imgs.map((i) => i.naturalWidth + "×" + i.naturalHeight));
check(st.open && sizes.length > 0, `Classic novels ▸ ${novel}: Borrow & read shows real pages (${JSON.stringify(st)}, ${sizes.join(", ")})`);
await key("ArrowRight", 2500);
const turned = await page.evaluate(() => window.NP.state().reader);
const sizes2 = await page.$$eval("#reader .rd-page.ok img", (imgs) => imgs.length);
check(turned.p > 0 && sizes2 > 0, `…▶ turns to pages ${JSON.stringify(turned.view)} and they load`);
await page.screenshot({ path: "live-reader.png" });

const manga = await readFrom("🗾 Manga");
st = await page.evaluate(() => window.NP.state().reader);
check(st.open && st.rtl && (await page.$$("#reader .rd-page.ok")).length > 0, `Manga ▸ ${manga}: opens right to left with real pages (${JSON.stringify(st)})`);
await page.screenshot({ path: "live-manga.png" });

check(!errors.length, "no page errors " + errors.join(" | "));
await browser.close();
console.log(failures ? failures + " check(s) failed" : "READING ROOM ON THE REAL ARCHIVE: ALL GOOD");
process.exit(failures ? 1 : 0);
