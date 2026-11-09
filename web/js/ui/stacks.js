// The Reading Room's screens: a book's box (cover, who wrote it, how many pages or volumes, which way it
// reads) and the library pocket card stamped with the date it's due. Words and markup only; main.js wires
// them to the menu, the dialog and the reader.

import { escapeHtml as esc, hash32 } from "../util.js";
import { coverUrl, bookLink } from "../books.js";
import { dueText, MAX_BOOKS, BOOK_DAYS } from "../library.js";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const BOOK_N = MAX_BOOKS === 3 ? "THREE" : String(MAX_BOOKS);
const BOOK_SPAN = BOOK_DAYS === 14 ? "TWO WEEKS" : BOOK_DAYS + " DAYS";
const BOOK_RULE = BOOK_N + " BOOKS · " + BOOK_SPAN;

const CLOTH = ["#6e2b2b", "#1e3f66", "#2d5a45", "#5c3d78", "#8a5a2b", "#6b3048", "#1f555c", "#3d3428", "#7a3e52", "#243d32"];

export function clothColor(id) {
  return CLOTH[hash32(String(id || "book")) % CLOTH.length];
}

function spineLabel(title) {
  const t = String(title || "").replace(/\s+/g, " ").trim();
  return t.length > 22 ? t.slice(0, 21) + "…" : t;
}

// The sign over the reading room. The loan line is the same rule borrowBook uses.
export function readingRoomHtml() {
  return '<div class="place-sign place-sign-room"><div class="place-neon">READING ROOM</div><div class="place-rule">' + esc(BOOK_RULE) + "</div></div>";
}

// Book spines along a shelf. books: { id, t }. Decorative; the list under it is what the remote moves through.
export function bookSpineHtml(books, kicker) {
  const list = books || [];
  if (!list.length) return kicker ? '<div class="place-kicker">' + esc(kicker) + "</div>" : "";
  const shown = list.slice(0, 14);
  let spines = "";
  shown.forEach(function (b) {
    spines += '<i style="--spine:' + clothColor(b.id || b.t) + '"><span>' + esc(spineLabel(b.t)) + "</span></i>";
  });
  const more = list.length - shown.length;
  return (
    '<div class="place-block">' +
    (kicker ? '<div class="place-kicker">' + esc(kicker) + "</div>" : "") +
    '<div class="spine-row books" aria-hidden="true">' +
    spines +
    (more > 0 ? '<b class="spine-more">+' + more + "</b>" : "") +
    "</div></div>"
  );
}

// An empty catalog shelf (the manga one): the note on why nothing is there, with bare shelf boards.
export function emptyShelfHtml(name, note) {
  return (
    '<div class="empty-shelf">' +
    '<div class="empty-shelf-sign">' +
    esc(name) +
    "</div>" +
    '<div class="spine-row books spine-row-empty" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
    '<p class="empty-shelf-note">' +
    esc(note || "Nothing on this shelf yet.") +
    "</p></div>"
  );
}

// "NOV 22 2026", the way a library's date stamp prints it.
export function stampDate(ms) {
  const d = new Date(ms);
  return MONTHS[d.getMonth()] + " " + d.getDate() + " " + d.getFullYear();
}

// "due back in 9 days", for lists.
export function dueSlipText(loan, now) {
  return dueText(loan.due - now);
}

// The pocket card glued inside the back cover, with the due date stamped in red.
export function dueSlipHtml(loan, now) {
  return (
    '<div class="due-slip">' +
    '<div class="due-brand">NOSTALGEM · READING ROOM</div>' +
    '<div class="due-head">DATE DUE</div>' +
    '<div class="due-line"><span class="due-stamp">' +
    esc(stampDate(loan.due)) +
    "</span></div>" +
    '<div class="due-line"></div>' +
    '<div class="due-line"></div>' +
    '<div class="due-foot">' +
    esc(dueText(loan.due - now)) +
    "</div>" +
    '<div class="due-rule">' +
    esc(BOOK_RULE) +
    "</div>" +
    "</div>"
  );
}

// entry: a shelf's search hit { id, t, by, y }; book: the full book once its details are in (or null while
// they load); loan: yours, if you have it out; mark: where you were.
export function bookBoxHtml(entry, book, loan, mark, now, note) {
  const title = book ? book.title : entry.t || entry.id;
  const by = book ? book.by : entry.by;
  const y = book ? book.y : entry.y;
  const facts = [];
  if (by) facts.push(by);
  if (y) facts.push(String(y));
  if (book) {
    if (book.volumes.length > 1) facts.push(book.volumes.length + " volumes");
    else if (book.pages) facts.push(book.pages + " pages");
  }
  const about = book ? book.about : "";
  let state = "";
  if (!book) state = '<div class="bk-state">Fetching its details from the Archive…</div>';
  else if (loan) {
    state =
      '<div class="bk-out">' +
      dueSlipHtml(loan, now) +
      '<div class="bk-state">📚 You have this one' +
      (mark ? " · bookmark at " + (book.volumes.length > 1 ? "vol. " + (mark.v + 1) + ", " : "") + "page " + (mark.p + 1) : "") +
      "</div></div>";
  } else if (note) state = '<div class="bk-state">' + esc(note) + "</div>";
  const qr = book && (book.restricted || !book.volumes.length);
  return (
    '<div class="bk-box' +
    (loan ? " out" : "") +
    '">' +
    '<div class="bk-volume" style="--spine:' +
    clothColor(entry.id) +
    '"><div class="bk-spine"><span>' +
    esc(spineLabel(by || title)) +
    '</span></div><div class="bk-cover"><img alt="" src="' +
    esc(coverUrl(entry.id)) +
    '" loading="lazy"></div></div>' +
    '<div class="bk-text">' +
    '<div class="bk-title">' +
    esc(title) +
    "</div>" +
    (facts.length ? '<div class="bk-meta">' + esc(facts.join(" · ")) + "</div>" : "") +
    (book && book.rtl ? '<div class="bk-rtl">右→左 Reads right to left, like manga</div>' : "") +
    (about ? '<div class="bk-about">' + esc(about.length > 280 ? about.slice(0, 277) + "…" : about) + "</div>" : "") +
    state +
    (qr ? '<div class="link-row"><div class="link-qr" data-url="' + esc(bookLink(entry.id)) + '"></div><span>Scan to open it on archive.org</span></div>' : "") +
    '<div class="bk-link">' +
    esc(bookLink(entry.id).replace(/^https?:\/\//, "")) +
    "</div>" +
    "</div></div>"
  );
}
