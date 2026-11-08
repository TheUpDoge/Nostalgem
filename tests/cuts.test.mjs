// Clean cuts (web/js/cuts.js): skip lists for sexual content only, a card anywhere, skipping on tapes only.
// The times below are test values, not real scenes: real ones come only from a viewing pass of the file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkSkipLists, cutsFor, listFor, mergeScenes, sceneAt, nextScene, REASONS, SKIP_FORMAT, CARD_TEXT } from "../web/js/cuts.js";
import { validatePack, packSkipLists } from "../web/js/packs.js";

const file = (lists, extra) => Object.assign({ format: SKIP_FORMAT, lists }, extra || {});
const scene = (start, end, reason) => ({ start, end, reason: reason === undefined ? "sex-scene" : reason, note: "test" });

test("the shipped skip-list file reads clean and lists nothing: no times are ever guessed", async () => {
  const json = JSON.parse(await readFile(new URL("../web/data/skip-lists.json", import.meta.url), "utf8"));
  const r = checkSkipLists(json);
  assert.deepEqual(r.errors, []);
  assert.equal(json.format, SKIP_FORMAT);
  assert.equal(json.lists.length, 0);
  assert.equal(json.cardText, CARD_TEXT);
  assert.match(json.note, /never cut/);
});

test("sexual content only: a gore or violence reason refuses the whole list", () => {
  assert.deepEqual(REASONS, ["sexual-assault", "attempted-sexual-assault", "sexual-violence", "sexualized-minor", "nudity-sexualized", "sex-scene", "sexual-content"]);
  for (const reason of ["gore", "violence", "graphic-violence", "language", ""]) {
    const r = checkSkipLists(file([{ item: "film_a", skips: [scene(10, 20), scene(30, 40, reason)] }]));
    assert.equal(r.lists.length, 0, reason);
    assert.match(r.errors.join(" "), /sexual content only/, reason);
  }
  for (const reason of REASONS) assert.equal(checkSkipLists(file([{ item: "film_a", skips: [scene(10, 20, reason)] }])).lists.length, 1, reason);
});

test("a skip list is checked: format, item ids, times, modes", () => {
  assert.match(checkSkipLists({ lists: [] }).errors[0], /format/);
  assert.match(checkSkipLists(file("x")).errors[0], /lists/);
  const bad = [
    [{ item: "has space", skips: [] }, /Archive item id/],
    [{ item: "ok_id", skips: [scene(20, 10)] }, /start before end/],
    [{ item: "ok_id", skips: [scene(-1, 10)] }, /start before end/],
    [{ item: "ok_id", skips: [{ start: "1", end: 9, reason: "sex-scene" }] }, /seconds/],
    [{ item: "ok_id", skips: [scene(0, 4000)] }, /half an hour/],
    [{ item: "ok_id", mode: "fast", skips: [] }, /mode/],
    [{ item: "ok_id", skips: "none" }, /skips/],
  ];
  for (const [l, re] of bad) assert.match(checkSkipLists(file([l])).errors.join(" "), re, JSON.stringify(l));
  const r = checkSkipLists(file([{ item: "ok_id", title: "Ok", skips: [] }]));
  assert.equal(r.lists.length, 1);
  assert.match(r.warnings[0], /no scenes listed yet/);
});

test("scenes come in time order, overlapping ones joined; a list takes the file's mode and card unless it has its own", () => {
  assert.deepEqual(
    mergeScenes([scene(50, 60), scene(10, 20), scene(18, 25), scene(25.3, 30)]).map((s) => [s.start, s.end]),
    [
      [10, 30],
      [50, 60],
    ]
  );
  const r = checkSkipLists(file([{ item: "a", skips: [scene(1, 2)] }, { item: "b", mode: "skip", cardText: "SCENE MISSING", skips: [scene(1, 2)] }], { mode: "card", cardText: "NOT FOR TV" }));
  assert.equal(r.lists[0].mode, "card");
  assert.equal(r.lists[0].cardText, "NOT FOR TV");
  assert.equal(r.lists[1].mode, "skip");
  assert.equal(r.lists[1].cardText, "SCENE MISSING");
  assert.equal(checkSkipLists(file([{ item: "c", skips: [scene(1, 2)] }])).lists[0].cardText, CARD_TEXT);
});

