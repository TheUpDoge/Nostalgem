// What's drawn on screen: the sunset scene, channel number, toast, info banner, full-screen cards, radio.

import { escapeHtml as esc, fmtClock, fmtDuration, fmtLeft, fmtRuntime, pad2, chLabel } from "../util.js";
import { ARCADE_URL } from "../arcade.js";
import { SOUTH_PARK_CHANNEL, SOUTH_PARK_URL } from "../southpark.js";
import { CITY_WIRE_CHANNEL, CITY_WIRE_URL } from "../citywire.js";
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
  // A length that isn't known yet (a YouTube video sent from a phone, before it plays) is left out.
  if (item.live) parts.push("● LIVE");
  else if (item.d > 0) parts.push(fmtRuntime(item.d));
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
  if (d.cut) badges.push('<span class="badge">✂ TV-SAFE CUT</span>');
  if (item && item.sent) badges.push('<span class="badge">📲 FROM YOUR PHONE</span>');

  let main;
  if (item) {
    // known: the program's length is known (a sent YouTube video's isn't until it plays).
    const known = d.pos ? d.pos.d > 0 : item.d > 0;
    const pct = d.pos && known ? Math.max(0, Math.min(100, (d.pos.at / d.pos.d) * 100)) : 0;
    // Time left on the clock: a channel playing slower (666) takes longer than the film's own length.
    const left = d.pos ? (d.pos.d - d.pos.at) / (d.pos.rate || 1) : item.d;
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
      (d.pos ? fmtDuration(d.pos.at) + (known ? " / " + fmtDuration(d.pos.d) : "") : "") +
      "</span><span>" +
      (known ? fmtLeft(left) : "") +
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
    esc(d.clockText || fmtClock(new Date(), d.clock24)) +
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

// YouTube is running an ad ahead of the show. Its sound is off and the card covers it; the show starts
// by itself when the ad is done. Deadpan, late-night bump style: white on black, lowercase.
export const AD_QUIPS = [
  "this is an ad. not ours. we don't know them either.",
  "your show is right behind this ad. it's in there. we checked.",
  "we turned the ad's sound off. you're welcome.",
  "youtube wanted a word. we asked them to keep it short.",
  "somewhere, a guy in a tie is getting paid for this.",
  "please enjoy this quiet black rectangle.",
  "be honest. you were going to get up anyway.",
  "remember tapes? you could fast-forward those.",
  "good time for a snack. we'll wait. so will the show.",
  "this card is holding an ad down so you don't have to.",
  "we interrupt this interruption to say: almost there.",
  "the tv is warming up your show. it likes it toasty.",
  "un momento, por favor. the show is coming.",
  "the ad thinks you're watching it. let it believe.",
  "nobody tell the ad we muted it.",
  "your show is fashionably late. very fashionably.",
];

export function adQuip(i) {
  const n = AD_QUIPS.length;
  return AD_QUIPS[(((Math.floor(i) || 0) % n) + n) % n];
}

export function adBreakCard(quip) {
  return (
    '<div class="ad-box">' +
    '<div class="ad-quip">' +
    esc(quip || AD_QUIPS[0]) +
    "</div>" +
    '<div class="ad-hint">your show starts right after · ch ▲▼ to surf</div>' +
    '<div class="ad-sig">nostalgem</div>' +
    "</div>"
  );
}

// Clean cuts (cuts.js): the card over a scene that can't air. The film plays on underneath, without sound.
export function cutCardHtml(text) {
  return (
    '<div class="cc-bars" aria-hidden="true"></div>' +
    '<div class="cc-box">' +
    '<div class="cc-tag">✂ TV-SAFE CUT</div>' +
    '<div class="cc-text">' +
    esc(text || "EXTREMELY GRAPHIC SCENE IS PLAYING") +
    "</div>" +
    '<div class="cc-sub">The picture and sound come back when it\'s over.</div>' +
    "</div>"
  );
}

// The secret arcade station: a card, not a program. No iframe —
// just a link out to the arcade, opened with OK or a tap.
export function arcadeCard(ch, inApp, here) {
  return (
    SCENE +
    panel(
      "A SECRET STATION",
      "🕹️ RETROGAMES.CC",
      "Retro console and arcade games in your browser — NES, SNES, Game Boy, Sega Genesis and more. Pick a game and play.",
      '<div class="arcade-coin blink">INSERT COIN</div>' +
        linkRow(ARCADE_URL, '<a class="arcade-go" href="' + esc(ARCADE_URL) + '" target="_blank" rel="noopener">▶ PLAY AT RETROGAMES.CC</a>') +
        '<div class="arcade-hint">' +
        linkHint(inApp, "the arcade", here, true) +
        "</div>"
    )
  );
}

// The secret South Park station: a card, not a program. No iframe — the official
// site only allows framing from its own origin — just a link out, opened with OK or a tap.
export function southParkCard(ch, inApp, here) {
  return (
    SCENE +
    panel(
      "A SECRET STATION",
      "📺 SOUTH PARK",
      "Full episodes, clips and more from the official South Park site. Oh my God, they killed Kenny!",
      '<div class="southpark-tag blink">RESPECT MY AUTHORITAH</div>' +
        linkRow(SOUTH_PARK_URL, '<a class="southpark-go" href="' + esc(SOUTH_PARK_URL) + '" target="_blank" rel="noopener">▶ WATCH AT SOUTHPARK.CC.COM</a>') +
        '<div class="southpark-hint">' +
        linkHint(inApp, "South Park", here) +
        "</div>"
    )
  );
}

// The secret City Wire station (555): a link out to ASCII City, a city drawn in text.
export function cityWireCard(ch, inApp, here) {
  return (
    SCENE +
    panel(
      "A SECRET STATION",
      "🏙️ ASCII CITY",
      "A whole city drawn in text characters. Take a walk around the block.",
      '<div class="citywire-tag blink">ALL THE WORLD\'S A TERMINAL</div>' +
        linkRow(CITY_WIRE_URL, '<a class="citywire-go" href="' + esc(CITY_WIRE_URL) + '" target="_blank" rel="noopener">▶ VISIT ASCIICITY.COM</a>') +
        '<div class="southpark-hint">' +
        linkHint(inApp, "ASCII City", here) +
        "</div>"
    )
  );
}

// A link-out station's card. inApp: the Android TV app. here: it can open the site right on the TV
// (newer apps); an older app can't, so the phone opens it (main.js draws the QR code into .link-qr).
export function linkCard(ch, inApp, here) {
  if (ch && ch.slug === SOUTH_PARK_CHANNEL.slug) return southParkCard(ch, inApp, here);
  if (ch && ch.slug === CITY_WIRE_CHANNEL.slug) return cityWireCard(ch, inApp, here);
  return arcadeCard(ch, inApp, here);
}

function linkRow(url, button) {
  return '<div class="link-row"><div class="link-qr" data-url="' + esc(url) + '"></div>' + button + "</div>";
}

function linkHint(inApp, what, here, games) {
  if (inApp && here) {
    return games
      ? "Press OK (or A on a controller) to play on this TV · BACK on the remote, or hold Select on the controller, comes back"
      : "Press OK to open " + what + " on this TV · BACK on the remote comes back";
  }
  return inApp
    ? "Scan the code with your phone to open " + what + " there · update the NostalGem TV app to open it right here"
    : "Press OK to open " + what + " in a new tab — or scan the code with your phone";
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
