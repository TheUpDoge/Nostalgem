// The NostalGem Video Club and Reading Room: one library card for the Archive's feature films, checked
// out like tapes from a neighborhood video store, and its books, borrowed like from a library. Up to MAX_TAPES out at a time, each for LOAN_HOURS. A tape you have out plays
// from where you stopped it; when you're done you rewind it and return it to make room for another. One
// still out when it's due goes back by itself (no late fees, ever).
//
// Everything here is plain data in and out, so the rules can be tested without a browser. main.js keeps
// the library in localStorage ("library") and draws it (ui/club.js).

import { programKey, foldText } from "./schedule.js";
import { hash32 } from "./util.js";

export const MAX_TAPES = 2;
export const LOAN_HOURS = 72; // a three-day rental
export const MAX_BOOKS = 3;
export const BOOK_DAYS = 14; // a library's two weeks
const MARKS_KEPT = 60; // bookmarks remembered, for books read before too
export const TERMS_VERSION = 1; // bump when the fine print changes: members sign again
export const FILM_MIN_SECONDS = 40 * 60; // the store stocks features, not shorts
const HISTORY_KEPT = 30;
// Box sets: a whole series checked out as one loan, apart from the tapes (it doesn't take a tape's
// place). One out at a time, for a week: a series takes longer than a film.
export const MAX_BOXES = 1;
export const BOX_DAYS = 7;
export const BOX_MIN_EPISODES = 3; // fewer than this on a channel isn't a box set
const BOX_MAX_EPISODES = 60; // a box holds at most this many (the first ones, in order)
const EPISODE_MAX_SECONDS = 40 * 60; // episodes are shorter than the features the store stocks
const REWOUND_AT = 2; // a tape this close to the start counts as rewound (seconds)

export function emptyLibrary() {
  return { card: null, loans: [], history: [], books: [], marks: {}, boxes: [] };
}

// A copy of the library with some parts changed (the rest — books, bookmarks… — carried over).
function change(lib, parts) {
  return Object.assign({}, lib, parts);
}

function validLoan(l) {
  return !!l && typeof l.key === "string" && typeof l.id === "string" && typeof l.f === "string" && typeof l.t === "string" && l.d > 0 && l.due > 0;
}

// Whatever was stored, as a library this version understands. A card signed under older fine print is
// dropped (its holder signs the new one); tapes stay out either way.
export function cleanLibrary(raw) {
  const lib = emptyLibrary();
  if (!raw || typeof raw !== "object") return lib;
  const c = raw.card;
  if (c && typeof c.name === "string" && typeof c.number === "string" && c.terms === TERMS_VERSION) {
    lib.card = { name: c.name, number: c.number, issued: Number(c.issued) || 0, terms: TERMS_VERSION };
  }
  lib.loans = (Array.isArray(raw.loans) ? raw.loans : []).filter(validLoan).slice(0, MAX_TAPES);
  lib.history = (Array.isArray(raw.history) ? raw.history : [])
    .filter(function (h) {
      return h && typeof h.t === "string";
    })
    .slice(0, HISTORY_KEPT);
  lib.books = (Array.isArray(raw.books) ? raw.books : [])
    .filter(function (b) {
      return b && typeof b.id === "string" && typeof b.t === "string" && b.due > 0;
    })
    .slice(0, MAX_BOOKS);
  lib.boxes = (Array.isArray(raw.boxes) ? raw.boxes : []).filter(validBox).slice(0, MAX_BOXES).map(function (b) {
    const ep = Math.max(0, Math.min(b.eps.length - 1, Math.floor(Number(b.ep) || 0)));
    return Object.assign({}, b, { ep: ep, pos: Math.max(0, Number(b.pos) || 0) });
  });
  const marks = raw.marks && typeof raw.marks === "object" ? raw.marks : {};
  Object.keys(marks).forEach(function (id) {
    const m = marks[id];
    if (m && m.v >= 0 && m.p >= 0) lib.marks[id] = { v: Math.floor(m.v), p: Math.floor(m.p), rtl: m.rtl === true ? true : m.rtl === false ? false : undefined, shift: !!m.shift, at: Number(m.at) || 0 };
  });
  return lib;
}

// "NG 4821 0937 5512": twelve digits, grouped like a card.
export function cardNumber(rand) {
  const r = typeof rand === "function" ? rand : Math.random;
  let d = "";
  for (let i = 0; i < 12; i++) d += String(Math.floor(r() * 10) % 10);
  return "NG " + d.slice(0, 4) + " " + d.slice(4, 8) + " " + d.slice(8);
}

