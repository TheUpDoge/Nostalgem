import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTimeline, slotAt, programsBetween, programKey } from "../web/js/schedule.js";

const channel = {
  slug: "test",
  offset: 0,
  items: [
    { id: "a", f: "a.mp4", t: "A", d: 100 },
    { id: "b", f: "b.mp4", t: "B", d: 50 },
    { id: "c", f: "c.mp4", t: "C", d: 200 },
  ],
};
const EPOCH = Date.UTC(2026, 0, 1);
const tl = makeTimeline(channel, { gap: 10, epoch: EPOCH });

test("the loop is every program plus its station break", () => {
  assert.equal(tl.total, 110 + 60 + 210);
  assert.deepEqual(tl.starts, [0, 110, 170, 380]);
});

test("slotAt finds the program on the air and how far in", () => {
  const s = slotAt(tl, EPOCH + 30_000);
  assert.equal(s.item.id, "a");
  assert.equal(s.into, 30);
  assert.equal(s.inGap, false);
  assert.equal(s.next.id, "b");
  assert.equal(s.startMs, EPOCH);
  assert.equal(s.endMs, EPOCH + 100_000);
  assert.equal(s.slotEndMs, EPOCH + 110_000);
});

test("the station break after a program is flagged", () => {
  const s = slotAt(tl, EPOCH + 105_000);
  assert.equal(s.item.id, "a");
  assert.equal(s.inGap, true);
});

test("the schedule wraps around and works before the epoch", () => {
  assert.equal(slotAt(tl, EPOCH + 380_000 + 115_000).item.id, "b");
  assert.equal(slotAt(tl, EPOCH - 5_000).item.id, "c"); // the last break of the previous loop
  assert.equal(slotAt(tl, EPOCH - 5_000).inGap, true);
});

test("two TVs anywhere agree on what's on", () => {
  const now = Date.UTC(2026, 10, 6, 21, 13, 7);
  const a = slotAt(makeTimeline({ slug: "high-noon", items: channel.items }, { gap: 8 }), now);
  const b = slotAt(makeTimeline({ slug: "high-noon", items: channel.items.map((x) => ({ ...x })) }, { gap: 8 }), now);
  assert.equal(a.item.id, b.item.id);
  assert.equal(a.into, b.into);
});

test("channels start their loops at different points", () => {
  const items = Array.from({ length: 40 }, (_, i) => ({ id: "p" + i, f: "x.mp4", d: 1800 + i * 37 }));
  const now = Date.UTC(2026, 5, 1, 20);
  const ids = new Set(["one", "two", "three", "four"].map((slug) => slotAt(makeTimeline({ slug, items }), now).item.id));
  assert.ok(ids.size > 1, "different channels show different programs at once");
});

test("skipped programs drop out of the loop", () => {
  const skipped = makeTimeline(channel, { gap: 10, epoch: EPOCH, skip: new Set([programKey(channel.items[1])]) });
  assert.equal(skipped.items.length, 2);
  assert.equal(slotAt(skipped, EPOCH + 115_000).item.id, "c");
});

test("an empty channel has nothing on", () => {
  assert.equal(slotAt(makeTimeline({ slug: "x", items: [] }), Date.now()), null);
});

test("programsBetween lists back-to-back programs for the guide", () => {
  const list = programsBetween(tl, EPOCH + 50_000, EPOCH + 400_000);
  assert.deepEqual(
    list.map((p) => p.item.id),
    ["a", "b", "c", "a"]
  );
  for (let i = 1; i < list.length; i++) assert.equal(list[i].startMs, list[i - 1].slotEndMs);
});
