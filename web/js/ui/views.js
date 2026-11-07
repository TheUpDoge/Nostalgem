// What's drawn on screen: the sunset scene, channel number, toast, info banner, full-screen cards, radio.

import { escapeHtml as esc, fmtClock, fmtDuration, fmtLeft, fmtRuntime, pad2, chLabel } from "../util.js";
import { standbyText } from "../problems.js";
import { bumperForSlot } from "../bumpers.js";

export function $(id) {
  return document.getElementById(id);
}

// Saguaro silhouette standing on y=260; scaled from its base.
const SAGUARO = "M0 260V165H-25Q-40 165-40 150V105Q-40 92-27 92Q-14 92-14 105V140H0V75Q0 60 15 60Q30 60 30 75V120H48V85Q48 72 61 72Q74 72 74 85V130Q74 145 59 145H30V260Z";
function cactus(x, s, flip) {
  const ty = 260 * (1 - s);
  return '<path d="' + SAGUARO + '" transform="translate(' + x + " " + ty + ") scale(" + (flip ? -s : s) + " " + s + ')"/>';
}
export const SCENE =
  '<div class="scene" aria-hidden="true"><div class="sun"></div>' +
  '<svg class="cacti" viewBox="0 0 1800 260" preserveAspectRatio="xMidYMax meet" style="filter:drop-shadow(0 0 0.5vh #ff71ce)"><g fill="#12032c">' +
  cactus(170, 1.05) +
  cactus(470, 0.48, true) +
  cactus(1350, 0.4) +
  cactus(1640, 0.82, true) +
  '</g></svg><div class="floor"><div class="plane"></div></div><div class="horizon"></div></div>';

// The name, in chrome: NOSTAL in silver-blue, GEM in jewel tones.
export const LOGO = '<div class="logo">NOSTAL<span class="gem">GEM</span></div>';

// ---------- toast ----------
let toastTimer = 0;
const toastWatchers = [];
export function onToast(fn) {
  toastWatchers.push(fn);
}
export function toast(msg, ms) {
  toastWatchers.forEach(function (fn) {
    fn(msg);
  });
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    t.hidden = true;
  }, ms || 2600);
}

// ---------- channel number (top right) ----------
let osdTimer = 0;
export function osd(num, name, ms) {
  const o = $("osd");
  o.querySelector(".osd-num").textContent = num;
  o.querySelector(".osd-name").textContent = name || "";
  o.classList.add("show");
  clearTimeout(osdTimer);
  osdTimer = setTimeout(function () {
    o.classList.remove("show");
  }, ms || 3500);
}
export function osdChannel(ch, ms) {
  osd("CH " + chLabel(ch), ch.name, ms);
}
export function osdHide() {
  $("osd").classList.remove("show");
}

// ---------- helpers ----------
export function programMeta(item) {
  const parts = [];
  if (item.e) parts.push(item.e);
  if (item.y) parts.push(String(item.y));
  parts.push(item.live ? "● LIVE" : fmtRuntime(item.d));
  return parts.join(" · ");
}

export function hintsHtml(list) {
  return (
    '<div class="hints">' +
    list
      .map(function (h) {
        return "<span><b>" + esc(h[0]) + "</b> " + esc(h[1]) + "</span>";
      })
      .join("") +
    "</div>"
  );
}

// ---------- info banner ----------
// d: { ch, slot, pos: {at, d}, mode, shifted, fav, cc, ccLabel, sleepLeft, desc, clock24, hints }
export function bannerHtml(d) {
  const item = d.slot ? d.slot.item : null;
  const badges = [];
  if (d.mode === "paused") badges.push('<span class="badge warn">PAUSED</span>');
  else if (d.shifted) badges.push('<span class="badge warn">' + (d.slot && d.slot.onDemand ? "ON DEMAND" : "DELAYED") + "</span>");
  else if (d.mode === "playing" || d.mode === "tuning") badges.push('<span class="badge live">LIVE</span>');
  if (d.ch.kind === "audio") badges.push('<span class="badge">RADIO</span>');
  if (d.cc) badges.push('<span class="badge">' + esc(d.ccLabel || "CC") + "</span>");
  if (d.fav) badges.push('<span class="badge warn">★ FAV</span>');
  if (d.sleepLeft) badges.push('<span class="badge warn">SLEEP ' + Math.ceil(d.sleepLeft / 60000) + "m</span>");

  let main;
  if (item) {
    const pct = d.pos ? Math.max(0, Math.min(100, (d.pos.at / d.pos.d) * 100)) : 0;
    const left = d.pos ? d.pos.d - d.pos.at : item.d;
    main =
      '<div class="b-title">' +
      esc(item.t) +
      "</div>" +
      '<div class="b-meta">' +
      esc(programMeta(item)) +
      "</div>" +
      '<div class="bar"><i style="width:' +
      pct.toFixed(1) +
      '%"></i></div>' +
      '<div class="b-times"><span>' +
      (d.pos ? fmtDuration(d.pos.at) + " / " + fmtDuration(d.pos.d) : "") +
      "</span><span>" +
      fmtLeft(left) +
      "</span></div>" +
      (d.desc ? '<div class="b-desc">' + esc(d.desc) + "</div>" : "");
  } else {
    main = '<div class="b-title">' + esc(d.ch.tagline || "") + "</div>";
  }

  let next = "";
  if (d.slot && d.slot.next) {
    const n = d.slot.next;
    next =
      '<div><div class="b-next-label">UP NEXT · ' +
      esc(fmtClock(new Date(d.slot.slotEndMs), d.clock24)) +
      '</div><div class="b-next">' +
      esc(n.t) +
      (n.e ? " · " + esc(n.e) : "") +
      (n.y ? " <small>" + n.y + "</small>" : "") +
      "</div></div>";
  }

  return (
    '<div class="chip" style="--ch:' +
    esc(d.ch.color) +
    '"><div class="chip-num">' +
    chLabel(d.ch) +
    '</div><div class="chip-icon">' +
    esc(d.ch.icon || "") +
    "</div></div>" +
    '<div class="b-main"><div class="b-kicker" style="--ch:' +
    esc(d.ch.color) +
    '"><span class="chan">' +
    esc(d.ch.name) +
    "</span>" +
    badges.join("") +
    "</div>" +
    main +
    hintsHtml(d.hints) +
    "</div>" +
    '<div class="b-side"><div class="b-clock">' +
    esc(fmtClock(new Date(), d.clock24)) +
    "</div>" +
    next +
    "</div>"
  );
}

