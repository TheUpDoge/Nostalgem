// House bumpers: picked from the clock, like the schedule itself, so every TV
// in the same break shows the same card. Nothing here touches YouTube.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseBumpers, pickBumper, bumperForSlot, BUMPER_EVERY, COMMERCIAL_BREAK_SLUG } from "../web/js/bumpers.js";

const three = [
  { kicker: "K1", title: "One", sub: "S1" },
  { kicker: "K2", title: "Two", sub: "S2" },
  { kicker: "K3", title: "Three", sub: "S3" },
];
const plain = { slug: "high-noon", name: "High Noon" };
const ads = { slug: COMMERCIAL_BREAK_SLUG, name: "Commercial Break" };

test("parseBumpers keeps only complete cards", function () {
  assert.deepEqual(parseBumpers(null), []);
  assert.deepEqual(parseBumpers({ bumpers: "nope" }), []);
  assert.deepEqual(
    parseBumpers({
      bumpers: [
        { kicker: " K ", title: " T ", sub: " S " },
        { kicker: "K", title: "", sub: "S" },
        { kicker: "K", title: "T" },
        { title: "T", sub: "S" },
        "not an object",
      ],
    }),
    [{ kicker: "K", title: "T", sub: "S" }]
  );
});

test("pickBumper needs a list and a real break time", function () {
  assert.equal(pickBumper([], 1000000, plain), null);
  assert.equal(pickBumper(null, 1000000, plain), null);
  assert.equal(pickBumper(three, -1, plain), null);
  assert.equal(pickBumper(three, NaN, plain), null);
});

test("pickBumper is deterministic: same break, same bumper", function () {
  // Find a break that shows a bumper on a plain channel, then check it twice.
  let at = -1;
  for (let sec = 0; sec < 1000; sec++) {
    if (pickBumper(three, sec * 1000, plain)) {
      at = sec * 1000;
      break;
    }
  }
  assert.ok(at >= 0, "some break in the first 1000s shows a bumper");
  const first = pickBumper(three, at, plain);
  assert.equal(pickBumper(three, at, plain), first);
  assert.equal(pickBumper(three, at, { slug: "other", name: "Other" }), first);
});

test("pickBumper varies across breaks and covers the whole set", function () {
  const seen = new Set();
  for (let sec = 0; sec < 5000; sec++) {
    const b = pickBumper(three, sec * 1000, ads);
    if (b) seen.add(b.title);
  }
  assert.deepEqual([...seen].sort(), ["One", "Three", "Two"]);
});

test("Commercial Break shows a bumper every break; other channels about one in three", function () {
  for (let sec = 0; sec < 300; sec++) {
    assert.ok(pickBumper(three, sec * 1000, ads), "ads channel, sec " + sec);
  }
  let shown = 0;
  const n = 900;
  for (let sec = 0; sec < n; sec++) {
    if (pickBumper(three, sec * 1000, plain)) shown++;
  }
  assert.ok(shown > n / BUMPER_EVERY / 2, "shown " + shown + " of " + n);
  assert.ok(shown < (n / BUMPER_EVERY) * 2, "shown " + shown + " of " + n);
});

test("bumperForSlot uses the program end as the break start", function () {
  const slot = { startMs: 1000000, item: { d: 60 }, next: null };
  assert.equal(bumperForSlot(three, slot, ads), pickBumper(three, 1060000, ads));
  assert.equal(bumperForSlot(three, null, ads), null);
  assert.equal(bumperForSlot(three, { startMs: 1, item: { d: 0 } }, ads), null);
  assert.equal(bumperForSlot(three, { item: { d: 60 } }, ads), null);
});

test("web/data/bumpers.json: a dozen short original cards", function () {
  const file = fileURLToPath(new URL("../web/data/bumpers.json", import.meta.url));
  const data = JSON.parse(readFileSync(file, "utf8"));
  const list = parseBumpers(data);
  assert.ok(list.length >= 8, "got " + list.length);
  const titles = new Set();
  for (const b of list) {
    assert.ok(b.title.length <= 60, b.title);
    assert.ok(b.kicker.length <= 40, b.kicker);
    assert.ok(b.sub.length <= 120, b.sub);
    assert.ok(!titles.has(b.title), "duplicate title: " + b.title);
    titles.add(b.title);
  }
});
