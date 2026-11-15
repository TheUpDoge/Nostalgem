// Channel packs: the validator, the format conversion, and the item-based builder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  PACK_VERSION,
  buildItemsChannel,
  buildLinkPrograms,
  linkCheck,
  linkTitle,
  mixPrograms,
  packChannelDef,
  parsePack,
  shortLink,
  validatePack,
} from "../web/js/packs.js";

const exampleText = readFileSync(fileURLToPath(new URL("../packs/example-pack.json", import.meta.url)), "utf8");
const example = JSON.parse(exampleText);

function pack(channels, extra) {
  return Object.assign({ pack: "Test pack", version: PACK_VERSION, channels: channels }, extra || {});
}
function channel(over) {
  return Object.assign(
    { name: "Test Channel", number: 30, sources: [{ q: "collection:prelinger AND mediatype:movies", rows: 60 }] },
    over || {}
  );
}

test("parsePack: valid JSON, malformed JSON, and non-objects", () => {
  const good = parsePack('{"pack":"x","version":1,"channels":[]}');
  assert.equal(good.ok, true);
  assert.equal(good.pack.pack, "x");
  assert.deepEqual(parsePack("{nope").ok, false);
  assert.match(parsePack("{nope").errors.join(" "), /JSON/);
  assert.equal(parsePack("[]").ok, false);
  assert.equal(parsePack('"just a string"').ok, false);
  assert.equal(parsePack("").ok, false);
});

test("validatePack: the shipped example pack is clean", () => {
  const parsed = parsePack(exampleText);
  assert.equal(parsed.ok, true);
  const v = validatePack(parsed.pack);
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.warnings, []);
});

test("validatePack: the shipped Video Club packs are clean", () => {
  const expectations = {
    "1980s-sci-fi-pd.json": { channels: 2, items: [33, 45] },
    "1990s-horror-pd.json": { channels: 1, items: [36] },
  };
  for (const [name, expect] of Object.entries(expectations)) {
    const text = readFileSync(fileURLToPath(new URL("../packs/" + name, import.meta.url)), "utf8");
    const parsed = parsePack(text);
    assert.equal(parsed.ok, true, name);
    const v = validatePack(parsed.pack);
    assert.deepEqual(v.errors, [], name);
    assert.deepEqual(v.warnings, [], name);
    assert.equal(parsed.pack.channels.length, expect.channels, name);
    parsed.pack.channels.forEach((ch, i) => {
      assert.equal(ch.sources[0].items.length, expect.items[i], name + " ch" + i);
    });
  }
});

test("validatePack: name, version and channels are required", () => {
  assert.match(validatePack({ version: 1, channels: [channel()] }).errors.join(" "), /name/);
  assert.match(validatePack(pack([channel()], { version: 2 })).errors.join(" "), /version/);
  assert.match(validatePack(pack([])).errors.join(" "), /at least one channel/);
  assert.match(validatePack(pack([channel()], { pack: "" })).errors.join(" "), /name/);
  assert.match(validatePack(pack([channel(), channel({ number: 30 })])).errors.join(" "), /used twice/);
  assert.match(validatePack(pack([channel()], { channels: "nope" })).errors.join(" "), /at least one channel/);
});

test("validatePack: numbers stay in the pack ranges", () => {
  for (const bad of [12, 29, 50, 99, 300, 30.5, "30", null]) {
    const v = validatePack(pack([channel({ number: bad })]));
    assert.equal(v.ok, false, "number " + JSON.stringify(bad) + " should fail");
    assert.match(v.errors.join(" "), /number must be a whole number from 30 to 49, 100 to 199, or 200 to 299/);
  }
  assert.equal(validatePack(pack([channel({ number: 30 }), channel({ number: 49 }), channel({ number: 100 }), channel({ number: 299 })])).ok, true);
});

