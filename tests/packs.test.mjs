// Channel packs: the validator, the format conversion, and the item-based builder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  PACK_VERSION,
  buildItemsChannel,
  packChannelDef,
  parsePack,
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
