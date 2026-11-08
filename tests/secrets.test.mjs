// The secret stations: 069 Bible Boys Church, 666 Dead Air and 111 Pearly Gates. Tuned by number only,
// never listed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BBC_CHANNEL, DEAD_AIR_CHANNEL, PEARLY_GATES_CHANNEL, SECRET_STATIONS, SECRET_ABOUT, secretStation, introHtml, stationQuip, stationClock, bugText } from "../web/js/secrets.js";
import { LINK_CHANNELS, isGuideVisible } from "../web/js/linkout.js";
import { chKey } from "../web/js/util.js";
import { makeTimeline, slotAt } from "../web/js/schedule.js";
import { lookById } from "../web/js/looks.js";

test("069 is Bible Boys Church, 666 is Dead Air and 111 is Pearly Gates: secret, playable, never listed", () => {
  assert.equal(chKey(BBC_CHANNEL), "69");
  assert.equal(chKey(DEAD_AIR_CHANNEL), "666");
  assert.equal(chKey(PEARLY_GATES_CHANNEL), "111");
  for (const ch of SECRET_STATIONS) {
    assert.equal(ch.secret, true);
    assert.equal(ch.kind, "video");
    assert.equal(isGuideVisible(ch, new Set()), false);
    assert.ok(ch.items.length >= 6, ch.slug);
    const ids = new Set();
    for (const it of ch.items) {
      assert.ok(it.id && it.f && /\.mp4$/i.test(it.f) && it.t && it.d > 60 && it.y <= 1950, it.id);
      assert.ok(SECRET_ABOUT[it.id], "described: " + it.id);
      assert.ok(!ids.has(it.id), "once: " + it.id);
      ids.add(it.id);
    }
  }
  // No number clashes with the link-out stations.
  const keys = SECRET_STATIONS.concat(LINK_CHANNELS).map(chKey);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(secretStation(BBC_CHANNEL), "bible-boys-church");
  assert.equal(secretStation(PEARLY_GATES_CHANNEL), "pearly-gates");
  assert.equal(secretStation({ slug: "high-noon" }), "");
});

test("666 wears red ASCII and plays slow and low; 111 wears stained glass and sounds like a church", () => {
  assert.equal(lookById(DEAD_AIR_CHANNEL.look).id, "ascii-666");
  assert.equal(lookById(DEAD_AIR_CHANNEL.look).ascii, "666");
  assert.equal(DEAD_AIR_CHANNEL.rate, 0.5);
  assert.equal(DEAD_AIR_CHANNEL.sound, undefined);
  assert.equal(lookById(PEARLY_GATES_CHANNEL.look).id, "glass");
  assert.equal(PEARLY_GATES_CHANNEL.sound, "church");
  assert.ok(!PEARLY_GATES_CHANNEL.rate || PEARLY_GATES_CHANNEL.rate === 1, "111 plays at its own pitch");
  // At half speed, a 3-minute film takes 6 minutes of the schedule, and the file is half as far in.
  const tl = makeTimeline(DEAD_AIR_CHANNEL, { epoch: Date.parse("2026-01-01T00:00:00Z"), gap: 0 });
  const half = makeTimeline(Object.assign({}, DEAD_AIR_CHANNEL, { rate: 1 }), { epoch: Date.parse("2026-01-01T00:00:00Z"), gap: 0 });
  assert.equal(tl.total, half.total * 2);
  const now = Date.parse("2026-11-08T21:00:00Z");
  const s = slotAt(tl, now);
  assert.equal(s.rate, 0.5);
  assert.ok(Math.abs((s.endMs - s.startMs) / 1000 - s.item.d * 2) < 0.01, "a film takes twice its length");
  assert.ok(Math.abs(s.into - ((now - s.startMs) / 1000) * 0.5) < 0.01, "into is seconds into the file");
});

test("their schedules run around the clock", () => {
  for (const ch of SECRET_STATIONS) {
    const tl = makeTimeline(ch, { epoch: Date.parse("2026-01-01T00:00:00Z") });
    const s = slotAt(tl, Date.parse("2026-11-08T21:00:00Z"));
    assert.ok(s && s.item && ch.items.includes(s.item), ch.slug);
  }
});

test("each opens with its own card, and has a few things to say", () => {
  assert.match(introHtml(BBC_CHANNEL), /BIBLE BOYS CHURCH/);
  assert.match(introHtml(BBC_CHANNEL), /You typed 69/);
  assert.match(introHtml(DEAD_AIR_CHANNEL), /THIS FREQUENCY WAS NOT ASSIGNED/);
  assert.match(introHtml(PEARLY_GATES_CHANNEL), /PEARLY GATES/);
  assert.match(introHtml(PEARLY_GATES_CHANNEL), /rated PG/);
  assert.equal(stationQuip("pearly-gates", "leave"), "👼 Go in peace.");
  assert.equal(stationClock("pearly-gates", false), "11:11 AM");
  assert.equal(stationClock("pearly-gates", true), "11:11");
  assert.equal(bugText(PEARLY_GATES_CHANNEL, "x"), "✦ 111");
  assert.equal(stationQuip("bible-boys-church", "pause"), "⛪ Pausing the sermon? Bold.");
  assert.match(stationQuip("dead-air", "leave"), /here when you get back/);
  assert.equal(stationQuip("", "pause"), "");
  assert.equal(stationClock("dead-air", false), "6:66 AM");
  assert.equal(stationClock("dead-air", true), "06:66");
  assert.equal(stationClock("bible-boys-church", false), "");
  assert.equal(bugText(BBC_CHANNEL, "x"), "✝ BBC");
  assert.equal(bugText(DEAD_AIR_CHANNEL, "x"), "666");
  assert.equal(bugText({ slug: "high-noon" }, "🤠 01"), "🤠 01");
});

test("the church's echo: early reflections, then a tail that dies away, different left and right", async () => {
  const { naveImpulse } = await import("../web/js/church.js");
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rate = 8000;
  const n = Math.floor(2.8 * rate);
  const left = naveImpulse(n, rate, 0, rnd);
  const right = naveImpulse(n, rate, 1, rnd);
  const energy = (a, from, to) => {
    let e = 0;
    for (let i = Math.floor(from * rate); i < Math.floor(to * rate); i++) e += a[i] * a[i];
    return e;
  };
  assert.equal(left.length, n);
  assert.ok(energy(left, 0, 0.1) > energy(left, 1, 1.1) * 10, "loud at first");
  assert.ok(energy(left, 1, 1.1) > energy(left, 2.5, 2.6) * 10, "and dying away");
  assert.ok(energy(left, 2.5, 2.8) > 0, "still ringing near the end");
  let diff = 0;
  for (let i = 0; i < 400; i++) diff += Math.abs(left[i] - right[i]);
  assert.ok(diff > 0.1, "left and right differ");
});
