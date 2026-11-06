#!/usr/bin/env node
// Builds web/data/lineup.json from web/data/channels.json by asking the Internet Archive.
//
//   node tools/build-lineup.mjs                      rebuild every channel
//   node tools/build-lineup.mjs --only high-noon     rebuild one (or a comma list), keep the rest
//   node tools/build-lineup.mjs --seed fall-2026     reshuffle the running order
//   node tools/build-lineup.mjs --skip-youtube       keep YouTube channels as they are
//   node tools/build-lineup.mjs --youtube-only       rebuild only YouTube channels, keep the rest
//
// Needs Node 18+ and network access to archive.org. No dependencies. Channels with "youtube" sources
// also need the YouTube Data API: set YOUTUBE_API_KEY (see tools/youtube.mjs). Without it they keep
// the programs they had.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildChannel } from "../web/js/archive.js";
import { buildYouTubeChannel, makeYouTubeFetch } from "./youtube.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHANNELS = join(root, "web/data/channels.json");
const LINEUP = join(root, "web/data/lineup.json");

function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const only = arg("only", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const concurrency = Number(arg("concurrency", "5"));
const seed = arg("seed", "");
const skipYouTube = process.argv.includes("--skip-youtube");
const youTubeOnly = process.argv.includes("--youtube-only");
const yt = makeYouTubeFetch(process.env.YOUTUBE_API_KEY || "");
let youTubeDown = "";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "NostalGem-lineup-builder/1.0" } });
      if (res.status === 429 || res.status >= 500) throw new Error("HTTP " + res.status);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (e) {
      last = e;
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw last;
}

const config = JSON.parse(await readFile(CHANNELS, "utf8"));
let previous = null;
try {
  previous = JSON.parse(await readFile(LINEUP, "utf8"));
} catch {
  /* first build */
}
if ((only.length || youTubeOnly) && !previous) {
  console.error("--only and --youtube-only need an existing lineup.json; run a full build first.");
  process.exit(1);
}

const prevBySlug = {};
if (previous) for (const c of previous.channels) prevBySlug[c.slug] = c;

const about = {};
const channels = [];
const summary = [];
for (const def of config.channels) {
  const display = {
    number: def.number,
    slug: def.slug,
    name: def.name,
    tagline: def.tagline,
    icon: def.icon,
    color: def.color,
    kind: def.kind || "video",
  };
  if (def.preferSubtitles) display.preferSubtitles = def.preferSubtitles;
  if (def.sub) display.sub = def.sub;
  if (def.offset != null) display.offset = def.offset;
  const keep = () => {
    const kept = prevBySlug[def.slug];
    if (!kept) return false;
    channels.push({ ...display, items: kept.items });
    for (const p of kept.items) if (previous.about && previous.about[p.id]) about[p.id] = previous.about[p.id];
    return true;
  };

  if ((only.length && !only.includes(def.slug)) || (youTubeOnly && !def.youtube)) {
    keep();
    continue;
  }
  if (def.youtube && (skipYouTube || youTubeDown)) {
    if (!keep()) console.log(`CH ${def.number}${def.sub ? "-" + def.sub : ""} ${def.name}: left out (no YouTube access)`);
    continue;
  }

  process.stdout.write(`CH ${String(def.number).padStart(2)}${def.sub ? "-" + def.sub : "  "} ${def.name.padEnd(18)} `);
  const t0 = Date.now();
  if (def.youtube) {
    let built;
    try {
      built = await buildYouTubeChannel(def, { yt, exclude: config.exclude, seed, log: (m) => process.stdout.write("\n" + m) });
    } catch (e) {
      youTubeDown = e.message;
      console.log(`\n   ⚠ YouTube API unavailable: ${e.message.slice(0, 160)}`);
      if (!keep()) console.log("   left out until it can be built");
      continue;
    }
    Object.assign(about, built.about);
    channels.push({ ...display, items: built.items });
    const hours = built.items.reduce((s, p) => s + p.d, 0) / 3600;
    summary.push({ ch: def.number + (def.sub ? "-" + def.sub : ""), name: def.name, programs: built.items.length, hours: +hours.toFixed(1), searched: built.searched });
    const why = Object.entries(built.rejected).map(([k, n]) => `${n} ${k}`).join(", ");
    console.log(`${String(built.items.length).padStart(4)} programs  ${hours.toFixed(1).padStart(6)} h  ${((Date.now() - t0) / 1000).toFixed(0)}s${why ? "  (skipped: " + why + ")" : ""}`);
    if (built.items.length < 8) console.warn(`   ⚠ only ${built.items.length} programs on ${def.slug}`);
    continue;
  }
  const built = await buildChannel(def, {
    fetchJson,
    exclude: config.exclude,
    excludeDescription: config.excludeDescription,
    excludeFiles: config.excludeFiles,
    maxYear: config.maxYear,
    concurrency,
    seed,
    log: (m) => process.stdout.write("\n" + m),
  });
  Object.assign(about, built.about);
  channels.push({ ...display, items: built.items });
  const hours = built.items.reduce((s, p) => s + p.d, 0) / 3600;
  const subs = built.items.filter((p) => p.cc && p.cc.some((c) => !c[2])).length;
  const auto = built.items.filter((p) => p.cc && p.cc.some((c) => c[2])).length;
  summary.push({ ch: def.number, name: def.name, programs: built.items.length, hours: +hours.toFixed(1), subtitles: subs, autoCC: auto, searched: built.searched });
  console.log(`${String(built.items.length).padStart(4)} programs  ${hours.toFixed(1).padStart(6)} h  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (built.items.length < 8) console.warn(`   ⚠ only ${built.items.length} programs on ${def.slug}; widen its query`);
}

if (!summary.length && previous && channels.length === previous.channels.length) {
  console.log("Nothing was rebuilt; lineup.json left as it is.");
  process.exit(0);
}

const lineup = {
  name: "NOSTALGEM",
  built: new Date().toISOString(),
  seed,
  gap: config.gapSeconds || 8,
  epoch: "2026-01-01T00:00:00Z",
  exclude: config.exclude,
  excludeDescription: config.excludeDescription,
  excludeFiles: config.excludeFiles,
  maxYear: config.maxYear,
  extras: config.extras || [],
  channels,
  about,
};
await writeFile(LINEUP, JSON.stringify(lineup));
console.table(summary);
const bytes = Buffer.byteLength(JSON.stringify(lineup));
console.log(`wrote ${LINEUP} (${(bytes / 1024).toFixed(0)} KB, ${channels.length} channels)`);
