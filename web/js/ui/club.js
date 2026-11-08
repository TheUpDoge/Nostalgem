// The Video Club's screens: the sign-up pages (what the club is, what the Internet Archive is, the fine
// print to sign), the library card, a tape's box, and the rewind. Words and markup only; main.js wires
// them to the menu, the dialog and the player.

import { escapeHtml as esc, fmtDuration } from "../util.js";
import { MAX_TAPES, LOAN_HOURS, isRewound, dueText } from "../library.js";
import { thumbUrl, detailsUrl } from "../archive.js";

const DAYS = LOAN_HOURS / 24;
const TAPES = MAX_TAPES === 2 ? "two" : String(MAX_TAPES);

function list(items) {
  return (
    '<ul class="club-list">' +
    items
      .map(function (x) {
        return "<li>" + x + "</li>";
      })
      .join("") +
    "</ul>"
  );
}

// The sign-up, a page at a time (a TV dialog has no scroll bar). The last page has the signature line.
export const SIGNUP_PAGES = [
  {
    title: "📼 The NostalGem Video Club",
    html:
      "Remember the video store? Pick a tape off the shelf, take it home, watch it, rewind it, bring it back. " +
      "The Video Club works the same way, with feature films from the <b>Internet Archive</b>." +
      list([
        "A <b>library card</b> is free. You sign for it once, on the next pages.",
        "Check out up to <b>" + TAPES + " tapes</b> at a time, for <b>" + DAYS + " days</b> each.",
        "A tape you have out is yours to play, pause and pick up where you left off: Menu ▸ 📼 Video Club.",
        "When you're done, <b>◀◀ rewind</b> it and <b>⏏ return</b> it to make room for the next one.",
        "A tape still out when it's due goes back by itself. No late fees, ever.",
        "The same card borrows <b>books, comics, manga and magazines</b> in the 📚 Reading Room: up to three at a time, for two weeks.",
      ]),
  },
  {
    title: "🏛️ About the Internet Archive",
    html:
      list([
        "The <b>Internet Archive</b> (archive.org) is a non-profit library: millions of films, TV shows, radio programs and recordings, free for everyone, since 1996.",
        "Every tape and book here is one of its items, played or read straight from archive.org. NostalGem doesn't copy, store or sell anything.",
        "It runs on donations. If the Video Club brings you joy, consider giving to it at <b>archive.org/donate</b> (Menu ▸ 📜 Disclaimer &amp; donate has a QR code).",
      ]),
  },
  {
    title: "📜 The fine print",
    html:
      list([
        "Your card is part of this app and lives on this TV only. It is <b>not an archive.org account</b>, and checking out a tape or book here doesn't borrow anything from the Archive's own lending library (that takes a free archive.org account, on archive.org). Books the Archive only lends aren't on these shelves.",
        "What you watch comes from archive.org, and the Archive's <b>terms of use</b> apply (archive.org/about/terms). Its items come from many uploaders; their rights belong to their owners.",
        "Tapes and books are for the cardholder and household: personal, non-commercial use for learning and entertainment. NostalGem is free and isn't sold.",
        "Be kind, rewind.",
      ]) + '<div class="club-sign">Sign below with your name to agree and get your card.</div>',
    sign: true,
  },
];

// A barcode for the card number: bars from its digits (just for looks).
function barcode(number) {
  const digits = String(number).replace(/\D/g, "");
  let bars = "";
  for (let i = 0; i < digits.length; i++) {
    const n = Number(digits.charAt(i));
    bars += '<i style="width:' + (1 + (n % 3)) * 0.12 + "rem;margin-right:" + (1 + ((n * 7) % 3)) * 0.1 + 'rem"></i>';
  }
  return '<div class="club-barcode" aria-hidden="true">' + bars + "</div>";
}

function monthYear(ms) {
  const d = new Date(ms);
  const m = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][d.getMonth()];
  return m + " " + d.getFullYear();
}

// The library card itself.
export function cardHtml(card) {
  return (
    '<div class="club-card">' +
    '<div class="club-card-top"><span class="club-logo">NOSTAL<b>GEM</b></span><span class="club-kind">VIDEO CLUB · LIBRARY CARD</span></div>' +
    '<div class="club-card-name">' +
    esc(card.name) +
    "</div>" +
    '<div class="club-card-row"><span class="club-card-num">' +
    esc(card.number) +
    "</span><span>MEMBER SINCE " +
    monthYear(card.issued) +
    "</span></div>" +
    barcode(card.number) +
    '<div class="club-card-foot">' +
    TAPES.toUpperCase() +
    " TAPES · " +
    DAYS +
    " DAYS · BE KIND, REWIND</div>" +
    "</div>"
  );
}

