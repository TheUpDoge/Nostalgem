// The dial (web/js/dial.js): which channel typed digits reach, how they read while tuning, and where a
// pack's channels go now that packs may use the hundreds (100–199) as well as 30–49.
import { test } from "node:test";
import assert from "node:assert/strict";
import { channelForDigits, moreToType, numberTaken, packNumberFor, packNumberOk, typedLabel, PACK_RANGES } from "../web/js/dial.js";
import { chKey, chLabel, numberText } from "../web/js/util.js";
import { validatePack } from "../web/js/packs.js";

const ch = (number, sub, name) => ({ number, sub, slug: (name || "ch") + "-" + number + (sub ? "-" + sub : ""), name: name || "CH " + number });
// A dial like the shipped one: built-ins with sub-channels (3-2, 15-2, 17-2), YouTube sub-channels in the
// 50s, the secret stations, and a pack channel at 101.
const DIAL = [
  ch(1), ch(3), ch(3, 2, "iron-horse"), ch(10), ch(15), ch(15, 2, "wanderlust"), ch(17), ch(17, 2, "wild-blue"),
  ch(30), ch(31), ch(50, 1, "yt"), ch(50, 2, "yt"), ch(60, 1, "yt"), ch(60, 10, "yt"),
  ch(69, 0, "bbc"), ch(101, 0, "pack"), ch(111, 0, "pearly-gates"), ch(420), ch(555), ch(666), ch(777),
];
const find = (n, sub) => DIAL.find((c) => c.number === n && (c.sub || 0) === (sub || 0));

test("packs may use 30–49 and the hundreds, 100–199; nothing else", () => {
  assert.deepEqual(PACK_RANGES, [[30, 49], [100, 199]]);
  for (const n of [30, 49, 100, 101, 150, 199]) assert.equal(packNumberOk(n), true, String(n));
  for (const n of [29, 50, 99, 200, 1000, 100.5, "101", null]) assert.equal(packNumberOk(n), false, String(n));
  const pack = (number) => ({ pack: "Hundreds", version: 1, channels: [{ name: "Late Show", number, sources: [{ q: "collection:feature_films AND mediatype:movies", rows: 60 }] }] });
  assert.deepEqual(validatePack(pack(101)).errors, []);
  assert.deepEqual(validatePack(pack(199)).errors, []);
  for (const bad of [99, 200, 250]) assert.match(validatePack(pack(bad)).errors.join(" "), /30 to 49, or 100 to 199/, String(bad));
});

test("what typing reaches: a channel's own number, then a sub-channel the short way", () => {
  assert.equal(channelForDigits(DIAL, "101", false), find(101), "1 0 1 is CH 101");
  assert.equal(channelForDigits(DIAL, "152", false), find(15, 2), "1 5 2 is CH 15-2");
  assert.equal(channelForDigits(DIAL, "501", false), find(50, 1));
  assert.equal(channelForDigits(DIAL, "6010", false), find(60, 10));
  assert.equal(channelForDigits(DIAL, "032", false), find(3, 2), "0 3 2 is CH 03-2, as the guide writes it");
  assert.equal(channelForDigits(DIAL, "32", false), find(3, 2), "3 2 still reaches 3-2 with no CH 32 on the dial");
  const withPack32 = DIAL.concat([ch(32, 0, "pack")]);
  assert.equal(channelForDigits(withPack32, "32", false).number, 32, "…but a CH 32 of its own comes first");
  assert.equal(channelForDigits(withPack32, "032", false), find(3, 2), "…and 0 3 2 still reaches 3-2");
  assert.equal(channelForDigits(DIAL, "50", false), null);
  assert.equal(channelForDigits(DIAL, "50", true), find(50, 1), "5 0 goes to the first sub-channel");
  assert.equal(channelForDigits(DIAL, "069", true), find(69), "0 6 9 is the secret 069");
  assert.equal(channelForDigits(DIAL, "102", true), null);
  assert.equal(chKey(find(3, 2)), "032");
  assert.equal(chKey(find(101)), "101");
  assert.equal(chLabel(find(101)), "101");
  assert.equal(numberText("3-2"), "032");
  assert.equal(numberText("15-2"), "152");
});

