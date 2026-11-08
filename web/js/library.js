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
const REWOUND_AT = 2; // a tape this close to the start counts as rewound (seconds)

export function emptyLibrary() {
  return { card: null, loans: [], history: [], books: [], marks: {} };
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
  return change(out, { card: null, loans: [], books: [] });
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

// The store stocks the Archive's feature films (no YouTube, no live streams, nothing short).
export function isFilm(item) {
  return !!item && !item.live && typeof item.id === "string" && item.id.indexOf("yt:") !== 0 && item.d >= FILM_MIN_SECONDS;
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
