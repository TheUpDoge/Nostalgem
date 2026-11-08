// The secret stations: 069 Bible Boys Church and 666 Dead Air. Tuned by number only, never listed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BBC_CHANNEL, DEAD_AIR_CHANNEL, SECRET_STATIONS, SECRET_ABOUT, secretStation, introHtml, stationQuip, stationClock, bugText } from "../web/js/secrets.js";
import { LINK_CHANNELS, isGuideVisible } from "../web/js/linkout.js";
import { chKey } from "../web/js/util.js";
import { makeTimeline, slotAt } from "../web/js/schedule.js";

test("069 is Bible Boys Church and 666 is Dead Air: secret, playable, never listed", () => {
  assert.equal(chKey(BBC_CHANNEL), "69");
  assert.equal(chKey(DEAD_AIR_CHANNEL), "666");
  for (const ch of SECRET_STATIONS) {
    assert.equal(ch.secret, true);
    assert.equal(ch.kind, "video");
    assert.equal(isGuideVisible(ch, new Set()), false);
    assert.ok(ch.items.length >= 6, ch.slug);
    for (const it of ch.items) {
      assert.ok(it.id && it.f && /\.mp4$/i.test(it.f) && it.t && it.d > 60 && it.y <= 1927, it.id);
      assert.ok(SECRET_ABOUT[it.id], "described: " + it.id);
    }
  }
  // No number clashes with the link-out stations.
  const keys = SECRET_STATIONS.concat(LINK_CHANNELS).map(chKey);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(secretStation(BBC_CHANNEL), "bible-boys-church");
  assert.equal(secretStation({ slug: "high-noon" }), "");
});

test("their schedules run around the clock", () => {
  for (const ch of SECRET_STATIONS) {
    const tl = makeTimeline(ch, { epoch: "2026-01-01T00:00:00Z" });
    const s = slotAt(tl, Date.parse("2026-11-08T21:00:00Z"));
    assert.ok(s && s.item && ch.items.includes(s.item), ch.slug);
  }
});

test("each opens with its own card, and has a few things to say", () => {
  assert.match(introHtml(BBC_CHANNEL), /BIBLE BOYS CHURCH/);
  assert.match(introHtml(BBC_CHANNEL), /You typed 69/);
  assert.match(introHtml(DEAD_AIR_CHANNEL), /THIS FREQUENCY WAS NOT ASSIGNED/);
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