// ---------- full-screen cards ----------
function panel(kicker, title, sub, extra) {
  return (
    '<div class="card-panel">' +
    (kicker ? '<div class="card-kicker">' + esc(kicker) + "</div>" : "") +
    '<div class="card-title">' +
    esc(title) +
    "</div>" +
    (sub ? '<div class="card-sub">' + esc(sub) + "</div>" : "") +
    (extra || "") +
    "</div>"
  );
}

export function showCard(kind, html) {
  const c = $("card");
  c.className = "card card-" + kind;
  c.innerHTML = html;
  c.hidden = false;
}
export function hideCard() {
  const c = $("card");
  c.hidden = true;
  c.innerHTML = "";
}

// A station break (or a file that ended early): the next program starts when this slot ends.
// About one break in three (every break on Commercial Break) shows a house bumper instead:
// a station ID card that still counts down and still says what's up next.
export function gapCard(ch, slot, clock24, bumpers) {
  const b = bumperForSlot(bumpers, slot, ch);
  if (b && slot.next) return bumperCard(ch, slot, clock24, b);
  const n = slot.next;
  const startMs = slot.slotEndMs;
  const left = gapSecondsLeft(slot);
  return (
    SCENE +
    panel(
      "UP NEXT ON CH " + chLabel(ch) + " · " + ch.name.toUpperCase(),
      n.t,
      programMeta(n) + " · " + fmtClock(new Date(startMs), clock24),
      '<div class="card-count">' + fmtDuration(left) + "</div>"
    )
  );
}

// A house bumper: same sunset scene and panel, same countdown and up-next line
// as the plain break card, so it still does the break card's job.
export function bumperCard(ch, slot, clock24, bumper) {
  const n = slot.next;
  const startMs = slot.slotEndMs;
  const left = gapSecondsLeft(slot);
  return (
    SCENE +
    panel(
      bumper.kicker,
      bumper.title,
      bumper.sub,
      '<div class="card-count">' +
        fmtDuration(left) +
        "</div>" +
        '<div class="b-next-label">UP NEXT · ' +
        esc(fmtClock(new Date(startMs), clock24)) +
        '</div><div class="b-next">' +
        esc(n.t) +
        (n.e ? " · " + esc(n.e) : "") +
        (n.y ? " <small>" + n.y + "</small>" : "") +
        "</div>"
    )
  );
}

export function gapSecondsLeft(slot) {
  return Math.max(0, Math.ceil((slot.slotEndMs - Date.now()) / 1000));
}

export function standbyCard(info) {
  const left = info && info.retryAt ? Math.max(0, Math.ceil((info.retryAt - Date.now()) / 1000)) : 0;
  const why = standbyText(info && info.why, info && info.text);
  return '<div class="bars"></div>' + panel("TECHNICAL DIFFICULTIES", "PLEASE STAND BY", why + (left ? " Trying again in " + left + "s." : " Trying again…"));
}

// why: the last reason a program here wouldn't play, when program after program wouldn't.
export function emptyCard(ch, why) {
  return (
    '<div class="bars"></div>' +
    panel(
      "CH " + chLabel(ch) + " · " + ch.name.toUpperCase(),
      "NO SIGNAL",
      why ? "Nothing on this channel will play here right now. " + why + " Try another channel." : "Nothing on this channel plays right now. Try another channel."
    )
  );
}

export function signoffCard() {
  return '<div class="bars"></div>' + panel("GOOD NIGHT", "THIS CONCLUDES OUR BROADCAST DAY", "Press any button to turn the TV back on.");
}

export function tunedOutCard() {
  return SCENE + panel("TUNED OUT", "Still there?", "We switched off after four quiet hours to save the Archive's bandwidth. Press any button to tune back in.");
}

export function stillCard() {
  return SCENE + panel("ARE YOU STILL WATCHING?", "Press any button", "or we'll switch off in two minutes to save the Archive's bandwidth.");
}

export function gestureCard() {
  return (
    SCENE +
    '<div class="card-panel" style="background:none;border:0;box-shadow:none">' +
    LOGO +
    '<div class="logo-tv">TV</div><div class="boot-status blink">PRESS OK TO TURN ON</div></div>'
  );
}

// ---------- radio ----------
export function radioHtml(ch, item) {
  let bars = "";
  for (let i = 0; i < 18; i++) bars += '<i style="animation-delay:-' + ((i * 0.37) % 0.9).toFixed(2) + "s;animation-duration:" + (0.6 + ((i * 7) % 5) * 0.12).toFixed(2) + 's"></i>';
  return (
    SCENE +
    '<div class="onair">ON THE AIR</div>' +
    '<div class="radio-show">' +
    esc(item ? item.t : ch.name) +
    "</div>" +
    '<div class="radio-ep">' +
    esc(item ? item.e || (item.y ? String(item.y) : "") : ch.tagline) +
    "</div>" +
    '<div class="eq">' +
    bars +
    "</div>"
  );
}