// Where a tape stands: "at 0:42:10 · due back in 2 days", "rewound · due back in 5 hr".
export function tapeState(loan, now) {
  const where = isRewound(loan) ? "rewound" : loan.pos >= loan.d - 30 ? "at the end" : "at " + fmtDuration(loan.pos);
  return where + " · " + dueText(loan.due - now);
}

// A tape's box: the Archive's picture, title, year and length, what it's about, and where you stand.
export function tapeBoxHtml(film, loan, desc, now, note) {
  const it = film.item;
  const meta = [it.y ? String(it.y) : "", fmtDuration(it.d), film.ch ? "from " + film.ch.name : ""]
    .filter(function (x) {
      return !!x;
    })
    .join(" · ");
  const about = String(desc || "").replace(/\s+/g, " ").trim();
  return (
    '<div class="club-box">' +
    '<div class="club-art"><img alt="" src="' +
    esc(thumbUrl(it.id)) +
    '" loading="lazy"><span class="club-vhs">VHS</span></div>' +
    '<div class="club-box-text">' +
    '<div class="club-box-title">' +
    esc(it.t) +
    "</div>" +
    '<div class="club-box-meta">' +
    esc(meta) +
    "</div>" +
    (about ? '<div class="club-box-about">' + esc(about.length > 260 ? about.slice(0, 257) + "…" : about) + "</div>" : "") +
    '<div class="club-box-state">' +
    esc(loan ? "📼 You have this tape · " + tapeState(loan, now) + (note ? " · " + note : "") : note || "On the shelf") +
    "</div>" +
    '<div class="club-box-link">' +
    esc(detailsUrl(it.id).replace(/^https?:\/\//, "")) +
    "</div>" +
    "</div></div>"
  );
}

// The rewind: tape reels spinning backwards and the counter running down to 0:00:00.
export function rewindHtml(title, seconds) {
  return (
    '<div class="rw-box">' +
    '<div class="rw-label blink">◀◀ REWIND</div>' +
    '<div class="rw-tape"><i class="rw-reel"></i><i class="rw-reel"></i></div>' +
    '<div class="rw-counter">' +
    counter(seconds) +
    "</div>" +
    '<div class="rw-title">' +
    esc(title) +
    "</div>" +
    "</div>"
  );
}

// A VCR's tape counter: 1:23:45 → "1:23:45", 65 → "0:01:05".
export function counter(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h + ":" + (m < 10 ? "0" : "") + m + ":" + (r < 10 ? "0" : "") + r;
}

// The whirr of a tape rewinding: a motor note climbing as the tape speeds up, and a clunk at the end.
let audio = null;
export function whirr(ms) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audio) audio = new AC();
    if (audio.state === "suspended") audio.resume();
    const t = audio.currentTime;
    const end = t + ms / 1000;
    const out = audio.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.05, t + 0.15);
    out.gain.setValueAtTime(0.05, end - 0.08);
    out.gain.exponentialRampToValueAtTime(0.0001, end);
    out.connect(audio.destination);
    const motor = audio.createOscillator();
    motor.type = "sawtooth";
    motor.frequency.setValueAtTime(70, t);
    motor.frequency.exponentialRampToValueAtTime(260, end);
    const f = audio.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 900;
    motor.connect(f);
    f.connect(out);
    motor.start(t);
    motor.stop(end);
    const clunk = audio.createOscillator();
    const cg = audio.createGain();
    clunk.type = "square";
    clunk.frequency.setValueAtTime(110, end);
    clunk.frequency.exponentialRampToValueAtTime(40, end + 0.09);
    cg.gain.setValueAtTime(0.08, end);
    cg.gain.exponentialRampToValueAtTime(0.0001, end + 0.12);
    clunk.connect(cg);
    cg.connect(audio.destination);
    clunk.start(end);
    clunk.stop(end + 0.13);
  } catch (e) {
    /* no sound: the picture still rewinds */
  }
}