test("validatePack: a pack on CH 200–206, including 202, loads clean", () => {
  const channels = [];
  for (let n = 200; n <= 206; n++) {
    channels.push(
      channel({
        name: n === 202 ? "Computer Chronicles" : "Late " + n,
        number: n,
        sources: [{ items: ["computerchronicles", "Night.Of.The.Living.Dead_1080p"] }],
      })
    );
  }
  const text = JSON.stringify(pack(channels, { pack: "Two hundreds" }));
  const parsed = parsePack(text);
  assert.equal(parsed.ok, true);
  const v = validatePack(parsed.pack);
  assert.equal(v.ok, true);
  assert.deepEqual(v.errors, [], v.errors.join(" | "));
  const at202 = parsed.pack.channels.filter((c) => c.number === 202);
  assert.equal(at202.length, 1);
  assert.equal(at202[0].name, "Computer Chronicles");
  parsed.pack.channels.forEach((ch) => {
    const def = packChannelDef(parsed.pack.pack, ch);
    assert.equal(def.slug, "p-two-hundreds-" + ch.number);
    assert.deepEqual(def.items, ["computerchronicles", "Night.Of.The.Living.Dead_1080p"]);
  });
});

test("validatePack: non-Archive sources are rejected", () => {
  const badSources = [
    { q: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    { q: "youtube.com/@SomeChannel" },
    { q: "https://example.com/videos/show.mp4" },
    { url: "https://example.com/show.mp4" },
    { youtube: [{ handle: "@SomeChannel" }] },
    { items: ["https://archive.org/details/some_item"] },
    { items: ["not an id"] },
    { items: ["ok_id", "bad/id"] },
    { q: "collection:prelinger", items: ["some_item"] },
    {},
  ];
  for (const src of badSources) {
    const v = validatePack(pack([channel({ sources: [src] })]));
    assert.equal(v.ok, false, JSON.stringify(src) + " should fail");
  }
});

test("validatePack: Archive queries and item IDs pass", () => {
  const good = pack([
    channel({ sources: [{ q: "collection:prelinger AND mediatype:movies" }] }),
    channel({ number: 31, sources: [{ items: ["some_item", "another-item_2"] }] }),
    channel({ number: 32, kind: "audio", sources: [{ q: "collection:oldtimeradio AND mediatype:audio", rows: 50 }] }),
  ]);
  const v = validatePack(good);
  assert.deepEqual(v.errors, []);
});

test("validatePack: thin channels warn instead of failing", () => {
  const rows = validatePack(pack([channel({ sources: [{ q: "collection:prelinger", rows: 10 }] })]));
  assert.equal(rows.ok, true);
  assert.match(rows.warnings.join(" "), /thin/);
  const capped = validatePack(pack([channel({ maxItems: 10 })]));
  assert.equal(capped.ok, true);
  assert.match(capped.warnings.join(" "), /thin/);
  const long = validatePack(pack([channel({ name: "A very long channel name indeed" })]));
  assert.equal(long.ok, true);
  assert.match(long.warnings.join(" "), /trimmed/);
  const broad = validatePack(pack([channel({ sources: [{ q: "lone ranger" }] })]));
  assert.equal(broad.ok, true);
  assert.match(broad.warnings.join(" "), /bare search/);
});

test("validatePack: bad kinds, limits and types are rejected", () => {
  assert.equal(validatePack(pack([channel({ kind: "smellovision" })])).ok, false);
  assert.equal(validatePack(pack([channel({ maxItems: 0 })])).ok, false);
  assert.equal(validatePack(pack([channel({ maxMinutes: 10, minMinutes: 20 })])).ok, false);
  assert.equal(validatePack(pack([channel({ filesPerItem: 99 })])).ok, false);
  assert.equal(validatePack(pack([channel({ sources: [] })])).ok, false);
  assert.equal(validatePack(pack([channel({ sources: [{ q: "collection:x", rows: 0 }] })])).ok, false);
});

test("packChannelDef: slug, trimming, and query vs item sources", () => {
  const def = packChannelDef("My Test Pack!", channel());
  assert.equal(def.slug, "p-my-test-pack-30");
  assert.equal(def.name, "Test Channel");
  assert.equal(def.kind, "video");
  assert.equal(def.sources.length, 1);
  assert.equal(def.sources[0].q, "collection:prelinger AND mediatype:movies");
  assert.equal(def.items, undefined);
  const long = packChannelDef("P", channel({ name: "A very long channel name indeed" }));
  assert.equal(long.name.length, 24);
  const items = packChannelDef("P", channel({ sources: [{ items: ["a_one", "b-two"] }] }));
  assert.deepEqual(items.items, ["a_one", "b-two"]);
  assert.equal(items.sources, undefined);
});

// Fake Archive metadata: two films, one series item, one lending item, one dud.
function meta(id, title, files, restricted) {
  const md = { identifier: id, title: title };
  if (restricted) md["access-restricted-item"] = "true";
  return { metadata: md, files: files };
}
function file(name, length) {
  return { name: name, format: "h.264", length: String(length), source: "original" };
}
const metas = {
  film_a: meta("film_a", "Test Film A", [file("TestFilmA.mp4", 3600)]),
  film_a2: meta("film_a2", "Test Film A", [file("TestFilmA2.mp4", 3400)]),
  series_b: meta("series_b", "Test Series B", [file("Ep1.mp4", 1800), file("Ep2.mp4", 1800)]),
  locked_c: meta("locked_c", "Locked Film C", [file("Locked.mp4", 3600)], true),
  dud_d: meta("dud_d", "Dud D", [{ name: "notes.txt", format: "Text", source: "original" }]),
};
const ctx = {
  fetchJson: function (url) {
    const id = url.split("/metadata/")[1];
    if (!metas[id]) return Promise.reject(new Error("not found"));
    return Promise.resolve(metas[id]);
  },
  exclude: [],
  excludeDescription: [],
  excludeFiles: [],
  maxYear: null,
  concurrency: 2,
};

test("buildItemsChannel: items build, lending and duds are skipped, repeats air once", async () => {
  const res = await buildItemsChannel(
    ["film_a", "film_a2", "series_b", "locked_c", "dud_d"],
    { slug: "p-t-30", kind: "video", minMinutes: 0, maxMinutes: 600, filesPerItem: 2, maxItems: 50 },
    ctx
  );
  const titles = res.items.map(function (p) {
    return p.t;
  });
  assert.equal(res.items.length, 3); // Test Film A once, both Series B episodes
  assert.equal(titles.filter(function (t) {
    return t === "Test Film A";
  }).length, 1);
  assert.equal(titles.filter(function (t) {
    return t === "Test Series B";
  }).length, 2);
  assert.ok(res.items.every(function (p) {
    return p.d > 0 && p.f && p.id;
  }));
});

test("buildItemsChannel: filesPerItem 1 takes the longest program per item", async () => {
  const res = await buildItemsChannel(
    ["series_b"],
    { slug: "p-t-30", kind: "video", minMinutes: 0, maxMinutes: 600, filesPerItem: 1, maxItems: 50 },
    ctx
  );
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].d, 1800);
});

