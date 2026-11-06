// Checks the built lineup (web/data/lineup.json) against its definitions (web/data/channels.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileExclude } from "../web/js/archive.js";

const read = (p) => JSON.parse(readFileSync(new URL("../web/data/" + p, import.meta.url), "utf8"));
const lineup = read("lineup.json");
const config = read("channels.json");
const defs = Object.fromEntries(config.channels.map((c) => [c.slug, c]));

test("every defined channel was built, with unique numbers", () => {
  assert.equal(lineup.channels.length, config.channels.length);
  const numbers = lineup.channels.map((c) => c.number);
  assert.equal(new Set(numbers).size, numbers.length);
  assert.equal(new Set(lineup.channels.map((c) => c.slug)).size, numbers.length);
  for (const c of lineup.channels) assert.ok(c.number > 0 && c.number < 30, `${c.slug}: CH 1-29 is the house lineup; 30+ is for channels viewers add`);
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
    assert.ok(c.items.length >= 25, `${c.slug} has ${c.items.length} programs`);
    assert.ok(hours >= 5, `${c.slug} runs ${hours.toFixed(1)} h`);
  }
});

test("programs are playable and fit their channel", () => {
  for (const c of lineup.channels) {
    const def = defs[c.slug];
    const ext = c.kind === "audio" ? /\.mp3$/i : /\.mp4$/i;
    for (const p of c.items) {
      assert.ok(p.id && p.f && p.t, `${c.slug}: program has id, file and title`);
      assert.match(p.f, ext, `${c.slug}: ${p.f}`);
      assert.ok(p.d >= (def.minMinutes || 0) * 60 - 1 && p.d <= (def.maxMinutes || 600) * 60 + 1, `${c.slug}: ${p.t} runs ${p.d}s`);
    }
  }
});

test("nothing excluded made it on the air", () => {
  const words = compileExclude(lineup.exclude);
  const files = compileExclude(lineup.excludeFiles);
  for (const c of lineup.channels) {
    for (const p of c.items) {
      assert.ok(!words.test(p.t + " " + (p.e || "")), `${c.slug}: "${p.t} ${p.e || ""}"`);
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
  assert.ok(kb < 1200, `${kb.toFixed(0)} KB`);
});
