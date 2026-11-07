// House bumpers: Adult Swim-style station IDs that air in the station breaks
// between programs. Text cards only, in the app's own style — no video, and
// nothing here touches YouTube or its ads. Picked from the clock, like the
// schedule itself: every TV in the same break shows the same bumper, with no
// server involved. Data lives in web/data/bumpers.json; edit it freely.

import { hash32 } from "./util.js";

export const COMMERCIAL_BREAK_SLUG = "commercial-break";
// A bumper shows on about one break in three. On Commercial Break (the ads
// channel) every break is a house ad.
export const BUMPER_EVERY = 3;

// The file's shape, cleaned up: only entries with a kicker, a title and a sub
// survive, so a typo in the data can't break the break.
export function parseBumpers(data) {
  const list = data && Array.isArray(data.bumpers) ? data.bumpers : [];
  return list
    .filter(function (b) {
      return (
        b &&
        typeof b.kicker === "string" &&
        b.kicker.trim() &&
        typeof b.title === "string" &&
        b.title.trim() &&
        typeof b.sub === "string" &&
        b.sub.trim()
      );
    })
    .map(function (b) {
      return { kicker: b.kicker.trim(), title: b.title.trim(), sub: b.sub.trim() };
    });
}

// Loads web/data/bumpers.json. A missing or broken file just means plain
// "up next" cards: never hold up the boot screen for this.
export function loadBumpers(url) {
  if (typeof fetch === "undefined") return Promise.resolve([]);
  return fetch(url, { credentials: "omit", cache: "no-cache" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(parseBumpers)
    .catch(function () {
      return [];
    });
}

// The break starts when the program ends. slot: from schedule.slotAt.
export function bumperForSlot(bumpers, slot, channel) {
  if (!slot || !slot.item || !(slot.item.d > 0) || typeof slot.startMs !== "number") return null;
  return pickBumper(bumpers, slot.startMs + slot.item.d * 1000, channel);
}

export function pickBumper(bumpers, breakStartMs, channel) {
  if (!bumpers || !bumpers.length || !(breakStartMs >= 0)) return null;
  var sec = Math.floor(breakStartMs / 1000);
  var h = hash32(String(sec));
  var always = !!channel && channel.slug === COMMERCIAL_BREAK_SLUG;
  if (!always && h % BUMPER_EVERY !== 0) return null;
  return bumpers[(h >>> 3) % bumpers.length];
}
