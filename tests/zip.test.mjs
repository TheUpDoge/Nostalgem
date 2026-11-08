// Reading .zip files (web/js/zip.js) for channel packs: the deflate decoder against zlib, zips built
// here byte by byte (stored and deflated files, folders, a data descriptor), and the ways a zip can be
// wrong. Then a zip of packs through packs.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync, crc32 as zcrc } from "node:zlib";
import { inflateRaw, readZip, crc32, utf8Text } from "../web/js/zip.js";
import { packFilesFromZip, asPack, parsePack, validatePack, packSkipLists } from "../web/js/packs.js";
import { makeZip } from "./fixtures/make-zip.mjs";

const enc = new TextEncoder();

function sample(n, seed) {
  let s = seed;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    out[i] = s >>> 24;
  }
  return out;
}

test("inflate matches zlib: stored, fixed and dynamic blocks, text and noise, long repeats", () => {
  const json = enc.encode(JSON.stringify({ pack: "Westerns", version: 1, channels: Array.from({ length: 40 }, (_, i) => ({ name: "Channel " + i, number: 30 + (i % 20), sources: [{ q: "collection:feature_films AND subject:western" }] })) }));
  const cases = [
    new Uint8Array(0),
    enc.encode("a"),
    enc.encode("hello hello hello hello"),
    json,
    sample(70000, 7),
    new Uint8Array(200000).fill(65),
    enc.encode("ab".repeat(40000) + "xyz".repeat(5000)),
  ];
  for (const data of cases) {
    for (const level of [0, 1, 6, 9]) {
      const packed = new Uint8Array(deflateRawSync(data, { level }));
      assert.deepEqual(inflateRaw(packed, data.length), data, `${data.length} bytes at level ${level}`);
    }
  }
});

test("inflate refuses damage: cut short, wrong size, nonsense", () => {
  const data = enc.encode("The quick brown fox jumps over the lazy dog. ".repeat(50));
  const packed = new Uint8Array(deflateRawSync(data));
  assert.throws(() => inflateRaw(packed.subarray(0, packed.length - 5), data.length), /damaged/);
  assert.throws(() => inflateRaw(packed, data.length - 1), /damaged/);
  assert.throws(() => inflateRaw(packed, data.length + 1), /damaged/);
  assert.throws(() => inflateRaw(new Uint8Array([0xff, 0xff, 0xff, 0xff]), 10), /damaged/);
});

test("CRC-32 agrees with zlib's", () => {
  for (const d of [new Uint8Array(0), enc.encode("123456789"), sample(5000, 3)]) assert.equal(crc32(d), zcrc(d) >>> 0);
  assert.equal(crc32(enc.encode("123456789")), 0xcbf43926);
});

test("a zip: stored and deflated files, folders, a data descriptor, a comment; only the files wanted", () => {
  const zip = makeZip(
    [
      { name: "packs/", data: "", method: 0 },
      { name: "packs/westerns.json", data: '{"pack":"W"}' },
      { name: "packs/horror.json", data: '{"pack":"H"}', method: 0 },
      { name: "readme.txt", data: "hello" },
      { name: "packs/ünïcode.json", data: '{"pack":"U"}', descriptor: true },
    ],
    { comment: "made by a test" }
  );
  const all = readZip(zip);
  assert.deepEqual(all.map((f) => f.name), ["packs/westerns.json", "packs/horror.json", "readme.txt", "packs/ünïcode.json"]);
  const json = readZip(zip.buffer, (n) => /\.json$/.test(n));
  assert.deepEqual(json.map((f) => utf8Text(f.data)), ['{"pack":"W"}', '{"pack":"H"}', '{"pack":"U"}']);
});

test("a zip that can't be read says why", () => {
  const ok = { name: "a.json", data: "{}" };
  assert.throws(() => readZip(enc.encode("not a zip at all, just some words")), /isn't a zip/);
  assert.throws(() => readZip(makeZip([ok]).subarray(0, 30)), /isn't a zip/);
  assert.throws(() => readZip(makeZip([Object.assign({}, ok, { crc: 1234 })])), /doesn't check out/);
  assert.throws(() => readZip(makeZip([Object.assign({}, ok, { encrypted: true })])), /password/);
  assert.throws(() => readZip(makeZip([ok], { cdOffset: 0xffffffff })), /ZIP64/);
  assert.throws(() => readZip(makeZip([Object.assign({}, ok, { method: 12 })])), /method 12/);
  assert.throws(() => readZip(makeZip(Array.from({ length: 201 }, (_, i) => ({ name: i + ".json", data: "{}", method: 0 })))), /more than 200 files/);
  assert.throws(() => readZip(makeZip([Object.assign({}, ok, { usize: 9 * 1024 * 1024 })])), /more than 8 MB/);
  // A file that says it's small but unpacks bigger is caught too.
  assert.throws(() => readZip(makeZip([Object.assign({}, ok, { data: "{" + " ".repeat(500) + "}", usize: 10 })])), /damaged/);
});

test("a zip of packs: every .json file, Mac and hidden files left out; a skip-list file is a pack of clean cuts", () => {
  const westerns = { pack: "Westerns", version: 1, channels: [{ name: "Saddle Up", number: 33, sources: [{ q: "collection:feature_films AND subject:western" }] }] };
  const cuts = { format: "nostalgem-skip-lists/1", lists: [{ item: "film_a", skips: [{ start: 10, end: 20, reason: "sex-scene" }] }] };
  const zip = makeZip([
    { name: "westerns.json", data: JSON.stringify(westerns) },
    { name: "cuts/film-cuts.json", data: "﻿" + JSON.stringify(cuts) },
    { name: "__MACOSX/._westerns.json", data: "junk" },
    { name: ".hidden.json", data: "junk" },
    { name: "notes.md", data: "# notes" },
  ]);
  const files = packFilesFromZip(zip.buffer);
  assert.deepEqual(files.map((f) => f.name), ["westerns.json", "cuts/film-cuts.json"]);
  const packs = files.map((f) => asPack(parsePack(f.text).pack, f.name));
  assert.equal(packs[0].pack, "Westerns");
  assert.equal(packs[1].pack, "film-cuts");
  assert.ok(packs.every((p) => validatePack(p).ok));
  assert.equal(packSkipLists(packs[1])[0].item, "film_a");
  assert.throws(() => packFilesFromZip(enc.encode("nope").buffer), /isn't a zip/);
});