test("a film's list: by item, or by item and file; disabled and empty lists don't count", () => {
  const { lists } = checkSkipLists(
    file([
      { item: "film_a", skips: [scene(1, 2)] },
      { item: "film_a", file: "a2.mp4", skips: [scene(5, 6)] },
      { item: "film_b", enabled: false, skips: [scene(1, 2)] },
      { item: "film_c", skips: [] },
    ])
  );
  assert.equal(listFor(lists, { id: "film_a", f: "a1.mp4" }).skips[0].start, 1);
  assert.equal(listFor(lists, { id: "film_a", f: "a2.mp4" }).skips[0].start, 5);
  assert.equal(listFor(lists, { id: "film_b", f: "b.mp4" }), null);
  assert.equal(listFor(lists, { id: "film_c", f: "c.mp4" }), null);
  assert.equal(listFor(lists, { id: "film_x", f: "x.mp4" }), null);
});

test("how a program plays: the card on live channels, skipping only on a tape with its TV-safe cut on", () => {
  const { lists } = checkSkipLists(file([{ item: "s", mode: "skip", skips: [scene(3, 6)] }, { item: "c", mode: "card", skips: [scene(3, 6)] }]));
  const s = { id: "s", f: "s.mp4" };
  const c = { id: "c", f: "c.mp4" };
  assert.equal(cutsFor(lists, s, false, false).mode, "card", "a live channel never skips: the clock would be off");
  assert.equal(cutsFor(lists, s, true, false).mode, "skip");
  assert.equal(cutsFor(lists, s, true, true), null, "TV-safe cut off: the tape plays as it is");
  assert.equal(cutsFor(lists, c, true, false).mode, "card");
  assert.equal(cutsFor(lists, c, false, false).text, CARD_TEXT);
  assert.equal(cutsFor(lists, { id: "z", f: "z.mp4" }, true, false), null);
});

test("the scene at a moment, and the next one", () => {
  const skips = mergeScenes([scene(10, 20), scene(30, 40)]);
  assert.equal(sceneAt(skips, 9.99), null);
  assert.equal(sceneAt(skips, 10).start, 10);
  assert.equal(sceneAt(skips, 19.9).start, 10);
  assert.equal(sceneAt(skips, 20), null);
  assert.equal(nextScene(skips, 0).start, 10);
  assert.equal(nextScene(skips, 15).start, 30);
  assert.equal(nextScene(skips, 35), null);
});

test("packs can carry clean cuts, checked the same way; a pack can be only that", () => {
  const ch = { name: "Films", number: 33, sources: [{ q: "collection:feature_films" }] };
  const withCuts = { pack: "Films", version: 1, channels: [ch], skipLists: [{ item: "film_a", mode: "skip", skips: [scene(10, 20)] }] };
  assert.deepEqual(validatePack(withCuts).errors, []);
  assert.equal(packSkipLists(withCuts)[0].skips[0].end, 20);
  const gore = { pack: "Films", version: 1, channels: [ch], skipLists: [{ item: "film_a", skips: [scene(10, 20, "gore")] }] };
  assert.match(validatePack(gore).errors.join(" "), /skipLists: .*sexual content only/);
  const only = { pack: "Cuts", version: 1, skipLists: file([{ item: "film_a", skips: [scene(10, 20)] }]) };
  assert.equal(validatePack(only).ok, true);
  assert.equal(packSkipLists(only).length, 1);
  assert.equal(validatePack({ pack: "Empty", version: 1 }).ok, false, "a pack with neither channels nor cuts is nothing");
  assert.deepEqual(packSkipLists({ pack: "x", version: 1, channels: [ch] }), []);
});
