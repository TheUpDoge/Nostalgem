// The Reading Room's screens: a book's box (cover, who wrote it, how many pages or volumes, which way it
// reads) and the library pocket card stamped with the date it's due. Words and markup only; main.js wires
// them to the menu, the dialog and the reader.

import { escapeHtml as esc } from "../util.js";
import { coverUrl, bookLink } from "../books.js";
import { dueText } from "../library.js";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

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
    '<div class="due-head">DATE DUE</div>' +
    '<div class="due-line"><span class="due-stamp">' +
    esc(stampDate(loan.due)) +
    "</span></div>" +
    '<div class="due-line"></div>' +
    '<div class="due-foot">' +
    esc(dueText(loan.due - now)) +
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
    '<div class="bk-box">' +
    '<div class="bk-cover"><img alt="" src="' +
    esc(coverUrl(entry.id)) +
    '" loading="lazy"></div>' +
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