test("buildItemsChannel: maxItems caps the channel", async () => {
  const res = await buildItemsChannel(
    ["film_a", "series_b"],
    { slug: "p-t-30", kind: "video", minMinutes: 0, maxMinutes: 600, filesPerItem: 2, maxItems: 2 },
    ctx
  );
  assert.equal(res.items.length, 2);
});

// ---------- direct links (sources[].urls) ----------
const BUNNY = "https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4";
const DREAM = "https://archive.org/download/ElephantsDream/ed_1024_512kb.mp4";
// The Pack Builder's example pack, in shape: two Archive channels and one built only from links.
const builderExample = pack([
  channel({ name: "Archive One", number: 142, sources: [{ items: ["some_item", "another_item"] }] }),
  channel({ name: "Archive Two", number: 143, sources: [{ items: ["third_item"] }] }),
  channel({ name: "Open Movies — via URL", number: 144, sources: [{ urls: [BUNNY, DREAM] }] }),
]);

test("validatePack: the Pack Builder's example (Archive channels and a links-only channel) loads clean", () => {
  const v = validatePack(builderExample);
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.warnings, []);
  const def = packChannelDef(builderExample.pack, builderExample.channels[2]);
  assert.deepEqual(def.urls, [BUNNY, DREAM]);
  assert.equal(def.items, undefined);
  assert.equal(def.sources, undefined);
});

