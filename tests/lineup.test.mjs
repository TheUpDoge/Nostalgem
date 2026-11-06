// Checks the built lineup (web/data/lineup.json) against its definitions (web/data/channels.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileExclude } from "../web/js/archive.js";
import { LINEUP_FORMAT } from "../web/js/lineup.js";

const read = (p) => JSON.parse(readFileSync(new URL("../web/data/" + p, import.meta.url), "utf8"));
const lineup = read("lineup.json");
const config = read("channels.json");
const defs = Object.fromEntries(config.channels.map((c) => [c.slug, c]));

// YouTube channels need the API key to build, so until the first "Rebuild lineup" run they may be missing.
test("every defined channel was built, with unique numbers", () => {
  for (const d of config.channels) if (!d.youtube) assert.ok(lineup.channels.some((c) => c.slug === d.slug), d.slug + " was built");
  for (const c of lineup.channels) assert.ok(defs[c.slug], c.slug + " is defined in channels.json");
  const numbers = lineup.channels.map((c) => c.number + "-" + (c.sub || 0));
  assert.equal(new Set(numbers).size, numbers.length);
  assert.equal(new Set(lineup.channels.map((c) => c.slug)).size, numbers.length);
  for (const d of config.channels) {
    const ok = d.youtube ? d.number >= 50 && d.number < 100 : d.number > 0 && d.number < 30;
    assert.ok(ok, `${d.slug}: CH 1-29 is the Archive lineup, 50+ is YouTube; 30-49 is for channels viewers add`);
  }
});

test("the app can read this lineup (format)", () => {
  assert.ok((lineup.format || 1) <= LINEUP_FORMAT, `lineup format ${lineup.format} needs a newer app than ${LINEUP_FORMAT}`);
});

test("plenty of Westerns", () => {
  for (const slug of ["high-noon", "singing-cowboys", "trail-tv", "campfire-radio"]) {
    const c = lineup.channels.find((x) => x.slug === slug);
    assert.ok(c, slug + " exists");
    const hours = c.items.reduce((s, p) => s + p.d, 0) / 3600;
    assert.ok(hours >= 24, `${slug} runs a full day before repeating (${hours.toFixed(1)} h)`);
  }
});

test("every channel has enough to fill hours of air", () => {
  for (const c of lineup.channels) {
    const hours = c.items.reduce((s, p) => s + p.d, 0) / 3600;
    const yt = !!defs[c.slug].youtube;
    const live = c.items.every((p) => p.live);
    assert.ok(c.items.length >= (live ? 2 : yt ? 10 : 25), `${c.slug} has ${c.items.length} programs`);
    assert.ok(hours >= (live ? 0.5 : yt ? 3 : 5), `${c.slug} runs ${hours.toFixed(1)} h`);
  }
});

// A YouTube source may allow longer videos than its channel does (a 5-hour marathon).
function maxMinutes(def) {
  const base = def.maxMinutes || 600;
  if (!def.youtube) return base;
  return Math.max(base, ...def.youtube.map((s) => (s.maxMinutes != null ? s.maxMinutes : base)));
}

// A YouTube source may allow shorter videos than its channel does (a comedian's 3-minute sets).
function minMinutes(def) {
  const base = def.minMinutes || 0;
  if (!def.youtube) return base;
  return Math.min(base, ...def.youtube.map((s) => (s.minMinutes != null ? s.minMinutes : base)));
}

test("programs are playable and fit their channel", () => {
  for (const c of lineup.channels) {
    const def = defs[c.slug];
    const ext = c.kind === "audio" ? /\.mp3$/i : /\.mp4$/i;
    for (const p of c.items) {
      assert.ok(p.id && p.f && p.t, `${c.slug}: program has id, file and title`);
      if (def.youtube) assert.ok(/^yt:[\w-]{11}$/.test(p.id) && p.f === "yt", `${c.slug}: ${p.id} is a YouTube video`);
      else assert.match(p.f, ext, `${c.slug}: ${p.f}`);
      assert.ok(p.d >= minMinutes(def) * 60 - 1 && p.d <= maxMinutes(def) * 60 + 1, `${c.slug}: ${p.t} runs ${p.d}s`);
    }
  }
});

test("nothing excluded made it on the air", () => {
  const words = compileExclude(lineup.exclude);
  const files = compileExclude(lineup.excludeFiles);
  for (const c of lineup.channels) {
    // Phrases a YouTube source "allow"s (an official channel's own "Full Series" watch party).
    const allowed = ((defs[c.slug] && defs[c.slug].youtube) || []).filter((s) => s.allow).map((s) => s.allow);
    const allow = allowed.length ? new RegExp(allowed.join("|"), "gi") : null;
    for (const p of c.items) {
      const text = p.t + " " + (p.e || "");
      assert.ok(!words.test(allow ? text.replace(allow, " ") : text), `${c.slug}: "${text}"`);
      assert.ok(!files.test(p.f), `${c.slug}: ${p.f}`);
      for (const s of p.cc || []) assert.ok(!files.test(s[0]), `${c.slug}: ${s[0]}`);
    }
  }
});

test("year limits hold", () => {
  for (const c of lineup.channels) {
    const def = defs[c.slug];
    const cap = def.maxYear !== undefined ? def.maxYear : config.maxYear;
    if (!cap) continue;
    for (const p of c.items) if (p.y) assert.ok(p.y <= cap, `${c.slug}: ${p.t} (${p.y}) is after ${cap}`);
  }
});

test("quick-add channels are well formed", () => {
  assert.ok(lineup.extras.length >= 6);
  for (const x of lineup.extras) {
    assert.ok(x.slug && x.name && x.sources && x.sources.length, x.slug);
    assert.ok(!lineup.channels.some((c) => c.slug === "x-" + x.slug));
  }
});

test("the lineup is small enough for a TV to load quickly", () => {
  const kb = readFileSync(new URL("../web/data/lineup.json", import.meta.url)).length / 1024;
  // GitHub Pages sends it gzipped (about 30% of this), and parsing 2 MB of JSON takes a TV well under a
  // tenth of a second. Past this, trim descriptions or programs per channel.
  assert.ok(kb < 2000, `${kb.toFixed(0)} KB`);
});

test("YouTube programs' region notes are well formed", () => {
  for (const c of lineup.channels) {
    for (const p of c.items) {
      if (!p.r) continue;
      assert.match(p.r, /^([+-]([A-Z]{2})*|\*[A-Za-z0-9+/]+=*)$/, `${c.slug}: ${p.t} r=${p.r}`);
      if (p.r[0] === "*") assert.ok(lineup.countries && lineup.countries.length % 2 === 0, "a bitmap needs the lineup's country order");
    }
  }
});
