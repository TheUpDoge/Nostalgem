// The broadcast clock. Every channel is a loop of programs, each followed by a short station break.
// Where the loop is "now" depends only on the wall clock, so every TV tuned to a channel sees the
// same thing at the same moment, like real broadcast TV. No server needed.

import { hash32 } from "./util.js";

export const DEFAULT_EPOCH = Date.UTC(2026, 0, 1);

export function programKey(item) {
  return item.id + "/" + item.f;
}

// channel: { slug, items: [{ id, f, d (seconds), ... }] }
// opts: { gap: seconds between programs, epoch: ms, skip: Set of programKey to leave out }
export function makeTimeline(channel, opts) {
  const o = opts || {};
  const gap = o.gap != null ? o.gap : 8;
  const skip = o.skip;
  const items = (channel.items || []).filter(function (it) {
    return it.d > 0 && !(skip && skip.has(programKey(it)));
  });
  const starts = new Array(items.length + 1);
  let t = 0;
  for (let i = 0; i < items.length; i++) {
    starts[i] = t;
    t += items[i].d + gap;
  }
  starts[items.length] = t;
  const epoch = o.epoch != null ? o.epoch : DEFAULT_EPOCH;
  // Each channel starts its loop somewhere different, so channel 1 and 2 don't change programs in lockstep.
  // A channel may pin its own offset (seconds), e.g. to line a premiere up with a time of day.
  const base = typeof channel.offset === "number" ? channel.offset : hash32(channel.slug || channel.name || "");
  const offset = t > 0 ? ((base % Math.floor(t)) + Math.floor(t)) % Math.floor(t) : 0;
  return { channel: channel, items: items, starts: starts, total: t, gap: gap, epoch: epoch, offset: offset };
}

function loopPos(tl, nowMs) {
  const secs = (nowMs - tl.epoch) / 1000 + tl.offset;
  return ((secs % tl.total) + tl.total) % tl.total;
}

function findSlot(starts, n, p) {
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= p) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// What is on at nowMs: the program, how far into it we are, and when it (and its break) ends.
export function slotAt(tl, nowMs) {
  if (!tl || !tl.items.length || !(tl.total > 0)) return null;
  const p = loopPos(tl, nowMs);
  const i = findSlot(tl.starts, tl.items.length, p);
  const into = p - tl.starts[i];
  const item = tl.items[i];
  const startMs = nowMs - into * 1000;
  return {
    index: i,
    item: item,
    into: into,
    startMs: startMs,
    endMs: startMs + item.d * 1000,
    slotEndMs: startMs + (item.d + tl.gap) * 1000,
    inGap: into >= item.d,
    next: tl.items[(i + 1) % tl.items.length],
  };
}

// Programs airing between fromMs and toMs, in order (for the guide).
export function programsBetween(tl, fromMs, toMs, limit) {
  const out = [];
  const s = slotAt(tl, fromMs);
  if (!s) return out;
  const max = limit || 400;
  let startMs = s.startMs;
  let i = s.index;
  while (startMs < toMs && out.length < max) {
    const item = tl.items[i];
    out.push({ item: item, index: i, startMs: startMs, endMs: startMs + item.d * 1000, slotEndMs: startMs + (item.d + tl.gap) * 1000 });
    startMs += (item.d + tl.gap) * 1000;
    i = (i + 1) % tl.items.length;
  }
  return out;
}