test("validatePack: urls ride with items or a search; a page link warns, a non-link fails", () => {
  const mixed = pack([channel({ sources: [{ items: ["some_item"] }, { urls: [BUNNY] }, { q: "collection:prelinger", urls: [{ url: DREAM, title: "Elephants Dream" }] }] })]);
  assert.deepEqual(validatePack(mixed).errors, []);
  const page = validatePack(pack([channel({ sources: [{ urls: [BUNNY, "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://vimeo.com/76979871"] }] })]));
  assert.deepEqual(page.errors, [], "a page link doesn't fail the pack");
  assert.equal(page.warnings.length, 2);
  assert.match(page.warnings[0], /left out www\.youtube\.com\/watch\?v=dQw4w9WgXcQ — a YouTube page, not a video file/);
  assert.match(page.warnings[1], /Vimeo page/);
  for (const urls of [[], "https://x.org/a.mp4", [42], ["not a link"], ["ftp://x.org/a.mp4"], [{ title: "no url" }], Array(51).fill(BUNNY)]) {
    assert.equal(validatePack(pack([channel({ sources: [{ urls: urls }] })])).ok, false, JSON.stringify(urls).slice(0, 50) + " should fail");
  }
  // The old singular field still fails: it was never the format.
  assert.equal(validatePack(pack([channel({ sources: [{ url: BUNNY }] })])).ok, false);
});

