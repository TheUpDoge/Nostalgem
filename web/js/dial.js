// The dial: which channel typed digits reach, how they read on screen while tuning, and where a pack's
// channel goes.
//
//   A channel is typed as its number: 7, 33, 101.
//   A sub-channel as its number (two digits at least), then its sub: 5 0 1 is CH 50-1, 1 5 2 is CH 15-2,
//   0 3 2 is CH 3-2 (as the guide writes it, 03-2). The short way, 3 2, still reaches CH 3-2 on a TV with
//   no CH 32 of its own.
//
// The numbers: built-in channels 1–29 (with sub-channels), viewer-added 30–49, YouTube sub-channels 50–90,
// and packs 30–49 and 100–199. The secret stations sit where they sit (069, 111, 420, 555, 666, 777).

import { chKey, chLabel, pad2 } from "./util.js";

// Pack channel numbers: the viewer-added range, then the hundreds.
export const PACK_RANGES = [
  [30, 49],
  [100, 199],
];

export function packNumberOk(n) {
  return (
    typeof n === "number" &&
    Math.floor(n) === n &&
    PACK_RANGES.some(function (r) {
      return n >= r[0] && n <= r[1];
    })
  );
}

// "30 to 49, or 100 to 199"
export function packRangesText() {
  return PACK_RANGES.map(function (r) {
    return r[0] + " to " + r[1];
  }).join(", or ");
}

// The short way to type a one-digit channel's sub-channel: 3 2 for CH 3-2.
function shortKey(ch) {
  return ch.sub && ch.number < 10 ? String(ch.number) + ch.sub : "";
}

// The channel that exactly these digits reach, or null. A channel's own number comes before the short way
// to a sub-channel: with a CH 32 on the TV, 3 2 is CH 32 and 0 3 2 is CH 3-2. firstSub: digits naming a
// channel that only has sub-channels ("50") reach the first of them.
export function channelForDigits(channels, typed, firstSub) {
  let exact = null;
  let short = null;
  for (let i = 0; i < channels.length; i++) {
    const c = channels[i];
    if (!exact && chKey(c) === typed) exact = c;
    else if (!short && shortKey(c) === typed) short = c;
  }
  if (exact || short) return exact || short;
  if (!firstSub || !typed) return null;
  const num = Number(typed);
  for (let i = 0; i < channels.length; i++) if (channels[i].number === num) return channels[i];
  return null;
}

// Could more digits still reach a channel? (1 0, with a CH 101 or a CH 10-1 on the dial.)
export function moreToType(channels, typed) {
  return channels.some(function (c) {
    const keys = [chKey(c), shortKey(c)];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k && k.length > typed.length && k.indexOf(typed) === 0) return true;
    }
    return false;
  });
}

// How typed digits read on screen: "1-" and "10-" while more may follow, then the channel as the guide
// writes it ("101", "50-1", "03-2"). missed: nothing has that number (shown with NO SIGNAL). Three digits
// or more take a dash only on the way to a real sub-channel, or under a channel that has them (5 0 9 where
// CH 50 has eight is "50-9"); CH 101 is "101".
export function typedLabel(channels, typed, missed) {
  if (!typed) return "";
  if (typed.length === 1 && !missed) return typed + "-";
  if (typed.length <= 2) return pad2(Number(typed)) + (missed ? "" : "-");
  const ch = channelForDigits(channels, typed, false);
  if (ch) return chLabel(ch);
  const family = channels.filter(function (c) {
    const n = pad2(c.number);
    return c.sub && typed.length > n.length && typed.indexOf(n) === 0;
  })[0];
  if (family) {
    const n = pad2(family.number).length;
    return typed.slice(0, n) + "-" + typed.slice(n);
  }
  return typed;
}

// Is a number already on this dial? It is when a channel has it, or when typing it reaches another
// channel: 152 is how CH 15-2 is typed.
export function numberTaken(channels, n) {
  const k = String(n);
  return channels.some(function (c) {
    return c.number === n || chKey(c) === k;
  });
}

// Where a pack channel goes: the number it asks for when that's free. Otherwise the next free number after
// it in its own range (wrapping around to the start of the range), then the other pack range: a pack's
// channels stay together. null when every pack number is taken.
export function packNumberFor(channels, wanted) {
  if (packNumberOk(wanted) && !numberTaken(channels, wanted)) return wanted;
  const home = PACK_RANGES.filter(function (r) {
    return wanted >= r[0] && wanted <= r[1];
  })[0];
  const order = [];
  if (home) {
    for (let n = wanted + 1; n <= home[1]; n++) order.push(n);
    for (let n = home[0]; n < wanted; n++) order.push(n);
  }
  PACK_RANGES.forEach(function (r) {
    if (r !== home) for (let n = r[0]; n <= r[1]; n++) order.push(n);
  });
  for (let i = 0; i < order.length; i++) if (!numberTaken(channels, order[i])) return order[i];
  return null;
}