// Signing up: the name signed under the fine print. Returns { lib } or { error }.
export function issueCard(lib, name, now, rand) {
  const n = String(name || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  if (n.replace(/[^\p{L}]/gu, "").length < 2) return { error: "Sign with your name to agree (at least two letters)." };
  const card = { name: n, number: cardNumber(rand), issued: now, terms: TERMS_VERSION };
  return { lib: change(lib, { card: card }) };
}

// Cutting up the card: every tape and book goes back (bookmarks stay, for a new card).
export function cancelCard(lib, now) {
  let out = lib;
  lib.loans.forEach(function (l) {
    out = returnTape(out, l.key, now, true).lib || out;
  });
  (lib.books || []).forEach(function (b) {
    out = returnBook(out, b.id, now, true).lib || out;
  });
  (lib.boxes || []).forEach(function (b) {
    out = returnBox(out, b.key, now, true).lib || out;
  });
  return change(out, { card: null, loans: [], books: [], boxes: [] });
}

export function loanFor(lib, key) {
  for (let i = 0; i < lib.loans.length; i++) if (lib.loans[i].key === key) return lib.loans[i];
  return null;
}

// Checking out a film: { key, item, ch }. Returns { lib, loan } or { error, text }.
export function checkOut(lib, film, now) {
  if (!lib.card) return { error: "card", text: "You need a library card first. It's free." };
  if (loanFor(lib, film.key)) return { error: "out", text: "You already have this tape." };
  if (lib.loans.length >= MAX_TAPES) {
    return { error: "full", text: "You have " + MAX_TAPES + " tapes out. Rewind and return one to make room." };
  }
  const it = film.item;
  const loan = {
    key: film.key,
    id: it.id,
    f: it.f,
    t: it.t,
    d: it.d,
    y: it.y || 0,
    ch: film.ch ? film.ch.slug : "",
    out: now,
    due: now + LOAN_HOURS * 3600000,
    pos: 0,
  };
  return { lib: change(lib, { loans: lib.loans.concat([loan]) }), loan: loan };
}

function withLoan(lib, key, parts) {
  return change(lib, {
    loans: lib.loans.map(function (l) {
      return l.key === key ? Object.assign({}, l, parts) : l;
    }),
  });
}

// Where the tape is (seconds in), as it plays.
export function setPosition(lib, key, pos) {
  const l = loanFor(lib, key);
  if (!l) return lib;
  return withLoan(lib, key, { pos: Math.max(0, Math.min(l.d, Number(pos) || 0)) });
}

// A tape's TV-safe cut (clean cuts, cuts.js): off, so the tape plays as it is, until the viewer turns it
// on for that tape.
export function setSafeCut(lib, key, on) {
  if (!loanFor(lib, key)) return lib;
  return withLoan(lib, key, { cut: !!on });
}

export function isRewound(loan) {
  return !loan || loan.pos < REWOUND_AT;
}

export function rewind(lib, key) {
  return withLoan(lib, key, { pos: 0 });
}

// Back to the shelf. Only a rewound tape, unless it's going back late (or with the card). Returns { lib }
// or { error, text }.
export function returnTape(lib, key, now, late) {
  const l = loanFor(lib, key);
  if (!l) return { error: "none", text: "That tape isn't checked out." };
  if (!isRewound(l) && !late) return { error: "rewind", text: "Be kind, rewind! Press ◀◀ Rewind first." };
  const entry = { kind: "tape", t: l.t, y: l.y, key: l.key, out: l.out, back: now, late: !!late };
  return {
    lib: change(lib, {
      loans: lib.loans.filter(function (x) {
        return x.key !== key;
      }),
      history: [entry].concat(lib.history).slice(0, HISTORY_KEPT),
    }),
  };
}

// The tapes past their due time.
export function overdue(lib, now) {
  return lib.loans.filter(function (l) {
    return now >= l.due;
  });
}

// "due back in 2 days", "due back in 5 hr", "due back in 40 min", "due back now".
export function dueText(ms) {
  if (ms <= 60000) return "due back now";
  const min = Math.round(ms / 60000);
  if (min < 60) return "due back in " + min + " min";
  const hr = Math.round(min / 60);
  if (hr < 36) return "due back in " + hr + " hr";
  return "due back in " + Math.round(hr / 24) + " days";
}

// ---------- box sets: a series as one loan ----------
// Where a channel's episodes come from: the series channels, and every channel a pack (or the viewer)
// added. Films stay on the tape shelves; the rest of the dial isn't series.
export const SERIES_CHANNELS = ["saturday-morning", "rerun-city", "game-night", "trail-tv", "cliffhangers", "space-cadets", "twilight-hour"];

function validEpisode(e) {
  return !!e && typeof e.id === "string" && typeof e.f === "string" && typeof e.t === "string" && e.d > 0;
}
function validBox(b) {
  return !!b && typeof b.key === "string" && typeof b.t === "string" && Array.isArray(b.eps) && b.eps.length > 0 && b.eps.every(validEpisode) && b.due > 0;
}

// A program's show: "Meet Corliss Archer' - Quaranteened (1954)" -> "Meet Corliss Archer",
// "Space Patrol aka Planet Patrol s01e02" -> "Space Patrol", "Tom Corbett, Space Cadet serial" ->
// "Tom Corbett, Space Cadet". "" when it can't tell.
export function showName(item) {
  let t = String((item && item.t) || "")
    .replace(/\s*\((?:19|20)\d\d\)\s*/g, " ")
    .replace(/^\W+/, "")
    .trim();
  const m = /^(.+?)(?:'?\s+[-–—:]\s+|:\s+|\s+#\s*\d|\s+(?:no\.?|ep\.?|episode|chapter|chap\.?|part|pt\.?)\s*\d)/i.exec(t);
  if (m) t = m[1];
  t = t
    .replace(/\s+aka\s+.*$/i, "")
    .replace(/\s*\(.*\)\s*$/, "")
    .replace(/\s+(?:s\d+e\d+|\d{1,3})$/i, "")
    .replace(/['"]+$/g, "")
    .trim();
  // "… 1950", "… 24 episodes", "… serials", "… TV series": not part of the name. Twice, for "… 1950 TV Series".
  for (let i = 0; i < 2; i++) {
    t = t
      .replace(/\s+(?:the\s+)?(?:(?:\d+\s+)?(?:misc\.?\s+)?episodes?|serials?|(?:tv\s+)?series|complete series|incomplete series|tv show|(?:19|20)\d\d|[a-z])$/i, "")
      .trim();
  }
  return t;
}

// "Episode 2" before "Episode 10": numbers compare as numbers.
function natural(a, b) {
  const x = foldText(a).split(/(\d+)/);
  const y = foldText(b).split(/(\d+)/);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] === y[i]) continue;
    const nx = Number(x[i]);
    const ny = Number(y[i]);
    if (i % 2 && !isNaN(nx) && !isNaN(ny)) return nx - ny;
    return x[i] < y[i] ? -1 : 1;
  }
  return x.length - y.length;
}

// "Les Vampires - Episode 3", "Burns and Allen # 68", "Beverly Hillbillies Ep02", "… serial #1 …",
// "Chapter 4" -> the number; 0 when the title doesn't say.
export function episodeNumber(item, field) {
  const t = String((item && item[field || "t"]) || "");
  // S03E07: season 3 before season 4, whatever the episode.
  const se = /\bs(\d{1,2})\s*e(\d{1,3})\b/i.exec(t);
  if (se) return Number(se[1]) * 1000 + Number(se[2]);
  const m = /(?:\bepisode|\bep\.?|\bchapter|\bchap\.?|#|\bno\.|\bpart)\s*(\d{1,4})\b/i.exec(t);
  if (m) return Number(m[1]);
  const season = /\bseason\s*(\d{1,2})\b/i.exec(t);
  return season ? Number(season[1]) * 1000 : 0;
}
// The order of two episodes: the number in their titles, then in their parts' names (one upload in
// several files), then year, then title.
function episodeOrder(a, b) {
  for (const f of ["t", "e"]) {
    const x = episodeNumber(a, f);
    const y = episodeNumber(b, f);
    if (x && y && x !== y) return x - y;
    if (!x !== !y) return x ? -1 : 1;
  }
  return (a.y || 0) - (b.y || 0) || natural(a.t || a.f, b.t || b.f) || natural(a.e || a.f, b.e || b.f);
}

const GENERIC_SHOW = /^(classic|vintage|old|retro|fifties|sixties|1950s|1960s|golden age)( time)? (tv|television|comedy|cartoons?|shows?)\b/;

function isEpisode(item) {
  return !!item && !item.live && !item.u && typeof item.id === "string" && item.id.indexOf("yt:") !== 0 && item.d > 0 && item.d < EPISODE_MAX_SECONDS;
}

function seriesChannel(ch) {
  return !!ch && !ch.secret && ch.kind !== "audio" && (SERIES_CHANNELS.indexOf(ch.slug) >= 0 || !!ch.custom);
}

// The box sets on the shelf: a series is three or more episodes of one show on a series channel or a
// pack's channel, in order (by year, then episode number or title). A show that turns up under a longer
// name too ("Captain Video" and "Captain Video and His Video Rangers") is one box. A compilation upload
// (one Archive item of unrelated shorts) isn't a series unless it says it is.
//   -> [{ key, show, ch, eps: [items] }], biggest first within each channel
export function seriesShelves(channels, opts) {
  const skip = (opts && opts.skip) || null;
  const out = [];
  const seenKey = {};
  channels.forEach(function (ch) {
    if (!seriesChannel(ch)) return;
    const groups = {};
    (ch.items || []).forEach(function (item) {
      if (!isEpisode(item) || (skip && skip(item))) return;
      const name = showName(item);
      const k = foldText(name).replace(/^the /, ""); // "The Beverly Hillbillies" is "Beverly Hillbillies"
      if (!k || k.length < 3) return;
      const g = (groups[k] = groups[k] || { names: {}, items: [], ids: {} });
      g.names[name] = (g.names[name] || 0) + 1;
      g.items.push(item);
      g.ids[item.id] = 1;
    });
    // A name that starts with a shorter one is the same show.
    const keys = Object.keys(groups).sort(function (a, b) {
      return a.length - b.length;
    });
    keys.forEach(function (k) {
      if (!groups[k]) return;
      keys.forEach(function (j) {
        if (j === k || !groups[j] || j.indexOf(k + " ") !== 0) return;
        const a = groups[k];
        const b = groups[j];
        // "X and …" is X ("Captain Video and His Video Rangers"). Otherwise only a stray episode or two
        // joins, and only a show that is a series already ("Captain Z Ro Attila The Hun"): a group that
        // stands on its own is another show, and strays under a one-off name are other films ("The
        // Phantom of the West", "The Phantom of the Air", "The Phantom Creeps" are three serials).
        const and = j.slice(k.length + 1).indexOf("and ") === 0;
        if (!and && (b.items.length >= BOX_MIN_EPISODES || a.items.length < BOX_MIN_EPISODES)) return;
        Object.keys(b.names).forEach(function (n) {
          a.names[n] = (a.names[n] || 0) + b.names[n];
        });
        a.items = a.items.concat(b.items);
        Object.keys(b.ids).forEach(function (id) {
          a.ids[id] = 1;
        });
        delete groups[j];
      });
    });
    const found = [];
    Object.keys(groups).forEach(function (k) {
      const g = groups[k];
      // In order: by episode number where the titles have one, then by year, then by title. The same
      // numbered episode uploaded twice goes in once.
      g.items.sort(episodeOrder);
      const seen = {};
      const items = g.items.filter(function (it) {
        const pk = programKey(it);
        const n = it.e ? 0 : episodeNumber(it); // a one-file episode uploaded twice
        if (seen[pk] || (n && seen["#" + n])) return false;
        seen[pk] = 1;
        if (n) seen["#" + n] = 1;
        return true;
      });
      if (items.length < BOX_MIN_EPISODES) return;
      const names = Object.keys(g.names);
      // A collection's label isn't a show ("Classic TV Comedy: …", "Fifties Television: …").
      if (GENERIC_SHOW.test(k)) return;
      // One upload holding everything: a series only if it says so.
      if (Object.keys(g.ids).length === 1 && !/series|serial|episode|season|chapter/i.test(items[0].t + " " + names.join(" "))) return;
      // The name it goes by most often; the shorter one when that's a tie ("Captain Video").
      names.sort(function (a, b) {
        return g.names[b] - g.names[a] || a.length - b.length;
      });
      const key = "box:" + ch.slug + ":" + k;
      if (seenKey[key]) return;
      seenKey[key] = 1;
      found.push({ key: key, show: names[0], ch: ch, eps: items.slice(0, BOX_MAX_EPISODES) });
    });
    found.sort(function (a, b) {
      return b.eps.length - a.eps.length || (a.show < b.show ? -1 : 1);
    });
    found.forEach(function (f) {
      out.push(f);
    });
  });
  return out;
}

export function boxFor(lib, key) {
  const boxes = lib.boxes || [];
  for (let i = 0; i < boxes.length; i++) if (boxes[i].key === key) return boxes[i];
  return null;
}

function episodeCopy(it) {
  const e = { id: it.id, f: it.f, t: it.t, d: it.d };
  if (it.y) e.y = it.y;
  if (it.e) e.e = it.e;
  if (it.cc) e.cc = it.cc;
  return e;
}

// Checking out a box set: { key, show, ch, eps }. Returns { lib, box } or { error, text }. It doesn't take
// a tape's place: tapes and box sets have limits of their own.
export function checkOutBox(lib, series, now) {
  if (!lib.card) return { error: "card", text: "You need a library card first. It's free." };
  if (boxFor(lib, series.key)) return { error: "out", text: "You already have this box set." };
  const boxes = lib.boxes || [];
  if (boxes.length >= MAX_BOXES) {
    return { error: "full", text: "You have a box set out (" + boxes[0].t + "). Return it to take another." };
  }
  const box = {
    key: series.key,
    t: series.show,
    ch: series.ch ? series.ch.slug : "",
    eps: series.eps.slice(0, BOX_MAX_EPISODES).map(episodeCopy),
    ep: 0,
    pos: 0,
    out: now,
    due: now + BOX_DAYS * 86400000,
  };
  return { lib: change(lib, { boxes: boxes.concat([box]) }), box: box };
}

function withBox(lib, key, parts) {
  return change(lib, {
    boxes: (lib.boxes || []).map(function (b) {
      return b.key === key ? Object.assign({}, b, parts) : b;
    }),
  });
}

// Where the viewer is in the box: which episode, and how far in.
export function setBoxPlace(lib, key, ep, pos) {
  const b = boxFor(lib, key);
  if (!b) return lib;
  const i = Math.max(0, Math.min(b.eps.length - 1, Math.floor(Number(ep) || 0)));
  return withBox(lib, key, { ep: i, pos: Math.max(0, Math.min(b.eps[i].d, Number(pos) || 0)) });
}

// The episode that follows this one: { lib, ep } , or { lib, done: true } after the last (the box keeps
// its place at the end of the last episode).
export function nextEpisode(lib, key) {
  const b = boxFor(lib, key);
  if (!b) return { lib: lib, done: true };
  if (b.ep + 1 >= b.eps.length) return { lib: withBox(lib, key, { pos: b.eps[b.ep].d, done: true }), done: true };
  return { lib: withBox(lib, key, { ep: b.ep + 1, pos: 0, done: false }), ep: b.ep + 1 };
}

// Start the box over from the first episode.
export function restartBox(lib, key) {
  return boxFor(lib, key) ? withBox(lib, key, { ep: 0, pos: 0, done: false }) : lib;
}

// Back to the shelf, wherever the viewer got to (a box set has no rewinding). Returns { lib } or { error }.
export function returnBox(lib, key, now, late) {
  const b = boxFor(lib, key);
  if (!b) return { error: "none", text: "That box set isn't checked out." };
  const entry = { kind: "box", t: b.t, key: b.key, out: b.out, back: now, late: !!late, seen: b.done ? b.eps.length : b.ep };
  return {
    lib: change(lib, {
      boxes: (lib.boxes || []).filter(function (x) {
        return x.key !== key;
      }),
      history: [entry].concat(lib.history).slice(0, HISTORY_KEPT),
    }),
  };
}

export function overdueBoxes(lib, now) {
  return (lib.boxes || []).filter(function (b) {
    return now >= b.due;
  });
}

// The store stocks the Archive's feature films (no YouTube, no live streams, nothing short, and not a
// pack's direct links: the store's tapes and boxes are Archive items).
export function isFilm(item) {
  return !!item && !item.live && !item.u && typeof item.id === "string" && item.id.indexOf("yt:") !== 0 && item.d >= FILM_MIN_SECONDS;
}

function sortTitle(t) {
  return foldText(t).replace(/^(the|a|an|el|la|los|las) /, "");
}

// The shelves: one per channel with films on it, each film on one shelf only (the first channel that
// carries it). opts.skip(item): leave a film out (won't play in this country, failed today…).
export function storeShelves(channels, opts) {
  const skip = (opts && opts.skip) || null;
  const seen = {};
  const shelves = [];
  channels.forEach(function (ch) {
    if (!ch || ch.secret || ch.kind !== "video") return;
    const films = [];
    (ch.items || []).forEach(function (item) {
      if (!isFilm(item)) return;
      const key = programKey(item);
      if (seen[key]) return;
      seen[key] = 1;
      if (skip && skip(item)) return;
      films.push({ key: key, item: item, ch: ch });
    });
    films.sort(function (a, b) {
      const x = sortTitle(a.item.t);
      const y = sortTitle(b.item.t);
      return x < y ? -1 : x > y ? 1 : 0;
    });
    if (films.length) shelves.push({ ch: ch, films: films });
  });
  return shelves;
}

// "New this week": a handful of films from every shelf, the same all week.
export function staffPicks(shelves, week, n) {
  const all = [];
  shelves.forEach(function (s) {
    s.films.forEach(function (f) {
      all.push(f);
    });
  });
  return all
    .map(function (f) {
      return { f: f, h: hash32(f.key + "#" + week) };
    })
    .sort(function (a, b) {
      return a.h - b.h;
    })
    .slice(0, n || 12)
    .map(function (x) {
      return x.f;
    });
}

// Films whose title has every word typed (each the start of a word).
export function searchStore(shelves, text) {
  const words = foldText(text).split(" ").filter(Boolean);
  if (!words.length) return [];
  const out = [];
  shelves.forEach(function (s) {
    s.films.forEach(function (f) {
      const hay = " " + foldText(f.item.t) + " ";
      for (let k = 0; k < words.length; k++) if (hay.indexOf(" " + words[k]) < 0) return;
      out.push(f);
    });
  });
  return out;
}

// Family rows from Nova's shelf plan (2026-11-08), the "What feeds Grok's library-visual work"
// section. A row is a label over the per-channel shelves it names. channels are dial keys:
// "17" is that number with no sub-channel, "17-2" is the sub-channel. Pack shelves (30 and up)
// match the number in the pack's slug (p-…-30), so they show up when that pack is loaded and
// stay on the row even if the dial number was taken. A channel the plan lists twice (17, 33,
// 44, 46) is the same shelf under both labels: the films are not copied onto a second shelf.
// Anything unnamed still shows, in "The rest of the store".
//   { id, name, icon, blurb, channels: ["1", "17-2"], slugs?: ["midnight-noir"] }
export const SHELF_PLAN = [
  { id: "western", name: "Western Row", icon: "🌵", blurb: "High Noon, the singing cowboys, and Trail TV.", channels: ["1", "2", "3"] },
  { id: "horror", name: "Horror Row", icon: "🦇", blurb: "Creature features, the drive-in, and horror packs when they're loaded.", channels: ["7", "26", "32", "35", "44"] },
  { id: "sci-fi", name: "Sci-Fi Row", icon: "🛸", blurb: "Mission Control, and the sci-fi packs when they're loaded.", channels: ["17", "30", "31", "33", "46"] },
  { id: "noir", name: "Noir Row", icon: "🕵️", blurb: "Cliffhangers and Midnight Noir.", channels: ["5", "6"] },
  { id: "comedy", name: "Comedy Row", icon: "😂", blurb: "Laugh Track.", channels: ["10"] },
  { id: "silent", name: "Silent Row", icon: "🎞️", blurb: "Silent Era.", channels: ["9"] },
  { id: "space", name: "Space Row", icon: "🚀", blurb: "Mission Control and The Wild Blue.", channels: ["17", "17-2"] },
  { id: "world", name: "World Row", icon: "💬", blurb: "Subtítulos.", channels: ["23"] },
  { id: "eighties", name: "80s Row", icon: "📼", blurb: "80s packs, when they're loaded.", channels: ["33", "34", "43", "44"] },
  { id: "nineties", name: "90s Row", icon: "📼", blurb: "90s packs, when they're loaded.", channels: ["35", "36", "45", "46"] },
  { id: "anime", name: "Anime Row", icon: "🗾", blurb: "Anime films, when that pack is loaded. Series are box sets.", channels: ["40"] },
];

// A film on the shelf and the catalog book it comes from, or 111 and A Christmas Carol.
// Every id and title here is one that is in the shipped lineup, the catalog, or Pearly Gates.
// Radio dramatizations of Holmes, Dracula, and Poe are not tagged: the shipped radio channels
// have no program under those titles.
export const CROSS_LINKS = [
  {
    bookId: "phantomofopera00lero",
    bookTitle: "The phantom of the opera",
    films: [{ id: "ThePhantomoftheOpera", title: "The Phantom of the Opera" }],
  },
  {
    bookId: "strangecaseofdr00stevuoft",
    bookTitle: "The strange case of Dr. Jekyll and Mr. Hyde. Illustrated by Charles Raymond Macauley",
    films: [{ id: "DrJekyllandMrHyde", title: "Dr. Jekyll and Mr. Hyde" }],
  },
  {
    bookId: "hunchbackofnotre1hugo",
    bookTitle: "The Hunchback of Notre-Dame",
    films: [{ id: "The_Hunchback_of_Notre_Dame", title: "The Hunchback of Notre Dame" }],
  },
  {
    bookId: "AlicesAdventuresInWonderland",
    bookTitle: "Alice's Adventures In Wonderland",
    films: [
      { id: "AliceinWonderland1915", title: "Alice in Wonderland" },
      { id: "AliceInWonderland1915_503", title: "Alice In Wonderland" },
    ],
  },
  {
    bookId: "draculabr00stokuoft",
    bookTitle: "Dracula",
    films: [{ id: "Nosferatu_most_complete_version_93_mins.", title: "Nosferatu, eine Symphonie des Grauens (A Symphony of Horror)" }],
  },
  {
    bookId: "christmascar00dick",
    bookTitle: "A Christmas carol",
    station: { number: 111, slug: "pearly-gates", name: "Pearly Gates", filmId: "silent-a-christmas-carol", filmTitle: "A Christmas Carol" },
  },
];

// Tags for a tape: "From the book", when this film is one of the linked features.
export function filmTags(itemId) {
  const out = [];
  CROSS_LINKS.forEach(function (link) {
    const films = link.films || [];
    for (let i = 0; i < films.length; i++) {
      if (films[i].id === itemId) out.push({ tag: "From the book", title: link.bookTitle, bookId: link.bookId });
    }
  });
  return out;
}

// Tags for a book: the feature on the shelf, and 111 for A Christmas Carol.
export function bookTags(bookId) {
  const out = [];
  CROSS_LINKS.forEach(function (link) {
    if (link.bookId !== bookId) return;
    (link.films || []).forEach(function (film) {
      out.push({ tag: "On film", title: film.title, filmId: film.id });
    });
    if (link.station) out.push({ tag: "On " + link.station.number + " " + link.station.name, title: link.station.filmTitle, filmId: link.station.filmId });
  });
  return out;
}

const REST_AISLE = {
  id: "rest",
  name: "The rest of the store",
  icon: "📼",
  blurb: "Added channels, and anything the shelf plan hasn't named yet.",
};

function aisleCount(shelves) {
  let n = 0;
  shelves.forEach(function (sh) {
    n += sh.films.length;
  });
  return n;
}

// "17" or "17-2". A sub of 0 counts as the main channel.
function channelKey(ch) {
  if (!ch || ch.number == null || ch.number === "") return "";
  if (ch.sub) return String(ch.number) + "-" + ch.sub;
  return String(ch.number);
}

// A pack channel's plan number is the one in its slug (p-pack-name-30), not wherever it landed on the dial.
function packPlanNumber(ch) {
  const m = /^p-.+-(\d+)$/.exec((ch && ch.slug) || "");
  return m ? m[1] : "";
}

// Which plan key this shelf matches in this row, or "".
function rowKey(rule, ch) {
  if (!ch) return "";
  const keys = rule.channels || [];
  const pn = packPlanNumber(ch);
  if (pn) return keys.indexOf(pn) >= 0 ? pn : "";
  const key = channelKey(ch);
  if (key && keys.indexOf(key) >= 0) return key;
  const slugs = rule.slugs || [];
  if (ch.slug && slugs.indexOf(ch.slug) >= 0) return "slug:" + ch.slug;
  return "";
}

function rowIndex(rule, key) {
  if (key.indexOf("slug:") === 0) {
    const i = (rule.slugs || []).indexOf(key.slice(5));
    return (rule.channels || []).length + (i < 0 ? 999 : i);
  }
  const i = (rule.channels || []).indexOf(key);
  return i < 0 ? 999 : i;
}

// Shelves from storeShelves(), gathered into family rows. plan: a SHELF_PLAN-shaped list, or omit
// it for the shipped plan. A shelf the plan names twice is listed under both rows (the same shelf,
// not a copy). Empty rows are left off the floor. Returns [{ id, name, icon, blurb, shelves, count }].
export function groupAisles(shelves, plan) {
  const rules = plan || SHELF_PLAN;
  const aisles = rules.map(function (r) {
    return { id: r.id, name: r.name, icon: r.icon || "📼", blurb: r.blurb || "", shelves: [], keys: [] };
  });
  const rest = { id: REST_AISLE.id, name: REST_AISLE.name, icon: REST_AISLE.icon, blurb: REST_AISLE.blurb, shelves: [] };
  (shelves || []).forEach(function (sh) {
    let placed = false;
    for (let i = 0; i < rules.length; i++) {
      const key = rowKey(rules[i], sh && sh.ch);
      if (!key) continue;
      aisles[i].shelves.push(sh);
      aisles[i].keys.push(key);
      placed = true;
    }
    if (!placed) rest.shelves.push(sh);
  });
  aisles.forEach(function (a, i) {
    const order = a.shelves.map(function (sh, n) {
      return { sh: sh, i: rowIndex(rules[i], a.keys[n]) };
    });
    order.sort(function (x, y) {
      return x.i - y.i;
    });
    a.shelves = order.map(function (x) {
      return x.sh;
    });
    delete a.keys;
    a.count = aisleCount(a.shelves);
  });
  const out = aisles.filter(function (a) {
    return a.shelves.length;
  });
  if (rest.shelves.length) {
    rest.count = aisleCount(rest.shelves);
    out.push(rest);
  }
  return out;
}

// Every film in an aisle, shelves in order, for "browse the whole aisle".
export function aisleFilms(aisle) {
  const out = [];
  ((aisle && aisle.shelves) || []).forEach(function (sh) {
    sh.films.forEach(function (f) {
      out.push(f);
    });
  });
  return out;
}

// ---------- the Reading Room's books ----------

export function bookLoan(lib, id) {
  const list = lib.books || [];
  for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}

// Borrowing a book: { id, t, by, y }. Returns { lib, loan } or { error, text }.
export function borrowBook(lib, book, now) {
  if (!lib.card) return { error: "card", text: "You need a library card first. It's free." };
  if (bookLoan(lib, book.id)) return { error: "out", text: "You already have this book." };
  const books = lib.books || [];
  if (books.length >= MAX_BOOKS) {
    return { error: "full", text: "You have " + MAX_BOOKS + " books out. Return one to make room." };
  }
  const loan = { id: book.id, t: book.t, by: book.by || "", y: book.y || 0, out: now, due: now + BOOK_DAYS * 86400000 };
  return { lib: change(lib, { books: books.concat([loan]) }), loan: loan };
}

// Back to the library (any time; no rewinding books). Returns { lib } or { error, text }.
export function returnBook(lib, id, now, late) {
  const b = bookLoan(lib, id);
  if (!b) return { error: "none", text: "That book isn't checked out." };
  const entry = { kind: "book", t: b.t, y: b.y, key: b.id, out: b.out, back: now, late: !!late };
  return {
    lib: change(lib, {
      books: (lib.books || []).filter(function (x) {
        return x.id !== id;
      }),
      history: [entry].concat(lib.history).slice(0, HISTORY_KEPT),
    }),
  };
}

export function overdueBooks(lib, now) {
  return (lib.books || []).filter(function (b) {
    return now >= b.due;
  });
}

// Where you are in a book (volume v, page p) and how you like it read. Kept for books returned too, so
// borrowing one again opens where you left off.
export function setMark(lib, id, mark, now) {
  const marks = Object.assign({}, lib.marks || {});
  marks[id] = { v: Math.max(0, mark.v | 0), p: Math.max(0, mark.p | 0), rtl: mark.rtl, shift: !!mark.shift, at: now };
  const ids = Object.keys(marks);
  if (ids.length > MARKS_KEPT) {
    ids
      .sort(function (a, b) {
        return marks[a].at - marks[b].at;
      })
      .slice(0, ids.length - MARKS_KEPT)
      .forEach(function (k) {
        delete marks[k];
      });
  }
  return change(lib, { marks: marks });
}

export function markFor(lib, id) {
  return (lib.marks && lib.marks[id]) || null;
}