test("linkCheck: files pass, pages and expiring or insecure links are left out with a reason", () => {
  assert.deepEqual(linkCheck(BUNNY, "video", { secure: true }), { ok: true, file: "big_buck_bunny_720p_surround.mp4", hls: false, title: "Big Buck Bunny 720p Surround" });
  assert.equal(linkCheck("https://example.org/live/stream.m3u8", "video").hls, true);
  assert.match(linkCheck("https://example.org/live/stream.m3u8", "video", { hls: false }).why, /m3u8/);
  assert.deepEqual(linkCheck("https://archive.org/details/ElephantsDream", "video"), { ok: true, item: "ElephantsDream" });
  const out = {
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ": /YouTube page/,
    "https://youtu.be/dQw4w9WgXcQ": /YouTube page/,
    "https://m.youtube.com/shorts/abc": /YouTube page/,
    "https://vimeo.com/76979871": /Vimeo page/,
    "https://player.vimeo.com/video/76979871": /Vimeo page/,
    "https://drive.google.com/file/d/abc/view": /sharing page/,
    "https://bucket.s3.amazonaws.com/a.mp4?X-Amz-Expires=3600&X-Amz-Signature=abc": /expires/,
    "https://rr3---sn.googlevideo.com/videoplayback?id=1": /expires/,
    "https://example.org/watch.html": /web page/,
    "https://example.org/poster.jpg": /not a video file/,
    "https://user:pw@example.org/a.mp4": /login/,
  };
  for (const [url, why] of Object.entries(out)) {
    const c = linkCheck(url, "video", { secure: true });
    assert.equal(c.ok, false, url);
    assert.match(c.why, why, url);
    assert.ok(!c.fatal, url + " is left out, not a mistake in the pack");
  }
  assert.match(linkCheck("http://example.org/a.mp4", "video", { secure: true }).why, /http:\/\//);
  assert.equal(linkCheck("http://example.org/a.mp4", "video", { secure: false }).ok, true);
  assert.equal(linkCheck("https://example.org/a.mp3", "video").ok, true, "an unknown kind of file is tried (the player decides)");
  assert.equal(linkCheck("not a link", "video").fatal, true);
  assert.equal(linkTitle("ed_1024_512kb.mp4"), "Ed 1024 512kb");
  assert.equal(linkTitle("Night-of-the-Living-Dead.webm"), "Night – Of – The – Living – Dead");
  assert.equal(shortLink(BUNNY), "archive.org/download/BigBuck…buck_bunny_720p_surround.mp4");
});

test("packChannelDef: an Archive item page in urls becomes an item", () => {
  const def = packChannelDef("P", channel({ sources: [{ items: ["a_item"] }, { urls: ["https://archive.org/details/ElephantsDream", BUNNY] }] }));
  assert.deepEqual(def.items, ["a_item", "ElephantsDream"]);
  assert.deepEqual(def.urls, [BUNNY]);
});

test("buildLinkPrograms: good links become programs, dead and page links are left out with the reason", async () => {
  const lengths = { [BUNNY]: 596.5, [DREAM]: 653.8, "https://example.org/live.m3u8": Infinity, "https://example.org/short.mp4": 30 };
  const probed = [];
  const probe = async (url) => {
    probed.push(url);
    return url in lengths ? { ok: true, d: lengths[url] } : { ok: false, why: "it didn't load" };
  };
  const def = packChannelDef("P", channel({ number: 144, sources: [{ urls: [BUNNY, "https://example.org/dead.mp4", "https://www.youtube.com/watch?v=x1", DREAM, BUNNY, "https://example.org/live.m3u8", "https://example.org/short.mp4"] }] }));
  const r = await buildLinkPrograms(def.urls, def, { probe: probe, secure: true, hls: true });
  assert.deepEqual(r.items.map((p) => [p.u, p.d, !!p.live]), [[BUNNY, 597, false], [DREAM, 654, false], ["https://example.org/live.m3u8", 3600, true]]);
  assert.equal(r.items[0].t, "Big Buck Bunny 720p Surround");
  assert.equal(r.items[0].f, "big_buck_bunny_720p_surround.mp4");
  assert.match(r.items[0].id, /^url:[0-9a-z]+$/);
  assert.notEqual(r.items[0].id, r.items[1].id);
  assert.deepEqual(r.skipped.map((s) => s.url).sort(), ["https://example.org/dead.mp4", "https://example.org/short.mp4", "https://www.youtube.com/watch?v=x1"]);
  assert.match(r.skipped.find((s) => /youtube/.test(s.url)).why, /YouTube page/);
  assert.match(r.skipped.find((s) => /short/.test(s.url)).why, /shorter than the channel's 2 minutes/);
  assert.ok(!probed.some((u) => /youtube/.test(u)), "a page link is never loaded");
  assert.equal(probed.filter((u) => u === BUNNY).length, 1, "a link listed twice is loaded once");
  // A title given in the pack wins over the file's name.
  const titled = await buildLinkPrograms([{ url: DREAM, title: "Elephants Dream" }], def, { probe: probe });
  assert.equal(titled.items[0].t, "Elephants Dream");
  // A probe that throws is a link left out, not a channel lost.
  const boom = await buildLinkPrograms([BUNNY, DREAM], def, { probe: async (u) => { if (u === BUNNY) throw new Error("network down"); return { ok: true, d: 600 }; } });
  assert.deepEqual(boom.items.map((p) => p.u), [DREAM]);
  assert.equal(boom.skipped[0].why, "network down");
});

test("mixPrograms: Archive programs and links share the rotation evenly", () => {
  const a = Array.from({ length: 10 }, (_, i) => "a" + i);
  assert.deepEqual(mixPrograms(a, ["L0", "L1"]), ["a0", "a1", "L0", "a2", "a3", "a4", "a5", "a6", "L1", "a7", "a8", "a9"]);
  assert.deepEqual(mixPrograms(["a0", "a1"], ["L0", "L1"]), ["L0", "a0", "L1", "a1"]);
  assert.deepEqual(mixPrograms([], ["L0"]), ["L0"]);
  assert.deepEqual(mixPrograms(["a0"], []), ["a0"]);
  const m = mixPrograms(a, ["L0", "L1", "L2"]);
  assert.equal(m.length, 13);
  assert.deepEqual(m.filter((x) => x[0] === "a"), a, "each list keeps its own order");
// ---------- the pack list (browsing packs on the TV) ----------
import { parsePackIndex, packIndexLine, PACK_INDEX_FORMAT } from "../web/js/packs.js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync as writeFileNow } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";

test("parsePackIndex: packs beside the list or at https addresses; anything else is left out with why", () => {
  const list = {
    format: PACK_INDEX_FORMAT,
    title: "Test add-ons",
    updated: "2026-11-14",
    packs: [
      { name: "Sci-Fi", file: "packs/sci-fi.json", channels: [{ number: 46, name: "80s Sci-Fi" }, { number: 47, name: "More" }], programs: 37, about: "Rockets." },
      { name: "Bundle", file: "https://cdn.example.org/all.zip", channels: [], programs: 0 },
      { name: "Plain http", file: "http://elsewhere.example.org/p.json" },
      { name: "A page", file: "https://example.org/page.html" },
      "junk",
    ],
  };
  const r = parsePackIndex(list, "https://mitch.example.org/nostalgem/index.json");
  assert.equal(r.ok, true);
  assert.equal(r.title, "Test add-ons");
  assert.deepEqual(r.packs.map((p) => [p.name, p.url, p.zip]), [
    ["Sci-Fi", "https://mitch.example.org/nostalgem/packs/sci-fi.json", false],
    ["Bundle", "https://cdn.example.org/all.zip", true],
  ]);
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /Plain http: its file needs an https/);
  assert.match(r.errors[1], /A page: its file should be a \.json or a \.zip/);
  assert.equal(packIndexLine(r.packs[0]), "CH 46, 47 · 37 programs");
  assert.equal(packIndexLine(r.packs[1]), "");
  // A list on this computer (for trying one out) may name files beside it on the same http address.
  assert.equal(parsePackIndex({ format: PACK_INDEX_FORMAT, packs: [{ file: "a.json" }] }, "http://127.0.0.1:8080/index.json").packs[0].url, "http://127.0.0.1:8080/a.json");
  for (const bad of [null, [], { packs: [] }, { format: "other", packs: [] }, { format: PACK_INDEX_FORMAT }]) assert.equal(parsePackIndex(bad, "https://x.org/i.json").ok, false);
});

test("tools/build-pack-index.mjs lists the packs that would load, and names the ones it leaves out", () => {
  const dir = mkdtempSync(joinPath(tmpdir(), "packs-"));
  writeFileNow(joinPath(dir, "good.json"), JSON.stringify(pack([channel({ name: "Good One", number: 46, sources: [{ items: ["a_1", "b_2"] }, { items: ["c_3"] }] })], { pack: "Good Pack" })));
  writeFileNow(joinPath(dir, "bad.json"), JSON.stringify({ pack: "Bad", version: 9, channels: [] }));
  writeFileNow(joinPath(dir, "notes.txt"), "not a pack");
  const out = execFileSync(process.execPath, [fileURLToPath(new URL("../tools/build-pack-index.mjs", import.meta.url)), dir, "--title", "Test list"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const index = JSON.parse(out);
  assert.equal(index.format, PACK_INDEX_FORMAT);
  assert.equal(index.title, "Test list");
  assert.deepEqual(index.packs, [{ name: "Good Pack", file: "good.json", channels: [{ number: 46, name: "Good One" }], programs: 3 }]);
  const back = parsePackIndex(index, "https://x.org/list/index.json");
  assert.deepEqual(back.packs.map((p) => p.url), ["https://x.org/list/good.json"]);
});