test("more digits may follow: 1 0 waits for 101, 6 0 1 for 60-10", () => {
  assert.equal(moreToType(DIAL, "10"), true);
  assert.equal(moreToType(DIAL, "101"), false);
  assert.equal(moreToType(DIAL, "601"), true);
  assert.equal(moreToType(DIAL, "3"), true);
  assert.equal(moreToType(DIAL, "77"), true);
  assert.equal(moreToType(DIAL, "777"), false);
});

test("the OSD: CH 101 is a channel, 50-1 a sub-channel; a dash only where there are sub-channels", () => {
  assert.equal(typedLabel(DIAL, "1", false), "1-");
  assert.equal(typedLabel(DIAL, "10", false), "10-");
  assert.equal(typedLabel(DIAL, "101", false), "101", "CH 101, not 10-1");
  assert.equal(typedLabel(DIAL, "501", false), "50-1");
  assert.equal(typedLabel(DIAL, "152", false), "15-2");
  assert.equal(typedLabel(DIAL, "601", false), "60-1", "on the way to 60-10");
  assert.equal(typedLabel(DIAL, "032", false), "03-2");
  assert.equal(typedLabel(DIAL, "111", false), "111");
  // A miss (shown with NO SIGNAL)
  assert.equal(typedLabel(DIAL, "102", true), "102", "CH 102 NO SIGNAL, not 10-2");
  assert.equal(typedLabel(DIAL, "199", true), "199");
  assert.equal(typedLabel(DIAL, "509", true), "50-9", "CH 50 has sub-channels, so 5 0 9 reads as one");
  assert.equal(typedLabel(DIAL, "7", true), "07");
  assert.equal(typedLabel(DIAL, "88", true), "88");
});

test("a number is taken when a channel has it or typing it reaches one", () => {
  assert.equal(numberTaken(DIAL, 101), true);
  assert.equal(numberTaken(DIAL, 111), true, "a secret station");
  assert.equal(numberTaken(DIAL, 152), true, "how CH 15-2 is typed");
  assert.equal(numberTaken(DIAL, 172), true, "how CH 17-2 is typed");
  assert.equal(numberTaken(DIAL, 32), false, "CH 3-2 is typed 0 3 2, so 32 is free for a pack");
  assert.equal(numberTaken(DIAL, 102), false);
});

test("the renumber path: the number asked for, else the next free one in its range, then the other range", () => {
  assert.equal(packNumberFor(DIAL, 120), 120);
  assert.equal(packNumberFor(DIAL, 101), 102, "101 is taken: the next one along");
  assert.equal(packNumberFor(DIAL, 111), 112, "past the secret station");
  assert.equal(packNumberFor(DIAL, 151), 151);
  assert.equal(packNumberFor(DIAL.concat([ch(151)]), 151), 153, "151 taken, 152 is CH 15-2's: 153");
  assert.equal(packNumberFor(DIAL, 30), 32, "30 and 31 taken: 32");
  assert.equal(packNumberFor(DIAL, 199), 199);
  assert.equal(packNumberFor(DIAL.concat([ch(199)]), 199), 100, "wraps to the start of the hundreds");
  // 30–49 full: the hundreds take the rest
  const full = DIAL.slice();
  for (let n = 30; n <= 49; n++) if (!full.some((c) => c.number === n)) full.push(ch(n));
  assert.equal(packNumberFor(full, 35), 100, "the viewer-added range is full: into the hundreds");
  assert.equal(packNumberFor(full, 101), 102);
  // Every pack number taken
  const all = full.slice();
  for (let n = 100; n <= 199; n++) if (!numberTaken(all, n)) all.push(ch(n));
  assert.equal(packNumberFor(all, 120), null);
});
