// NostalGem: the set itself. Wires the remote, the tuner, the guide, the menu and the screen together.

import { makeTimeline, slotAt, programKey, nextAiring, foldText } from "./schedule.js";
import { guessCountry, playableIn } from "./regions.js";
import { Player } from "./player.js";
import { Static } from "./static.js";
import { actionFor, isTypingTarget, registerTvKeys } from "./remote.js";
import { load, save } from "./store.js";
import { archiveLinkQuery, buildChannel, browserFetchJson, metadataUrl } from "./archive.js";
import { archiveAboutHtml } from "./about.js";
import { buildItemsChannel, packChannelDef, parsePack, validatePack, PACK_MIN_NUMBER, PACK_MAX_NUMBER } from "./packs.js";
import { LINK_CHANNELS, isLinkChannel, isGuideVisible, linkCardName, linkUrl, openLinkChannel } from "./linkout.js";
import { createGamepad } from "./gamepad.js";
import { LOOKS, asciiMask, comboCss, lookById, lookCss, lookYtCss, looksSvg, mixable, nextLook } from "./looks.js";
import { FrameWatch } from "./framewatch.js";
import { MAX_TAPES, LOAN_HOURS, MAX_BOOKS, BOOK_DAYS, cleanLibrary, issueCard, cancelCard, loanFor, checkOut, setPosition, isRewound, rewind, returnTape, overdue, storeShelves, staffPicks, searchStore, bookLoan, borrowBook, returnBook, overdueBooks, setMark, markFor } from "./library.js";
import { bookSearchUrl, parseBookSearch, bookFromMetadata, pageNumbersUrl, parsePageNumbers, scandataUrl, parseScandata, parseShelves } from "./books.js";
import { Reader } from "./ui/reader.js";
import * as Stacks from "./ui/stacks.js";
import * as Club from "./ui/club.js";
import { SECRET_STATIONS, SECRET_ABOUT, secretStation, introHtml, introSound, stationQuip, stationClock, bugText } from "./secrets.js";
import { Church } from "./church.js";
import { CHANGES, whatsNew, changesHtml, WELCOME_HTML } from "./changes.js";
import { CanvasLook } from "./fxcanvas.js";
import { Ambience, AMBIENCES, ambienceName } from "./ambience.js";
import { pickSubtitle, subtitleLabel } from "./captions.js";
import { Guide } from "./ui/guide.js";
import { Menu } from "./ui/menu.js";
import { Dialog } from "./ui/dialog.js";
import { Numpad } from "./ui/numpad.js";
import * as V from "./ui/views.js";
import { TvLink, makeCode, cleanCode, remoteUrl, prettyCode, qrSvg, loadScript, isIPv4, PAGES_BASE } from "./link.js";
import { pathsText } from "./relay.js";
import { loadLineup, builtAt } from "./lineup.js";
import { loadBumpers } from "./bumpers.js";
import { pad2, escapeHtml as esc, slugify, fmtClock, fmtDuration, hash32, chLabel, chKey, chOrder, numberText } from "./util.js";

const VERSION = "1.10.1";
const NAME = "NostalGem";
const params = new URLSearchParams(window.location.search);
const ANDROID = params.get("tv") === "android";
// The TV app opens the published site, and falls back to its own copy when it can't reach it. That
// copy's lineup is as old as the app, while the published one is rebuilt daily, so the copy asks for it.
const ON_PAGES = window.location.href.indexOf(PAGES_BASE) === 0;
const LIVE_LINEUP = ANDROID && !ON_PAGES ? PAGES_BASE + "data/lineup.json" : "";
const LINEUP_RECHECK = 3 * 3600 * 1000; // coming back to the app after this long: look for a newer lineup

const DEFAULTS = { crt: "light", fit: "contain", cc: "off", staticFx: "sound", bug: true, clock24: false, surf: "all", phone: false, region: "auto", look: "off", mix: "off", ambience: "off", lookQuality: "auto", liteLooks: {}, readMode: "auto", readPaper: "day" };
const SLEEP_STEPS = [0, 15, 30, 45, 60, 90, 120];
// Whether this TV had used NostalGem before this start (for a welcome, or "what's new").
const HAD_USED = load("settings", null) != null || load("last", null) != null || load("favs", null) != null;
const STILL_AFTER = 4 * 3600 * 1000; // no button pressed for four hours: ask
const STILL_GRACE = 2 * 60 * 1000; // then switch off two minutes later
const BAD_TTL = 24 * 3600 * 1000; // a file that wouldn't play is skipped for a day
const PROBLEMS_KEPT = 30; // Menu ▸ Playback problems lists this many
const CUSTOM_FROM = 30; // channels you add start at CH 30
const SWATCHES = ["#ff2a6d", "#05d9e8", "#b967ff", "#fffb96", "#ff9f1c", "#3ddc97", "#f72585", "#4cc9f0"];

const $ = V.$;
const tv = $("tv");
const banner = $("banner");
const bug = $("bug");
const radio = $("radio");
const touch = $("touch");

function pruneBad(bad) {
  const now = Date.now();
  const out = {};
  Object.keys(bad || {}).forEach(function (k) {
    if (bad[k] > now) out[k] = bad[k];
  });
  return out;
}

const app = {
  lineup: null,
  adCount: Math.floor(Math.random() * 1000), // which ad-break quip comes next
  boxToken: 0, // the book box showing now (its details arrive later)
  adQuip: "",
  about: {},
  bumpers: [],
  channels: [],
  idx: -1,
  last: -1,
  s: Object.assign({}, DEFAULTS, load("settings", {})),
  favs: new Set(load("favs", [])),
  hidden: new Set(load("hidden", [])),
  bad: pruneBad(load("bad", {})),
  problems: keptProblems(load("problems", [])),
  skipToastAt: 0,
  emptyWhy: "",
  badSet: null,
  timelines: {},
  digits: "",
  digitTimer: 0,
  surfTimer: 0,
  pendingIdx: -1,
  bannerUntil: 0,
  sleepAt: 0,
  sleepWarned: false,
  lastInput: Date.now(),
  stillShownAt: 0,
  state: "boot", // boot | on | off
  suspended: false,
  exitArmedAt: 0,
  lastProgKey: "",
  ticks: 0,
  phones: 0,
  pairOpen: false,
  lineupSource: "",
  lineupCheckedAt: 0,
  calling: "",
  callingWhy: "",
};
const s = app.s;

const fx = new Static($("static"));
const ambience = new Ambience();
// Filter quality "auto": a filter that keeps the frame rate down gets its light version on this TV.
const frameWatch = new FrameWatch(function (key) {
  if (s.lookQuality !== "auto" || key !== lookKey() || lookIsLite()) return;
  s.liteLooks = Object.assign({}, s.liteLooks || {});
  s.liteLooks[key] = 1;
  saveSettings();
  applyLook();
  V.toast("🎨 " + lookById(lookId()).name + " was slowing this TV down, so it's on its light version now (Menu ▸ Filter quality)", 6000);
});
const canvasLook = new CanvasLook({ video: $("screen"), yt: $("yt"), before: $("yt"), rainBefore: $("radio") });
const church = new Church(); // 111's sound
const numpad = new Numpad($("numpad"), {
  describe: function (typed) {
    const exact = channelForDigits(typed, false);
    const longer = app.channels.some(function (c) {
      const k = chKey(c);
      return k.length > typed.length && k.indexOf(typed) === 0;
    });
    const ch = channelForDigits(typed, true);
    return {
      text: ch ? "CH " + chLabel(ch) + " · " + ch.name : longer ? "Keep typing…" : "No channel " + typed,
      done: !!exact && !longer,
    };
  },
  go: function (typed) {
    app.digits = typed;
    commitDigits();
  },
  onClose: function () {
    updateBug();
  },
});
$("numpad").addEventListener("click", function (e) {
  const b = e.target.closest ? e.target.closest("[data-i]") : null;
  if (b) numpad.click(Number(b.getAttribute("data-i")));
  else if (!(e.target.closest && e.target.closest(".np-box"))) numpad.close(); // a tap beside the pad
});

function openNumpad() {
  hideBanner();
  menu.close();
  guide.close();
  numpad.open();
  updateBug();
}
const player = new Player($("screen"), {
  ytHost: $("yt"),
  church: church,
  // After a church film the player swaps in a fresh <video>: the filters draw from that one.
  media: function (el) {
    canvasLook.setVideo(el);
  },
  // The TV app may always start sound by itself; a browser tab once the viewer has pressed something.
  autoplayOk: function () {
    const ua = navigator.userActivation;
    return ANDROID || !!(ua && ua.hasBeenActive);
  },
  state: onPlayerState,
  program: onProgram,
  bad: onBad,
  problem: onProblem,
  captions: function (info) {
    if (info.error) V.toast("Subtitles aren't available for this program");
  },
  buffering: function (b) {
    tv.classList.toggle("buffering", !!b && player.mode === "playing");
  },
});

const guide = new Guide($("guide"), {
  channels: visibleChannels,
  timeline: timelineFor,
  tunedSlug: function () {
    return current() ? current().slug : "";
  },
  isFav: function (slug) {
    return app.favs.has(slug);
  },
  about: function (id) {
    return app.about[id];
  },
  clock24: function () {
    return s.clock24;
  },
  onTune: function (ch, prog) {
    guide.close();
    const now = Date.now();
    if (ch === current() && (!prog || prog.startMs <= now)) {
      showBanner(6000);
      return;
    }
    // A program later on: no need to wait for it.
    if (prog && prog.startMs > now + 60000 && !prog.item.live) {
      watchFromStart(ch, prog.item);
      return;
    }
    tuneTo(ch);
  },
});
const menu = new Menu($("menu"), updateBug);
const dialog = new Dialog($("dialog"));
// The Reading Room's reader (see the Reading Room below).
const reader = new Reader($("reader"), {
  pages: loadPages,
  onMark: function (id, m) {
    lib = setMark(lib, id, m, Date.now());
    clearTimeout(app.markTimer);
    app.markTimer = setTimeout(saveLib, 800);
  },
  onPrefs: function (pr) {
    s.readMode = pr.mode;
    s.readPaper = pr.paper;
    saveSettings();
  },
  onClose: function () {
    saveLib();
    // Back to the TV: the channel comes back on if reading switched it off.
    if (app.readStopped) {
      app.readStopped = false;
      if (app.state === "on" && !app.suspended && current()) tuneTo(current(), { quiet: true });
    }
    updateBug();
  },
  sound: function () {
    return fx.sound;
  },
});

// A picture that won't load (a box with no cover art) just stays blank.
$("dialog").addEventListener(
  "error",
  function (e) {
    if (e.target && e.target.tagName === "IMG") e.target.style.visibility = "hidden";
  },
  true
);

// ---------- channels ----------
function current() {
  return app.channels[app.idx];
}
function visibleChannels() {
  return app.channels.filter(function (c) {
    return isGuideVisible(c, app.hidden);
  });
}
function surfList() {
  const vis = visibleChannels();
  if (s.surf === "favs") {
    const favs = vis.filter(function (c) {
      return app.favs.has(c.slug);
    });
    if (favs.length) return favs;
  }
  return vis;
}
// Programs left out of the schedule: ones that wouldn't play on this TV lately, and YouTube programs
// that can't play in this TV's country (regions.js).
function badSet() {
  if (!app.badSet) {
    const set = new Set(Object.keys(app.bad));
    const cc = app.country;
    const countries = app.lineup && app.lineup.countries;
    if (cc)
      app.channels.forEach(function (ch) {
        ch.items.forEach(function (p) {
          if (p.r && !playableIn(p.r, cc, countries)) set.add(programKey(p));
        });
      });
    app.badSet = set;
  }
  return app.badSet;
}

// Which country this TV is in: its time zone, else its language. "" when unknown or switched off.
function tvCountry() {
  if (s.region === "off") return "";
  let tz = "";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch (e) {
    /* an old browser: the language may still say */
  }
  return guessCountry(tz, navigator.languages || [navigator.language]);
}
function countryName(cc) {
  try {
    if (typeof Intl.DisplayNames === "function") return new Intl.DisplayNames([navigator.language || "en"], { type: "region" }).of(cc) || cc;
  } catch (e) {
    /* falls through */
  }
  return cc;
}
// A YouTube channel with nothing that plays in this country.
function blockedHere(ch) {
  const cc = app.country;
  const countries = app.lineup && app.lineup.countries;
  return (
    !!cc &&
    ch.items.length > 0 &&
    ch.items.every(function (p) {
      return p.r && !playableIn(p.r, cc, countries);
    })
  );
}
function toggleRegion() {
  s.region = s.region === "off" ? "auto" : "off";
  saveSettings();
  app.country = tvCountry();
  app.badSet = null;
  app.timelines = {};
  const ch = current();
  if (ch && app.state === "on" && !isLinkChannel(ch)) player.tune(timelineFor(ch));
}
function timelineFor(ch) {
  let tl = app.timelines[ch.slug];
  if (!tl) {
    tl = makeTimeline(ch, { gap: app.lineup.gap, epoch: Date.parse(app.lineup.epoch), skip: badSet() });
    app.timelines[ch.slug] = tl;
  }
  return tl;
}
function sortChannels() {
  const cur = current();
  const last = app.channels[app.last];
  app.channels.sort(chOrder);
  app.idx = app.channels.indexOf(cur);
  app.last = last ? app.channels.indexOf(last) : -1;
}

// ---------- tuning ----------
function staticBurst(ms) {
  if (s.staticFx !== "off") fx.burst(ms);
}

function tuneTo(ch, opts) {
  const o = opts || {};
  const i = app.channels.indexOf(ch);
  if (i < 0) return;
  if (i !== app.idx) {
    app.last = app.idx;
    app.idx = i;
    save("last", ch.slug);
    app.lookPickedOn = "";
  }
  clearTimeout(app.surfTimer);
  app.pendingIdx = -1;
  staticBurst(450);
  V.osdChannel(ch);
  app.lastProgKey = "";
  applyCaptions();
  // The secret stations dress the set while they're on (Dead Air's red glow), and say goodbye.
  const wasStation = app.station || "";
  app.station = secretStation(ch);
  tv.classList.toggle("station-bible-boys-church", app.station === "bible-boys-church");
  tv.classList.toggle("station-dead-air", app.station === "dead-air");
  tv.classList.toggle("station-pearly-gates", app.station === "pearly-gates");
  // A station with a look of its own wears it while it's on, unless the viewer picked another one there.
  const stationLook = ch.look && app.lookPickedOn !== ch.slug ? ch.look : "";
  if (stationLook !== (app.stationLook || "")) {
    app.stationLook = stationLook;
    applyLook();
  }
  if (wasStation && wasStation !== app.station) {
    hideIntro(false);
    const bye = stationQuip(wasStation, "leave");
    if (bye) V.toast(bye, 3000);
  }
  if (isLinkChannel(ch)) {
    // A link-out station has no schedule: park the player, let the snow settle, and show its card.
    player.off();
    fx.release();
    hideRadio();
    hideBanner();
    showLinkCard(ch);
    updateBug();
    return;
  }
  player.tune(timelineFor(ch));
  if (app.station && !o.quiet) showIntro(ch);
  else if (!o.quiet) showBanner(6000);
  updateBug();
}

// A secret station's opening card and sound, for a few seconds (any button skips it).
function showIntro(ch) {
  const el = $("intro");
  hideBanner();
  el.className = "intro intro-" + secretStation(ch);
  el.innerHTML = introHtml(ch);
  el.hidden = false;
  if (fx.sound) introSound(secretStation(ch));
  clearTimeout(app.introTimer);
  app.introTimer = setTimeout(function () {
    hideIntro(true);
  }, 5500);
}
function hideIntro(thenBanner) {
  clearTimeout(app.introTimer);
  app.introTimer = 0;
  const el = $("intro");
  if (el.hidden) return;
  el.hidden = true;
  el.innerHTML = "";
  if (thenBanner && app.state === "on" && !overlayOpen()) showBanner(5000);
}

// ▲▼ moves the number at once but waits a beat before tuning, so holding the button flips quickly.
function surf(dir) {
  const list = surfList();
  if (!list.length) return;
  const base = app.pendingIdx >= 0 ? app.channels[app.pendingIdx] : current();
  let next;
  const pos = list.indexOf(base);
  if (pos >= 0) next = list[(pos + dir + list.length) % list.length];
  else if (dir > 0)
    next =
      list.filter(function (c) {
        return chOrder(c, base) > 0;
      })[0] || list[0];
  else
    next =
      list
        .filter(function (c) {
          return chOrder(c, base) < 0;
        })
        .pop() || list[list.length - 1];
  app.pendingIdx = app.channels.indexOf(next);
  hideBanner();
  V.osdChannel(next, 2500);
  staticBurst(320);
  clearTimeout(app.surfTimer);
  app.surfTimer = setTimeout(function () {
    const ch = app.channels[app.pendingIdx];
    app.pendingIdx = -1;
    if (ch) tuneTo(ch);
  }, 380);
}

// Number entry. Channels are 1–2 digits; a sub-channel adds one more, so 5 0 1 is CH 50-1. The TV tunes
// as soon as no longer number could follow, otherwise after a short pause. 5 0 alone, on a channel that
// only has sub-channels, goes to the first of them.
// Numbers are typed like a cable box: 5 0 waits a beat for a sub-channel, 5 0 1 tunes 50-1, and where
// there's a 60-10, 6 0 1 waits a beat for the 0.
function typedLabel(typed) {
  if (typed.length === 1) return typed + "-";
  if (typed.length === 2) return pad2(Number(typed)) + "-";
  return typed.slice(0, 2) + "-" + typed.slice(2);
}
function digit(n) {
  app.digits = (app.digits + String(n)).slice(-4);
  const typed = app.digits;
  clearTimeout(app.digitTimer);
  const exact = channelForDigits(typed, false);
  const longer = app.channels.some(function (c) {
    const k = chKey(c);
    return k.length > typed.length && k.indexOf(typed) === 0;
  });
  // A leading zero ("069", "01") waits for the rest of the number.
  const zero = typed.charAt(0) === "0" && typed.length < 3;
  if (longer || zero) V.osd("CH " + typedLabel(typed), "", 2500);
  if (!zero && ((exact && !longer) || typed.length >= 4 || (!exact && !longer))) commitDigits();
  else app.digitTimer = setTimeout(commitDigits, 1600);
}

function channelForDigits(typed, firstSub) {
  const exact = app.channels.filter(function (c) {
    return chKey(c) === typed;
  })[0];
  if (exact || !firstSub) return exact;
  const num = Number(typed);
  return app.channels.filter(function (c) {
    return c.number === num;
  })[0];
}

// A channel number typed into a search box (a remote with no number buttons) tunes that channel instead of
// building a channel out of an Archive search for "777". Returns true when it did.
function tuneTypedNumber(text) {
  const digits = numberText(text);
  const ch = digits ? channelForDigits(digits, true) : null;
  if (!ch) return false;
  closeOverlays();
  tuneTo(ch);
  return true;
}

function commitDigits() {
  clearTimeout(app.digitTimer);
  const typed = app.digits;
  app.digits = "";
  if (!typed) return;
  const ch = channelForDigits(typed, true);
  if (ch) {
    closeOverlays();
    tuneTo(ch);
  } else {
    V.osd("CH " + (typed.length > 2 ? typedLabel(typed) : pad2(Number(typed))), "NO SIGNAL", 2000);
    staticBurst(500);
  }
}

function lastChannel() {
  const ch = app.channels[app.last];
  if (ch) tuneTo(ch);
  else V.toast("No previous channel yet");
}

function togglePause(kind) {
  if (kind === "play" && player.mode !== "paused") return;
  if (kind === "pause" && player.mode !== "playing") return;
  const r = player.togglePause();
  if (r === "paused") {
    V.toast(stationQuip(app.station, "pause") || "PAUSED · press ▶❚❚ or OK in the menu to resume", 2500);
    showBanner(0);
  } else if (r === "playing") showBanner(4000);
}

// ---------- player events ----------
function onPlayerState(mode, extra) {
  const ch = current();
  tv.classList.toggle("paused", mode === "paused");
  if (mode !== "playing") tv.classList.remove("buffering");
  if (app.stillShownAt && mode !== "playing" && mode !== "tuning") app.stillShownAt = 0;
  switch (mode) {
    case "tuning":
      if (s.staticFx !== "off") fx.hold();
      V.hideCard();
      showRadio(ch);
      break;
    case "playing":
      fx.release();
      if (!app.stillShownAt) V.hideCard();
      showRadio(ch);
      break;
    case "paused":
      break;
    case "gap":
      fx.release();
      hideRadio();
      if (player.slot) V.showCard("gap", V.gapCard(ch, player.slot, s.clock24, app.bumpers));
      break;
    case "standby":
      fx.release();
      hideRadio();
      V.showCard("standby", V.standbyCard(extra));
      app.standby = extra;
      break;
    case "empty":
      fx.release();
      hideRadio();
      app.emptyWhy = (extra && extra.why) || (ch && blockedHere(ch) ? "YouTube doesn't allow its videos in " + countryName(app.country) + "." : "");
      V.showCard("empty", V.emptyCard(ch, app.emptyWhy));
      break;
    case "gesture":
      fx.release();
      hideRadio();
      V.showCard("gesture", V.gestureCard());
      break;
    case "adbreak":
      fx.release();
      hideRadio();
      app.adQuip = V.adQuip(app.adCount++);
      V.showCard("adbreak", V.adBreakCard(app.adQuip));
      break;
    case "off":
      fx.release();
      hideRadio();
      break;
    default:
      break;
  }
  updateBug();
}

function onProgram(slot) {
  const key = programKey(slot.item) + "@" + slot.startMs;
  const changed = app.lastProgKey && key !== app.lastProgKey;
  app.lastProgKey = key;
  if (changed && app.state === "on" && !overlayOpen()) showBanner(5000);
  if (!radio.hidden) showRadio(current());
}

// A program that won't play is skipped on this TV for a day. stop: the player gave up on this channel
// for now (program after program wouldn't play here), so don't retune.
function onBad(item, info, stop) {
  app.bad[programKey(item)] = Date.now() + BAD_TTL;
  save("bad", app.bad);
  app.badSet = null;
  app.timelines = {};
  const ch = current();
  if (ch && !stop) player.tune(timelineFor(ch), true);
}

// ---------- find a show, watch on demand ----------
// Every program on every channel whose title has all the words typed (each as the start of a word),
// on now first, then soonest. OK watches it from the start right away, off the schedule.
const FIND_MAX = 40;
function findShows(text) {
  const words = foldText(text).split(" ").filter(Boolean);
  if (!words.length) return [];
  const now = Date.now();
  const best = {};
  app.channels.forEach(function (ch) {
    const tl = timelineFor(ch);
    tl.items.forEach(function (item, i) {
      const hay = " " + foldText(item.t + " " + (item.e || "")) + " ";
      for (let k = 0; k < words.length; k++) if (hay.indexOf(" " + words[k]) < 0) return;
      const when = nextAiring(tl, i, now);
      const key = programKey(item);
      if (!when || (best[key] && (best[key].when.onNow || best[key].when.startMs <= when.startMs))) return;
      best[key] = { ch: ch, item: item, when: when };
    });
  });
  return Object.keys(best)
    .map(function (k) {
      return best[k];
    })
    .sort(function (a, b) {
      return (b.when.onNow ? 1 : 0) - (a.when.onNow ? 1 : 0) || a.when.startMs - b.when.startMs;
    })
    .slice(0, FIND_MAX);
}

function airingText(w) {
  if (w.onNow) return "on now";
  const d = new Date(w.startMs);
  const days = Math.round((new Date(d.toDateString()) - new Date(new Date().toDateString())) / 86400000);
  const day = days === 0 ? "" : days === 1 ? "tomorrow " : d.toLocaleDateString(undefined, { weekday: "short" }) + " ";
  return day + fmtClock(d, s.clock24);
}

function openFind(text) {
  dialog.open({
    title: "Find a show",
    html:
      "Type a title, or a word from one: <b>junji ito</b>, <b>lone ranger</b>, <b>popeye</b>, <b>space</b>. " +
      "Every channel is searched, and you can watch what you find from the start right away.",
    input: { placeholder: "What are you looking for?", value: text || "" },
    buttons: [
      {
        label: "Find",
        action: function (d) {
          const t = d.value();
          if (tuneTypedNumber(t)) return;
          if (t.replace(/\s+/g, "").length < 2) {
            d.status("Type a few letters first, like: popeye");
            return;
          }
          if (!findShows(t).length) {
            d.status("Nothing by that name on any channel. Try other words, or Menu ▸ Add a channel ▸ Search the Archive.");
            return;
          }
          d.close();
          showFound(t);
        },
      },
      {
        label: "Cancel",
        action: function (d) {
          d.close();
        },
      },
    ],
  });
}

function showFound(text) {
  const found = findShows(text);
  if (!found.length) {
    V.toast('Nothing called "' + text + '" on any channel', 3500);
    return;
  }
  hideBanner();
  guide.close();
  menu.open({
    title: "Find: " + text,
    sub: (found.length >= FIND_MAX ? "The first " + FIND_MAX : found.length) + " found · OK watches from the start",
    items: function () {
      return found.map(function (r) {
        return {
          label: r.item.t,
          value: function () {
            return "CH " + chLabel(r.ch) + " · " + (r.item.live ? "live" : airingText(r.when));
          },
          ok: function () {
            watchFromStart(r.ch, r.item);
            return "close";
          },
        };
      });
    },
  });
  updateBug();
}

function watchFromStart(ch, item) {
  closeOverlays();
  if (ch !== current()) tuneTo(ch, { quiet: true });
  if (item.live) {
    showBanner(6000);
    return;
  }
  if (player.playFromStart(item)) {
    showBanner(6000);
    V.toast("▶ From the start: " + item.t + ". Menu ▸ Back to live returns to the schedule.", 4500);
  }
}

// ---------- the Video Club: a library card and tapes to check out ----------
let lib = cleanLibrary(load("library", null));
function saveLib() {
  save("library", lib);
}

// The store's shelves, worked out again when the channels change.
let shelvesFor = null;
let shelvesCache = [];
function clubShelves() {
  if (shelvesFor !== app.channels || shelvesCache.length === 0) {
    shelvesFor = app.channels;
    shelvesCache = storeShelves(app.channels, {
      skip: function (item) {
        return !!app.bad[programKey(item)];
      },
    });
  }
  return shelvesCache;
}

function findFilm(key) {
  const shelves = clubShelves();
  for (let i = 0; i < shelves.length; i++) {
    for (let k = 0; k < shelves[i].films.length; k++) if (shelves[i].films[k].key === key) return shelves[i].films[k];
  }
  // Not on a shelf any more (its channel changed): the tape still plays from what the loan remembers.
  const loan = loanFor(lib, key);
  if (!loan) return null;
  const ch = app.channels.filter(function (c) {
    return c.slug === loan.ch;
  })[0];
  return { key: key, item: { id: loan.id, f: loan.f, t: loan.t, d: loan.d, y: loan.y }, ch: ch || null };
}

function dueDay(ms) {
  const d = new Date(ms);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()] + " " + fmtClock(d, s.clock24);
}

function openClub() {
  hideBanner();
  guide.close();
  if (!menu.isOpen) menu.open(rootPage());
  menu.push(clubPage());
  updateBug();
}

function clubPage() {
  return {
    title: "📼 Video Club",
    sub: function () {
      return lib.card
        ? lib.card.name + " · " + lib.loans.length + " of " + MAX_TAPES + " tapes out · " + LOAN_HOURS / 24 + "-day rentals"
        : "Feature films from the Internet Archive, checked out like tapes. A library card is free.";
    },
    items: function () {
      const now = Date.now();
      const list = [];
      if (!lib.card) {
        list.push({
          label: "📇 Get a library card",
          sub: true,
          ok: function () {
            openSignup(0, null, false);
          },
        });
      } else {
        list.push({
          label: "📇 My library card",
          sub: true,
          value: lib.card.number,
          ok: function () {
            showMyCard(false, null);
          },
        });
      }
      list.push({ head: true, label: "Your tapes · " + lib.loans.length + " of " + MAX_TAPES });
      if (!lib.loans.length) list.push({ head: true, label: lib.card ? "None out. Pick one off a shelf below." : "Get a card, then pick one off a shelf." });
      lib.loans.forEach(function (loan) {
        list.push({
          label: "📼 " + loan.t,
          sub: true,
          value: function () {
            return Club.tapeState(loan, now);
          },
          ok: function () {
            const film = findFilm(loan.key);
            if (film) openTape(film);
          },
        });
      });
      list.push({ head: true, label: "Shelves" });
      const shelves = clubShelves();
      const picks = staffPicks(shelves, Math.floor(now / (7 * 86400000)), 12);
      list.push({
        label: "🆕 New this week",
        sub: true,
        value: picks.length + " tapes",
        ok: function () {
          menu.push(shelfPage("🆕 New this week", picks));
        },
      });
      list.push({
        label: "🔎 Search the store",
        sub: true,
        ok: function () {
          openStoreSearch();
        },
      });
      shelves.forEach(function (sh) {
        list.push({
          label: (sh.ch.icon || "📼") + " " + sh.ch.name,
          sub: true,
          value: sh.films.length + (sh.films.length === 1 ? " tape" : " tapes"),
          ok: function () {
            menu.push(shelfPage((sh.ch.icon || "📼") + " " + sh.ch.name, sh.films));
          },
        });
      });
      list.push({
        label: "📜 Club rules & the fine print",
        sub: true,
        ok: function () {
          openSignup(0, null, true);
        },
      });
      return list;
    },
  };
}

function shelfPage(title, films) {
  return {
    title: title,
    sub: films.length + (films.length === 1 ? " tape" : " tapes") + " · OK to look at the box",
    items: function () {
      return films.map(function (f) {
        return {
          label: f.item.t,
          value: function () {
            const out = loanFor(lib, f.key);
            return (out ? "📼 YOURS · " : "") + (f.item.y ? String(f.item.y) : "");
          },
          ok: function () {
            openTape(f);
          },
        };
      });
    },
  };
}

function openStoreSearch() {
  dialog.open({
    title: "🔎 Search the store",
    html: "A word or two from the title, like <b>western</b>, <b>night</b> or <b>lady</b>.",
    input: { placeholder: "Title words" },
    buttons: [
      {
        label: "Search",
        action: function (d) {
          const text = d.value();
          const found = searchStore(clubShelves(), text);
          if (!found.length) {
            d.status("No tapes with that in the title. Try another word.");
            return;
          }
          d.close();
          if (!menu.isOpen) menu.open(rootPage());
          menu.push(shelfPage("🔎 " + text, found));
        },
      },
      {
        label: "Cancel",
        action: function (d) {
          d.close();
        },
      },
    ],
  });
}

// The sign-up: what the club is, what the Archive is, and the fine print to sign. readOnly: just reading
// the rules again (a member). ret: { label, go } back to the tape or book they were looking at.
function openSignup(i, ret, readOnly) {
  const pages = Club.SIGNUP_PAGES;
  const p = pages[i];
  const last = i === pages.length - 1;
  const sign = last && !readOnly;
  const buttons = [];
  if (sign) {
    buttons.push({
      label: "✍ I agree · issue my card",
      action: function (d) {
        const r = issueCard(lib, d.value(), Date.now());
        if (r.error) {
          d.status(r.error);
          return;
        }
        lib = r.lib;
        saveLib();
        d.close();
        showMyCard(true, ret);
      },
    });
  } else if (!last) {
    buttons.push({
      label: "Next ▶",
      action: function (d) {
        d.close();
        openSignup(i + 1, ret, readOnly);
      },
    });
  }
  if (i > 0) {
    buttons.push({
      label: "◀ Back",
      action: function (d) {
        d.close();
        openSignup(i - 1, ret, readOnly);
      },
    });
  }
  buttons.push({
    label: readOnly ? "Close" : "Cancel",
    action: function (d) {
      d.close();
    },
  });
  dialog.open({
    title: p.title + "  " + (i + 1) + "/" + pages.length,
    html: p.html,
    input: sign ? { placeholder: "Sign here: your name" } : null,
    buttons: buttons,
  });
}

function shortTitle(t) {
  return t.length > 24 ? t.slice(0, 23) + "…" : t;
}

function showMyCard(welcome, ret) {
  if (!lib.card) return;
  const buttons = [];
  if (ret) {
    buttons.push({
      label: ret.label,
      action: function (d) {
        d.close();
        ret.go();
      },
    });
  }
  buttons.push({
    label: "📼 Video Club",
    action: function (d) {
      d.close();
      openClub();
    },
  });
  buttons.push({
    label: "📚 Reading Room",
    action: function (d) {
      d.close();
      openStacks();
    },
  });
  buttons.push({
    label: "Close",
    action: function (d) {
      d.close();
    },
  });
  if (!welcome) {
    buttons.push({
      label: "✂ Cut up my card",
      action: function (d) {
        d.close();
        confirmCancelCard();
      },
    });
  }
  const books = lib.history.filter(function (h) {
    return h.kind === "book";
  }).length;
  const tapes = lib.history.length - books;
  dialog.open({
    title: welcome ? "🎉 Welcome to the club!" : "📇 Your library card",
    html:
      Club.cardHtml(lib.card) +
      '<div class="club-sub">' +
      (welcome
        ? "Tapes: up to " + MAX_TAPES + " at a time, " + LOAN_HOURS / 24 + " days each. Books: up to " + MAX_BOOKS + ", " + BOOK_DAYS + " days each."
        : lib.loans.length + " of " + MAX_TAPES + " tapes and " + (lib.books || []).length + " of " + MAX_BOOKS + " books out · " + tapes + (tapes === 1 ? " tape" : " tapes") + " and " + books + (books === 1 ? " book" : " books") + " returned") +
      "</div>",
    buttons: buttons,
  });
}

function confirmCancelCard() {
  dialog.open({
    title: "✂ Cut up your card?",
    html: "Your tapes go back on the shelf and the card is gone from this TV. You can sign up again any time.",
    buttons: [
      {
        label: "Keep my card",
        action: function (d) {
          d.close();
        },
      },
      {
        label: "Cut it up",
        action: function (d) {
          ejectTape();
          lib = cancelCard(lib, Date.now());
          saveLib();
          d.close();
          V.toast("✂ Card cut up. Come back any time.", 3500);
        },
      },
    ],
  });
}

// A tape's box, with what you can do with it.
function openTape(film, focusLabel) {
  const now = Date.now();
  const loan = loanFor(lib, film.key);
  const buttons = [];
  let note = "";
  if (loan) {
    buttons.push({
      label: isRewound(loan) ? "▶ Play" : "▶ Play from " + fmtDuration(loan.pos),
      action: function (d) {
        d.close();
        playTape(film.key);
      },
    });
    if (!isRewound(loan)) {
      buttons.push({
        label: "◀◀ Rewind",
        action: function (d) {
          d.close();
          rewindTape(film.key, function () {
            openTape(film, "⏏ Return");
          });
        },
      });
    }
    buttons.push({
      label: "⏏ Return",
      action: function (d) {
        const r = returnTapeNow(film.key);
        if (r.error) d.status(r.text);
        else d.close();
      },
    });
  } else if (!lib.card) {
    note = "On the shelf · a free library card checks it out";
    buttons.push({
      label: "📇 Get a library card",
      action: function (d) {
        d.close();
        openSignup(
          0,
          {
            label: "📼 Back to " + shortTitle(film.item.t),
            go: function () {
              openTape(film);
            },
          },
          false
        );
      },
    });
  } else if (lib.loans.length >= MAX_TAPES) {
    note = "You have " + MAX_TAPES + " tapes out. Rewind and return one to make room.";
    buttons.push({
      label: "📼 Your tapes",
      action: function (d) {
        d.close();
        openClub();
      },
    });
  } else {
    note = "On the shelf · " + LOAN_HOURS / 24 + "-day rental";
    buttons.push({
      label: "⏏ Check out & play",
      action: function (d) {
        const r = checkOut(lib, film, Date.now());
        if (r.error) {
          d.status(r.text);
          return;
        }
        lib = r.lib;
        saveLib();
        d.close();
        playTape(film.key);
        V.toast("📼 Checked out " + film.item.t + " · due back " + dueDay(r.loan.due), 5000);
      },
    });
  }
  buttons.push({
    label: "Close",
    action: function (d) {
      d.close();
    },
  });
  dialog.open({ title: "📼 Video Club", html: Club.tapeBoxHtml(film, loan, app.about[film.item.id], now, note), buttons: buttons });
  if (focusLabel) {
    for (let i = 0; i < buttons.length; i++) {
      if (buttons[i].label === focusLabel) {
        dialog.focus = i;
        dialog.paint();
      }
    }
  }
}

// Put a tape you have out in the VCR: it plays from where you stopped it, off the schedule.
function playTape(key) {
  const loan = loanFor(lib, key);
  const film = findFilm(key);
  if (!loan || !film) return;
  if (app.tape && app.tape !== key) ejectTape(); // the other tape comes out first, keeping its place
  closeOverlays();
  let ch = film.ch;
  if (!ch || isLinkChannel(ch)) ch = isLinkChannel(current()) ? visibleChannels()[0] : current();
  if (ch && ch !== current()) tuneTo(ch, { quiet: true });
  const at = loan.pos >= loan.d - 30 ? 0 : loan.pos;
  if (player.playFromStart(film.item, at)) {
    app.tape = key;
    app.tapePos = at;
    app.tapeDur = 0;
    app.tapeSavedAt = Date.now();
    showBanner(5000);
    V.toast("📼 Now playing your tape: " + film.item.t + (at > 2 ? " · from " + fmtDuration(at) : ""), 4000);
  }
}

// The tape leaves the VCR (back to the schedule): remember where it stopped.
function ejectTape() {
  if (!app.tape) return;
  const key = app.tape;
  app.tape = "";
  const loan = loanFor(lib, key);
  if (loan) {
    const end = app.tapeDur > 0 ? app.tapeDur : loan.d;
    let pos = app.tapePos || loan.pos;
    const atEnd = pos >= end - Math.min(20, end * 0.02);
    if (atEnd) pos = loan.d;
    lib = setPosition(lib, key, pos);
    saveLib();
    if (atEnd) V.toast("📼 That's the end of the tape. Rewind it and return it: Menu ▸ 📼 Video Club", 6000);
  }
  app.tapePos = 0;
}

// Twice a second: follow the tape in the VCR, and send overdue tapes back.
function clubTick(now) {
  if (app.tape) {
    const sl = player.slot;
    const playing = sl && sl.onDemand && programKey(sl.item) === app.tape && player.mode !== "off" && player.mode !== "gap" && player.mode !== "empty";
    if (playing) {
      if (player.mode === "playing" || player.mode === "paused") {
        const t = player.v.currentTime;
        if (isFinite(t) && t > 0) app.tapePos = t;
        const dur = player.v.duration;
        if (isFinite(dur) && dur > 0) app.tapeDur = dur;
      }
      if (now - app.tapeSavedAt > 5000 && app.tapePos > 0) {
        app.tapeSavedAt = now;
        lib = setPosition(lib, app.tape, app.tapePos);
        saveLib();
      }
    } else ejectTape();
  }
  if (now - (app.dueCheckedAt || 0) > 30000) {
    app.dueCheckedAt = now;
    const late = overdue(lib, now).filter(function (l) {
      return l.key !== app.tape; // the one playing goes back when it's over
    });
    late.forEach(function (l) {
      lib = returnTape(lib, l.key, now, true).lib;
      V.toast("📼 " + l.t + " was due back, so it went back on the shelf. No late fees. Be kind, rewind!", 6000);
    });
    const lateBooks = overdueBooks(lib, now).filter(function (b) {
      return !(reader.isOpen && reader.book && reader.book.id === b.id); // the one being read goes back after
    });
    lateBooks.forEach(function (b) {
      lib = returnBook(lib, b.id, now, true).lib;
      V.toast("📚 " + b.t + " was due back, so it went back on the shelf. Your bookmark is kept.", 6000);
    });
    if (late.length || lateBooks.length) saveLib();
  }
}

// ◀◀: the reels spin backwards and the counter runs down to 0:00:00. done() runs after.
function rewindTape(key, done) {
  const loan = loanFor(lib, key);
  if (!loan) return;
  if (app.tape === key) {
    ejectTape();
    player.goLive();
  }
  closeOverlays();
  const from = loanFor(lib, key).pos;
  const ms = Math.round(Math.min(3600, 900 + (from / loan.d) * 2700));
  const el = $("rewind");
  el.innerHTML = Club.rewindHtml(loan.t, from);
  el.hidden = false;
  Club.whirr(ms);
  const clock = function () {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  };
  const t0 = clock();
  clearInterval(app.rewindTimer);
  app.rewindTimer = setInterval(function () {
    const k = Math.min(1, (clock() - t0) / ms);
    const c = el.querySelector(".rw-counter");
    if (c) c.textContent = Club.counter(from * (1 - k));
    if (k < 1) return;
    clearInterval(app.rewindTimer);
    lib = rewind(lib, key);
    saveLib();
    setTimeout(function () {
      el.hidden = true;
      el.innerHTML = "";
      if (done) done();
    }, 450);
  }, 50);
}

function returnTapeNow(key) {
  const loan = loanFor(lib, key);
  const r = returnTape(lib, key, Date.now(), false);
  if (r.error) return r;
  if (app.tape === key) {
    ejectTape();
    player.goLive();
  }
  lib = r.lib;
  saveLib();
  V.toast("⏏ Returned " + (loan ? loan.t : "the tape") + ". Thanks for rewinding!", 4000);
  return r;
}

// ---------- the Reading Room: books, comics, manga and magazines ----------
let shelvesDef = null;
function bookShelves() {
  if (!shelvesDef) {
    shelvesDef = fetch("data/books.json", { credentials: "omit" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(parseShelves)
      .catch(function () {
        shelvesDef = null;
        return [];
      });
  }
  return shelvesDef;
}

// A shelf's books, a page of search results at a time: { books, page, loading, error, done }.
const shelfState = {};
function loadShelf(shelf) {
  const st = shelfState[shelf.id] || (shelfState[shelf.id] = { books: [], page: 0, loading: false, error: "", done: false });
  if (st.loading || st.done) return st;
  st.loading = true;
  st.error = "";
  browserFetchJson(bookSearchUrl(shelf.q, 48, st.page + 1))
    .then(function (json) {
      const have = {};
      st.books.forEach(function (b) {
        have[b.id] = 1;
      });
      const got = parseBookSearch(json);
      st.page++;
      st.books = st.books.concat(
        got.filter(function (b) {
          return !have[b.id];
        })
      );
      st.done = got.length < 48;
    })
    .catch(function () {
      st.error = "Couldn't reach the Archive's catalog.";
    })
    .then(function () {
      st.loading = false;
      if (menu.isOpen) menu.render();
    });
  return st;
}

const bookCache = {};
function bookMeta(id) {
  if (!bookCache[id]) {
    bookCache[id] = browserFetchJson(metadataUrl(id))
      .then(function (m) {
        if (!m || !m.metadata) throw new Error("no such item");
        return bookFromMetadata(m);
      })
      .catch(function (e) {
        delete bookCache[id];
        throw e;
      });
  }
  return bookCache[id];
}

const pageCache = {};
function loadPages(book, v) {
  const vol = book.volumes[v];
  if (!vol) return Promise.resolve(null);
  const key = book.id + "/" + vol.stem;
  if (!pageCache[key]) {
    // The page-number file, or for books scanned before those existed, the scan's own page list.
    pageCache[key] = browserFetchJson(pageNumbersUrl(book.id, vol.stem))
      .then(parsePageNumbers)
      .then(function (info) {
        if (info.count > 0) return info;
        throw new Error("no pages listed");
      })
      .catch(function () {
        return fetch(scandataUrl(book.id, vol.stem), { credentials: "omit" })
          .then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.text();
          })
          .then(parseScandata);
      })
      .then(function (info) {
        if (!info || !(info.count > 0)) throw new Error("no pages listed");
        return info;
      })
      .catch(function () {
        delete pageCache[key];
        return null;
      });
  }
  return pageCache[key];
}

function openStacks() {
  hideBanner();
  guide.close();
  if (!menu.isOpen) menu.open(rootPage());
  menu.push(stacksPage());
  updateBug();
}

function stacksPage() {
  bookShelves().then(function () {
    if (menu.isOpen) menu.render();
  });
  return {
    title: "📚 Reading Room",
    sub: function () {
      return lib.card
        ? lib.card.name + " · " + (lib.books || []).length + " of " + MAX_BOOKS + " books out · " + BOOK_DAYS + "-day loans"
        : "Books, comics, manga and magazines from the Internet Archive. Your library card works here.";
    },
    items: function () {
      const now = Date.now();
      const list = [];
      if (!lib.card) {
        list.push({
          label: "📇 Get a library card",
          sub: true,
          ok: function () {
            openSignup(0, null, false);
          },
        });
      } else {
        list.push({
          label: "📇 My library card",
          sub: true,
          value: lib.card.number,
          ok: function () {
            showMyCard(false, null);
          },
        });
      }
      const mine = lib.books || [];
      list.push({ head: true, label: "Your books · " + mine.length + " of " + MAX_BOOKS });
      if (!mine.length) list.push({ head: true, label: lib.card ? "None out. Pick one off a shelf below." : "Get a card, then pick one off a shelf." });
      mine.forEach(function (b) {
        const m = markFor(lib, b.id);
        list.push({
          label: "📖 " + b.t,
          sub: true,
          value: function () {
            return (m ? "p. " + (m.p + 1) + " · " : "") + Stacks.dueSlipText(b, now);
          },
          ok: function () {
            openBookBox({ id: b.id, t: b.t, by: b.by, y: b.y });
          },
        });
      });
      list.push({ head: true, label: "Shelves" });
      list.push({
        label: "🔎 Search the stacks",
        sub: true,
        ok: function () {
          openBookSearch();
        },
      });
      list.push({
        label: "🔗 Open an archive.org link",
        sub: true,
        ok: function () {
          openBookLink();
        },
      });
      (shelvesCacheList || []).forEach(function (sh) {
        list.push({
          label: sh.icon + " " + sh.name,
          sub: true,
          ok: function () {
            menu.push(bookShelfPage(sh));
          },
        });
      });
      list.push({
        label: "📜 Library rules & the fine print",
        sub: true,
        ok: function () {
          openSignup(0, null, true);
        },
      });
      return list;
    },
  };
}
let shelvesCacheList = null;
bookShelves().then(function (list) {
  shelvesCacheList = list;
});

function bookShelfPage(shelf) {
  loadShelf(shelf);
  return {
    title: shelf.icon + " " + shelf.name,
    sub: function () {
      const st = shelfState[shelf.id];
      return st && st.books.length ? st.books.length + " on the shelf · OK to look at one" : "From the Internet Archive";
    },
    items: function () {
      const st = shelfState[shelf.id] || { books: [] };
      const list = st.books.map(function (b) {
        return {
          label: b.t,
          value: function () {
            return (bookLoan(lib, b.id) ? "📚 YOURS · " : "") + (b.y ? String(b.y) : "");
          },
          ok: function () {
            openBookBox(b);
          },
        };
      });
      if (st.loading) list.push({ head: true, label: "Fetching the shelf from the Archive…" });
      else if (st.error) {
        list.push({
          label: "⚠ " + st.error + " Try again",
          ok: function () {
            loadShelf(shelf);
          },
        });
      } else if (!st.done) {
        list.push({
          label: "More from this shelf…",
          ok: function () {
            loadShelf(shelf);
          },
        });
      } else if (!st.books.length) list.push({ head: true, label: "Nothing on this shelf right now." });
      return list;
    },
  };
}

function openBookSearch() {
  dialog.open({
    title: "🔎 Search the stacks",
    html: "A title, an author or a subject, like <b>sherlock</b>, <b>jules verne</b>, <b>astounding</b> or <b>popular mechanics</b>.",
    input: { placeholder: "What would you like to read?" },
    buttons: [
      {
        label: "Search",
        action: function (d) {
          const text = d.value().replace(/[():"]/g, " ").replace(/\s+/g, " ").trim();
          if (text.length < 2) {
            d.status("Type a word or two first.");
            return;
          }
          d.close();
          const shelf = { id: "search:" + text.toLowerCase(), name: text, icon: "🔎", q: "(" + text + ")" };
          if (!menu.isOpen) menu.open(rootPage());
          menu.push(bookShelfPage(shelf));
        },
      },
      {
        label: "Cancel",
        action: function (d) {
          d.close();
        },
      },
    ],
  });
}

function openBookLink() {
  dialog.open({
    title: "🔗 Open an archive.org link",
    html: "The address of a book, comic or magazine on archive.org, like <b>archive.org/details/alicesadventures00carr</b>.",
    input: { placeholder: "archive.org/details/…" },
    buttons: [
      {
        label: "Open",
        action: function (d) {
          const link = archiveLinkQuery(d.value());
          const id = link && /^\(identifier:/.test(link.q) ? link.id : /^[\w.-]{3,}$/.test(d.value()) ? d.value() : "";
          if (!id) {
            d.status("That doesn't look like an archive.org page. Try archive.org/details/…");
            return;
          }
          openBookBox({ id: id, t: id });
        },
      },
      {
        label: "Cancel",
        action: function (d) {
          d.close();
        },
      },
    ],
  });
}

// A book's box: cover and details (fetched from the Archive), and what you can do with it.
function openBookBox(entry) {
  const token = ++app.boxToken;
  const show = function (book, err) {
    if (token !== app.boxToken) return;
    const now = Date.now();
    const loan = bookLoan(lib, entry.id);
    const mark = markFor(lib, entry.id);
    const buttons = [];
    let note = err || "";
    if (book && book.restricted) note = "The Archive only lends this one: borrow it on archive.org with a free account.";
    else if (book && !book.volumes.length) note = "No pages to turn in this one (it's text or audio only). It's on archive.org.";
    else if (book && loan) {
      buttons.push({
        label: mark ? "📖 Read · page " + (mark.p + 1) : "📖 Read",
        action: function (d) {
          d.close();
          readBook(book);
        },
      });
      buttons.push({
        label: "⏏ Return",
        action: function (d) {
          returnBookNow(book.id);
          d.close();
        },
      });
    } else if (book && !lib.card) {
      note = "On the shelf · a free library card borrows it";
      buttons.push({
        label: "📇 Get a library card",
        action: function (d) {
          d.close();
          openSignup(
            0,
            {
              label: "📚 Back to " + shortTitle(book.title),
              go: function () {
                openBookBox(entry);
              },
            },
            false
          );
        },
      });
    } else if (book && (lib.books || []).length >= MAX_BOOKS) {
      note = "You have " + MAX_BOOKS + " books out. Return one to make room.";
      buttons.push({
        label: "📚 Your books",
        action: function (d) {
          d.close();
          openStacks();
        },
      });
    } else if (book) {
      note = "On the shelf · " + BOOK_DAYS + "-day loan";
      buttons.push({
        label: "📖 Borrow & read",
        action: function (d) {
          const r = borrowBook(lib, { id: book.id, t: book.title, by: book.by, y: book.y }, Date.now());
          if (r.error) {
            d.status(r.text);
            return;
          }
          lib = r.lib;
          saveLib();
          d.close();
          readBook(book);
          V.toast("📚 Borrowed " + book.title + " · stamped due " + Stacks.stampDate(r.loan.due), 5000);
        },
      });
    }
    buttons.push({
      label: "Close",
      action: function (d) {
        d.close();
      },
    });
    dialog.open({
      title: "📚 Reading Room",
      html: Stacks.bookBoxHtml(entry, book, book ? loan : null, mark, now, note),
      buttons: buttons,
      onClose: function () {
        if (app.boxToken === token) app.boxToken++;
      },
    });
    if (book && (book.restricted || !book.volumes.length)) drawDonateQr();
  };
  show(null);
  bookMeta(entry.id).then(
    function (book) {
      show(book);
    },
    function () {
      show(null, "Couldn't reach the Archive for this one. Try again in a moment.");
    }
  );
}

// Open a borrowed book. A TV channel stops while you read (a radio station keeps playing).
function readBook(book) {
  closeOverlays();
  hideBanner();
  const ch = current();
  if (app.state === "on" && player.mode !== "off" && !(ch && ch.kind === "audio")) {
    player.off();
    app.readStopped = true;
  }
  reader.open(book, markFor(lib, book.id), { mode: s.readMode, paper: s.readPaper });
  updateBug();
}

function returnBookNow(id) {
  const b = bookLoan(lib, id);
  const r = returnBook(lib, id, Date.now(), false);
  if (r.error) return r;
  if (reader.isOpen && reader.book && reader.book.id === id) reader.close();
  lib = r.lib;
  saveLib();
  V.toast("📚 Returned " + (b ? b.t : "the book") + ". Your bookmark is kept if you borrow it again.", 4500);
  return r;
}

// ---------- playback problems ----------
// Each program that wouldn't play and why, newest first, kept across restarts: Menu ▸ Playback problems
// answers "which channels didn't work, and why?" on the TV it happened on.
function keptProblems(list) {
  return Array.isArray(list)
    ? list
        .filter(function (p) {
          return p && typeof p.at === "number" && typeof p.text === "string" && Date.now() - p.at < 7 * 86400000;
        })
        .slice(0, PROBLEMS_KEPT)
    : [];
}
function onProblem(item, info) {
  const ch = current();
  app.problems.unshift({ at: Date.now(), ch: ch ? chLabel(ch) + " " + ch.name : "", t: item ? item.t : "", text: info.text, kind: info.kind });
  if (app.problems.length > PROBLEMS_KEPT) app.problems.length = PROBLEMS_KEPT;
  save("problems", app.problems);
  // One program that can't play here: say so briefly, so a skip doesn't look like a broken TV.
  if (info.kind === "item" && app.state === "on" && !overlayOpen() && Date.now() - app.skipToastAt > 10000) {
    app.skipToastAt = Date.now();
    V.toast("⚠ Skipped a program that won't play here: " + info.short, 3500);
  }
}
function problemsValue() {
  return app.problems.length ? app.problems.length + " lately" : "None";
}
function showProblems() {
  const day = 86400000;
  const rows = app.problems.slice(0, 12).map(function (p) {
    const when = new Date(p.at);
    const stamp = (Date.now() - p.at > day ? when.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " : "") + fmtClock(when, s.clock24);
    return "<b>" + esc(stamp) + "</b><span><i>CH " + esc(p.ch) + "</i> · " + esc(p.t || "?") + "<br>" + esc(p.text) + "</span>";
  });
  dialog.open({
    title: "Playback problems",
    html: rows.length
      ? '<div class="problems">' +
        rows.join("") +
        "</div><p class=\"dialog-note\">A program that won't play is skipped on this TV for a day. YouTube channels are checked for the US every day; elsewhere, some videos may be blocked.</p>"
      : "<p>Every program has played fine on this TV lately.</p>",
    buttons: [
      {
        label: "Close",
        action: function (d) {
          d.close();
        },
      },
    ].concat(
      rows.length
        ? [
            {
              label: "Clear list",
              action: function (d) {
                app.problems = [];
                save("problems", app.problems);
                d.close();
                V.toast("Problem list cleared");
              },
            },
          ]
        : []
    ),
  });
}

function showRadio(ch) {
  if (!ch || ch.kind !== "audio" || app.state !== "on") {
    hideRadio();
    return;
  }
  const item = player.slot ? player.slot.item : null;
  const key = ch.slug + "|" + (item ? programKey(item) : "");
  if (radio.getAttribute("data-key") !== key) {
    radio.innerHTML = V.radioHtml(ch, item);
    radio.setAttribute("data-key", key);
  }
  radio.hidden = false;
}
function hideRadio() {
  radio.hidden = true;
  radio.removeAttribute("data-key");
  radio.innerHTML = "";
}

// ---------- subtitles ----------
const CC_OPTIONS = [
  ["off", "Off"],
  ["en", "English"],
  ["es", "Español"],
  ["any", "Any language"],
];
function captionPrefs(ch) {
  // The Subtítulos channel shows Spanish subtitles by itself, unless you've chosen otherwise.
  if (s.cc === "off" && ch && ch.preferSubtitles) return { on: true, lang: ch.preferSubtitles, strict: true };
  return { on: s.cc !== "off", lang: s.cc, strict: false };
}
function applyCaptions() {
  const p = captionPrefs(current());
  player.setCaptions(p.on, p.lang, p.strict);
}
function ccValue() {
  for (let i = 0; i < CC_OPTIONS.length; i++) if (CC_OPTIONS[i][0] === s.cc) return CC_OPTIONS[i][1];
  return "Off";
}
function cycleCc(d) {
  let i = 0;
  for (let k = 0; k < CC_OPTIONS.length; k++) if (CC_OPTIONS[k][0] === s.cc) i = k;
  s.cc = CC_OPTIONS[(i + d + CC_OPTIONS.length) % CC_OPTIONS.length][0];
  saveSettings();
  applyCaptions();
  const item = player.slot ? player.slot.item : null;
  if (s.cc !== "off" && item && !item.cc) V.toast("No subtitles on this program; they'll show when there are some", 3500);
}

// ---------- favorites, sleep, surf ----------
function toggleFav(ch) {
  if (!ch) return;
  if (app.favs.has(ch.slug)) {
    app.favs.delete(ch.slug);
    V.toast("Removed CH " + chLabel(ch) + " from favorites");
  } else {
    app.favs.add(ch.slug);
    app.hidden.delete(ch.slug);
    V.toast("★ CH " + chLabel(ch) + " " + ch.name + " is a favorite");
  }
  saveLists();
}
function sleepValue() {
  if (!app.sleepAt) return "Off";
  return Math.max(1, Math.ceil((app.sleepAt - Date.now()) / 60000)) + " min left";
}
function cycleSleep(d) {
  // ▶ goes to the next longer step, ◀ to the next shorter one; Off sits at both ends.
  const left = app.sleepAt ? (app.sleepAt - Date.now()) / 60000 : 0;
  let next;
  if (d > 0) {
    next = SLEEP_STEPS.filter(function (m) {
      return m > left + 0.5;
    })[0];
    if (next == null) next = 0;
  } else if (!app.sleepAt) {
    next = SLEEP_STEPS[SLEEP_STEPS.length - 1];
  } else {
    const lower = SLEEP_STEPS.filter(function (m) {
      return m < left - 0.5;
    });
    next = lower.length ? lower[lower.length - 1] : 0;
  }
  app.sleepAt = next ? Date.now() + next * 60000 : 0;
  app.sleepWarned = false;
  V.toast(next ? "Sleep timer: " + next + " minutes" : "Sleep timer off");
}
function toggleSurf() {
  s.surf = s.surf === "favs" ? "all" : "favs";
  if (s.surf === "favs" && !app.favs.size) V.toast("Add a favorite first: ★ in the menu, or the red button", 3500);
  saveSettings();
}

function saveSettings() {
  save("settings", s);
}
function saveLists() {
  save("favs", Array.from(app.favs));
  save("hidden", Array.from(app.hidden));
  link.channelsChanged();
}

// ---------- look ----------
// The filter on screen: the viewer's, or the station's own while it's on (666's red ASCII, 111's stained glass).
function lookId() {
  return app.stationLook || s.look;
}
// The filter and mix on screen now, as one key ("vhs", "pop-red+pop-blue"): what Filter quality's
// automatic light versions remember.
function lookKey() {
  const look = lookById(lookId());
  const mix = lookById(s.mix);
  return look.id + (mixable(mix) && mix.id !== look.id ? "+" + mix.id : "");
}
// Light version (Menu ▸ Filter quality): SVG looks run on a small copy of the picture, and on YouTube
// as CSS only; ASCII uses fewer characters. "auto" picks it for a filter that slowed this TV down.
function lookIsLite() {
  if (s.lookQuality === "light") return true;
  if (s.lookQuality === "full") return false;
  return !!(s.liteLooks && s.liteLooks[lookKey()]);
}

function applyLook() {
  const look = lookById(lookId());
  const mix = lookById(s.mix);
  const mixOn = mixable(mix) && mix.id !== look.id;
  const lite = look.id !== "off" && lookIsLite();
  const join = function (a, b) {
    return [a, b]
      .filter(function (x) {
        return !!x;
      })
      .join(" ");
  };
  // On the picture (Archive programs). Canvas looks draw their own picture, with the mix on top.
  const full = look.canvas ? "" : comboCss(look, mixOn ? mix : null);
  const svgFull = /url\(/.test(full);
  // The light version of an SVG look draws on a small canvas instead: nothing filters the full screen.
  const screenCss = lite && svgFull ? "" : full;
  // On YouTube's player: CSS filter functions only, unless the backdrop layer can run the SVG ones.
  const ytCss = join(lookYtCss(look), mixOn ? lookYtCss(mix) : "");
  const svg = /url\(/.test(screenCss);
  const keep = tv.className
    .split(/\s+/)
    .filter(function (c) {
      return c && !/^(crt|fit|lookfx)-/.test(c) && c !== "look-on" && c !== "look-ascii" && c !== "look-svg";
    })
    .join(" ");
  tv.className =
    keep +
    " crt-" +
    s.crt +
    " fit-" +
    s.fit +
    (screenCss || ytCss ? " look-on" : "") +
    (look.ytMask ? " look-ascii" : "") +
    (svg ? " look-svg" : "") +
    (look.overlay ? " lookfx-" + look.overlay : "") +
    (look.ytOverlay ? " lookfx-" + look.ytOverlay : "");
  if (screenCss || ytCss) {
    tv.style.setProperty("--look", screenCss || "none");
    tv.style.setProperty("--look-yt", ytCss || "none");
  } else {
    tv.style.removeProperty("--look");
    tv.style.removeProperty("--look-yt");
  }
  if (look.ytMask) {
    const m = asciiMask(tv.clientHeight || window.innerHeight);
    tv.style.setProperty("--look-mask", m.url);
    tv.style.setProperty("--look-mask-size", m.size);
  }
  if (svgFull || look.canvas) installLooks();
  if (look.canvas) canvasLook.set(look, s.fit, mixOn ? lookCss(mix) : "", lite);
  else if (lite && svgFull) canvasLook.set({ id: "lite-" + lookKey(), canvas: "filter", filter: full }, s.fit, "", true);
  else canvasLook.set(null);
  app.lookHeavy = svgFull || !!look.canvas;
  frameWatch.watch("");
  ambience.set(s.ambience);
  fx.sound = s.staticFx === "sound";
  updateBug();
  if (!banner.hidden) renderBanner();
}

// Called twice a second: watch while a heavy filter is on a playing picture, and nothing else is going on.
function watchFrames() {
  const on = app.lookHeavy && s.lookQuality === "auto" && !lookIsLite() && app.state === "on" && !app.suspended && !document.hidden && player.mode === "playing" && !overlayOpen();
  frameWatch.watch(on ? lookKey() : "");
}

// The SVG filters live in the page once; their pixel and ASCII cells follow the screen's height.
let looksHeight = 0;
function installLooks() {
  const h = Math.round(tv.clientHeight || window.innerHeight || 720);
  if (Math.abs(h - looksHeight) < 40 && document.getElementById("looks")) return;
  looksHeight = h;
  let holder = document.getElementById("looks");
  if (!holder) {
    holder = document.createElement("div");
    holder.id = "looks";
    document.body.appendChild(holder);
  }
  holder.innerHTML = looksSvg({ height: h });
}
window.addEventListener("resize", function () {
  if (lookById(lookId()).svg) installLooks();
});

function setLook(id, quiet) {
  if (app.stationLook) {
    // Picked on a station with its own look: the viewer's choice wins there until they tune away.
    const ch = current();
    app.stationLook = "";
    app.lookPickedOn = ch ? ch.slug : "";
  }
  s.look = lookById(id).id;
  saveSettings();
  applyLook();
  if (!quiet) V.toast("🎨 Filter: " + lookById(s.look).name, 2500);
}

function setMix(id, quiet) {
  const m = lookById(id);
  s.mix = mixable(m) ? m.id : "off";
  saveSettings();
  applyLook();
  if (!quiet) V.toast("🎨 Mixed with: " + (s.mix === "off" ? "nothing" : m.name), 2500);
}

// The color looks that can go on top of the filter, and Off.
function mixList() {
  return LOOKS.filter(function (l) {
    return l.id === "off" || mixable(l);
  });
}

function stepMix(dir) {
  const list = mixList();
  let i = 0;
  list.forEach(function (l, k) {
    if (l.id === s.mix) i = k;
  });
  setMix(list[(i + dir + list.length) % list.length].id, true);
}

function mixPage() {
  return {
    title: "Mix with",
    sub: "A second, color filter on top of the first · ASCII + Vaporwave, Game Boy + Hard noir…",
    items: function () {
      const list = [];
      let group = "";
      mixList().forEach(function (look) {
        if (look.group !== group) {
          group = look.group;
          list.push({ head: true, label: group });
        }
        list.push({
          label: look.name,
          value: function () {
            return s.mix === look.id ? "✓ On" : "";
          },
          ok: function () {
            setMix(look.id, true);
          },
        });
      });
      return list;
    },
  };
}

function looksPage() {
  return {
    title: "Picture filter",
    sub: "Shows right away · works on every channel",
    items: function () {
      const list = [];
      let group = "";
      LOOKS.forEach(function (look) {
        if (look.group !== group) {
          group = look.group;
          list.push({ head: true, label: group });
        }
        list.push({
          label: look.name,
          value: function () {
            return lookId() === look.id ? "✓ On" : "";
          },
          ok: function () {
            setLook(look.id, true);
          },
        });
      });
      return list;
    },
  };
}

function updateBug() {
  const ch = current();
  const show = !!(s.bug && ch && app.state === "on" && (player.mode === "playing" || player.mode === "paused") && banner.hidden && !overlayOpen() && ch.kind !== "audio");
  bug.hidden = !show;
  if (show) {
    const text = bugText(ch, (ch.icon ? ch.icon + " " : "") + chLabel(ch));
    if (bug.textContent !== text) bug.textContent = text;
  }
}

// ---------- banner ----------
function hints() {
  return [
    ["▲▼", "Channel"],
    ["◀", "Guide"],
    ["▶", "Menu"],
    ["OK", "Info"],
    ["▶❚❚", player.mode === "paused" ? "Resume" : "Pause"],
  ];
}
function renderBanner() {
  const ch = current();
  if (!ch) return;
  const slot = player.slot || slotAt(timelineFor(ch), Date.now());
  const item = slot ? slot.item : null;
  const p = captionPrefs(ch);
  const pick = p.on && item ? pickSubtitle(item.cc, p.lang, p.strict) : null;
  banner.innerHTML = V.bannerHtml({
    ch: ch,
    slot: slot,
    pos: player.position(),
    mode: player.mode,
    shifted: player.shifted,
    fav: app.favs.has(ch.slug),
    cc: !!pick,
    ccLabel: subtitleLabel(pick),
    sleepLeft: app.sleepAt ? app.sleepAt - Date.now() : 0,
    desc: item ? app.about[item.id] : "",
    clock24: s.clock24,
    clockText: stationClock(app.station, s.clock24),
    hints: hints(),
  });
}
function showBanner(ms) {
  if (app.state !== "on" || !current()) return;
  app.bannerUntil = ms ? Date.now() + ms : Infinity;
  renderBanner();
  banner.hidden = false;
  updateBug();
}
function hideBanner() {
  app.bannerUntil = 0;
  banner.hidden = true;
  updateBug();
}

// ---------- overlays ----------
function overlayOpen() {
  return dialog.isOpen || menu.isOpen || guide.isOpen || numpad.isOpen || reader.isOpen;
}
function closeOverlays() {
  numpad.close();
  dialog.close();
  menu.close();
  guide.close();
}
function openGuide() {
  hideBanner();
  menu.close();
  const list = visibleChannels();
  guide.open(Math.max(0, list.indexOf(current())));
  updateBug();
}
function openMenu() {
  hideBanner();
  guide.close();
  menu.open(rootPage());
  updateBug();
}

function cycler(label, key, options, after) {
  const idx = function () {
    for (let i = 0; i < options.length; i++) if (options[i][0] === s[key]) return i;
    return 0;
  };
  const step = function (d) {
    return function () {
      s[key] = options[(idx() + d + options.length) % options.length][0];
      saveSettings();
      if (after) after();
    };
  };
  return {
    label: label,
    value: function () {
      return options[idx()][1];
    },
    cycle: true,
    left: step(-1),
    right: step(1),
    ok: step(1),
  };
}

function rootPage() {
  return {
    title: function () {
      const ch = current();
      return "CH " + chLabel(ch) + " · " + ch.name;
    },
    sub: function () {
      const it = player.slot ? player.slot.item : null;
      return it ? it.t + (it.y && it.t.indexOf(String(it.y)) < 0 ? " (" + it.y + ")" : "") : current().tagline;
    },
    items: function () {
      const ch = current();
      const it = player.slot ? player.slot.item : null;
      const watching = player.mode === "playing" || player.mode === "paused";
      const list = [{ head: true, label: "Watching" }];
      if (player.shifted)
        list.push({
          label: "Back to live",
          ok: function () {
            player.goLive();
            V.toast("Back to live");
            return "close";
          },
        });
      if (watching)
        list.push({
          label: player.mode === "paused" ? "Resume" : "Pause",
          ok: function () {
            togglePause("playpause");
            return "close";
          },
        });
      if (it && watching && !it.live)
        list.push({
          label: "Start this program over",
          ok: function () {
            if (player.restart()) V.toast("From the top: " + it.t);
            return "close";
          },
        });
      const fav = function () {
        toggleFav(ch);
      };
      list.push({
        label: "Favorite channel",
        value: function () {
          return app.favs.has(ch.slug) ? "★ Yes" : "No";
        },
        cycle: true,
        ok: fav,
        left: fav,
        right: fav,
      });
      const prev = app.channels[app.last];
      if (prev)
        list.push({
          label: "Previous channel",
          value: "CH " + chLabel(prev),
          ok: function () {
            tuneTo(prev);
            return "close";
          },
        });
      list.push({
        label: "Subtitles",
        value: ccValue,
        cycle: true,
        left: function () {
          cycleCc(-1);
        },
        right: function () {
          cycleCc(1);
        },
        ok: function () {
          cycleCc(1);
        },
      });
      list.push({
        label: "Sleep timer",
        value: sleepValue,
        cycle: true,
        left: function () {
          cycleSleep(-1);
        },
        right: function () {
          cycleSleep(1);
        },
        ok: function () {
          cycleSleep(1);
        },
      });
      list.push({
        label: "📱 Phone remote",
        value: phoneValue,
        ok: function () {
          openPairing();
          return "close";
        },
      });
      list.push({ head: true, label: "Channels" });
      list.push({
        label: "🔢 Number pad",
        ok: function () {
          openNumpad();
          return "close";
        },
      });
      list.push({
        label: "🔎 Find a show",
        sub: true,
        ok: function () {
          openFind("");
          return "close";
        },
      });
      list.push({
        label: "📼 Video Club",
        sub: true,
        value: function () {
          return lib.card ? lib.loans.length + " of " + MAX_TAPES + " tapes out" : "Get a library card";
        },
        ok: function () {
          menu.push(clubPage());
        },
      });
      list.push({
        label: "📚 Reading Room",
        sub: true,
        value: function () {
          return lib.card ? (lib.books || []).length + " of " + MAX_BOOKS + " books out" : "Books, comics & manga";
        },
        ok: function () {
          menu.push(stacksPage());
        },
      });
      list.push({
        label: "Channel lineup",
        sub: true,
        value: function () {
          return visibleChannels().length + " on";
        },
        ok: function () {
          menu.push(channelsPage());
        },
      });
      list.push({
        label: "Add a channel",
        sub: true,
        ok: function () {
          menu.push(addPage());
        },
      });
      list.push({
        label: "Load a channel pack",
        sub: true,
        ok: function () {
          menu.push(packPage());
        },
      });
      list.push({
        label: "📰 What's new",
        sub: true,
        value: "v" + VERSION,
        ok: function () {
          showWhatsNew(true);
          return "close";
        },
      });
      list.push({
        label: "📜 Disclaimer & donate",
        sub: true,
        ok: function () {
          showArchiveAbout();
          return "close";
        },
      });
      list.push({
        label: "Region-locked videos",
        value: function () {
          if (s.region === "off") return "Shown";
          const name = app.country ? countryName(app.country) : "";
          return "Hidden" + (name ? " · " + (name.length > 15 ? app.country : name) : "");
        },
        cycle: true,
        ok: toggleRegion,
        left: toggleRegion,
        right: toggleRegion,
      });
      list.push({
        label: "Surf with ▲▼",
        value: function () {
          return s.surf === "favs" ? "★ Favorites" : "All channels";
        },
        cycle: true,
        ok: toggleSurf,
        left: toggleSurf,
        right: toggleSurf,
      });
      list.push({ head: true, label: "Picture & sound" });
      list.push(
        cycler(
          "Picture",
          "fit",
          [
            ["contain", "Fit"],
            ["cover", "Fill"],
            ["fill", "Stretch"],
          ],
          applyLook
        )
      );
      list.push(
        cycler(
          "CRT effect",
          "crt",
          [
            ["off", "Off"],
            ["light", "Light"],
            ["heavy", "Heavy"],
          ],
          applyLook
        )
      );
      list.push({
        label: "🎨 Filter",
        sub: true,
        value: function () {
          return lookById(lookId()).name;
        },
        left: function () {
          setLook(nextLook(lookId(), -1).id, true);
        },
        right: function () {
          setLook(nextLook(lookId(), 1).id, true);
        },
        ok: function () {
          menu.push(looksPage());
        },
      });
      list.push({
        label: "🎨 Mix with",
        sub: true,
        value: function () {
          return s.mix === "off" ? "Nothing" : lookById(s.mix).name;
        },
        left: function () {
          stepMix(-1);
        },
        right: function () {
          stepMix(1);
        },
        ok: function () {
          menu.push(mixPage());
        },
      });
      list.push(
        cycler(
          "🎨 Filter quality",
          "lookQuality",
          [
            ["auto", "Auto"],
            ["full", "Full"],
            ["light", "Light"],
          ],
          function () {
            // Back to Auto: measure again from scratch (this TV may cope better than it did).
            if (s.lookQuality === "auto") s.liteLooks = {};
            saveSettings();
            applyLook();
          }
        )
      );
      list.push(cycler("🎧 Ambience", "ambience", AMBIENCES, applyLook));
      list.push(
        cycler(
          "Channel static",
          "staticFx",
          [
            ["sound", "With hiss"],
            ["silent", "Silent"],
            ["off", "Off"],
          ],
          applyLook
        )
      );
      list.push(
        cycler(
          "Channel logo",
          "bug",
          [
            [true, "On"],
            [false, "Off"],
          ],
          applyLook
        )
      );
      list.push(
        cycler(
          "Clock",
          "clock24",
          [
            [false, "12-hour"],
            [true, "24-hour"],
          ],
          applyLook
        )
      );
      list.push({ head: true, label: "Help" });
      list.push({
        label: "Remote buttons",
        ok: function () {
          showHelp();
          return "close";
        },
      });
      list.push({
        label: "⚠ Playback problems",
        value: problemsValue,
        ok: function () {
          showProblems();
          return "close";
        },
      });
      list.push({
        label: "About " + NAME,
        ok: function () {
          showAbout();
          return "close";
        },
      });
      return list;
    },
  };
}

function channelsPage() {
  return {
    title: "Channel lineup",
    sub: "◀▶ on each channel: Shown, ★ Favorite or Hidden",
    items: function () {
      const out = [];
      app.channels.forEach(function (ch) {
        const states = ["on", "fav", "off"];
        const names = { on: "Shown", fav: "★ Favorite", off: "Hidden" };
        const cur = function () {
          return app.hidden.has(ch.slug) ? "off" : app.favs.has(ch.slug) ? "fav" : "on";
        };
        const step = function (d) {
          return function () {
            const next = states[(states.indexOf(cur()) + d + states.length) % states.length];
            if (next === "off" && visibleChannels().length <= 1) {
              V.toast("Keep at least one channel on");
              return;
            }
            app.hidden.delete(ch.slug);
            app.favs.delete(ch.slug);
            if (next === "off") app.hidden.add(ch.slug);
            if (next === "fav") app.favs.add(ch.slug);
            saveLists();
          };
        };
        out.push({
          label: chLabel(ch) + "  " + ch.name,
          swatch: ch.color,
          cycle: true,
          value: function () {
            return names[cur()];
          },
          left: step(-1),
          right: step(1),
          ok: step(1),
        });
        if (ch.custom)
          out.push({
            label: "      Remove " + ch.name,
            ok: function () {
              removeCustom(ch);
            },
          });
      });
      return out;
    },
  };
}

function addPage() {
  return {
    title: "Add a channel",
    sub: "Built live from the Internet Archive",
    items: function () {
      const list = [
        {
          label: "🔍  Search the Archive…",
          ok: function () {
            openSearch();
            return "close";
          },
        },
        { head: true, label: "Quick add" },
      ];
      (app.lineup.extras || []).forEach(function (def) {
        const have = app.channels.filter(function (c) {
          return c.slug === "x-" + def.slug;
        })[0];
        list.push({
          label: (def.icon ? def.icon + "  " : "") + def.name,
          swatch: def.color,
          value: have ? "✓ CH " + chLabel(have) : def.kind === "audio" ? "Radio" : "TV",
          ok: function () {
            if (have) tuneTo(have);
            else buildCustom(Object.assign({}, def, { slug: "x-" + def.slug }));
            return "close";
          },
        });
      });
      return list;
    },
  };
}

// ---------- channels you add ----------
function nextNumber() {
  const used = {};
  app.channels.forEach(function (c) {
    used[c.number] = 1;
  });
  for (let n = CUSTOM_FROM; n < 100; n++) if (!used[n]) return n;
  return 99;
}

function saveCustom() {
  link.channelsChanged();
  const list = app.channels.filter(function (c) {
    return c.custom;
  });
  return save("custom", list);
}

function removeCustom(ch) {
  const wasCurrent = ch === current();
  const i = app.channels.indexOf(ch);
  if (i < 0) return;
  const cur = current();
  app.channels.splice(i, 1);
  app.idx = app.channels.indexOf(cur);
  app.last = -1;
  delete app.timelines[ch.slug];
  app.favs.delete(ch.slug);
  app.hidden.delete(ch.slug);
  saveLists();
  saveCustom();
  V.toast("Removed CH " + chLabel(ch) + " " + ch.name);
  if (wasCurrent || app.idx < 0) {
    app.idx = 0;
    menu.close();
    tuneTo(app.channels[0]);
  }
}

function titleCase(t) {
  return t.replace(/\b([a-z])/g, function (m) {
    return m.toUpperCase();
  });
}

function searchDef(text, kind) {
  // A pasted archive.org link builds from that item or collection.
  const link = archiveLinkQuery(text);
  const label = link ? link.id.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() : text;
  const q = link ? link.q : /[:()"]/.test(text) ? text : "(" + text + ")";
  return {
    slug: "u-" + slugify(label) + "-" + Date.now().toString(36),
    name: titleCase(label).slice(0, 24),
    tagline: link ? "From archive.org: " + link.id : "Your search: " + text,
    icon: kind === "audio" ? "📻" : "📡",
    kind: kind,
    minMinutes: kind === "audio" ? 5 : 2,
    maxMinutes: 240,
    maxItems: 50,
    filesPerItem: 8,
    sources: [{ q: q + " AND mediatype:" + (kind === "audio" ? "audio" : "movies"), rows: 50 }],
  };
}

function openSearch() {
  const go = function (kind) {
    return function (d) {
      const text = d.value();
      if (tuneTypedNumber(text)) return;
      if (text.length < 2) {
        d.status("Type a few words first, like: hopalong cassidy");
        return;
      }
      buildCustom(searchDef(text, kind));
    };
  };
  dialog.open({
    title: "Search the Internet Archive",
    html:
      "Type what you'd like a channel of: a show, a star, a genre, a decade. " +
      "For example <b>lone ranger</b>, <b>john wayne</b>, <b>kung fu</b>, <b>jazz</b> or <b>the shadow</b>. " +
      "Archive search terms like <b>collection:prelinger</b> work too, and so does a link to an archive.org page.",
    input: { placeholder: "What should be on?" },
    buttons: [
      { label: "Make a TV channel", action: go("video") },
      { label: "Make a radio channel", action: go("audio") },
      {
        label: "Cancel",
        action: function (d) {
          d.close();
        },
      },
    ],
  });
}

// The Archive context every channel build shares: the lineup's filters and year cap.
function channelCtx(onProgress) {
  const L = app.lineup;
  return {
    fetchJson: browserFetchJson,
    exclude: L.exclude,
    excludeDescription: L.excludeDescription,
    excludeFiles: L.excludeFiles,
    maxYear: L.maxYear,
    concurrency: 4,
    progress: onProgress || function () {},
  };
}

function fetchChannelPrograms(def, onProgress) {
  return buildChannel(def, channelCtx(onProgress));
}

// First free number in the viewer-added range (30–49); past that, the first free number anywhere.
function nextPackNumber() {
  const used = {};
  app.channels.forEach(function (c) {
    used[c.number] = 1;
  });
  for (let n = PACK_MIN_NUMBER; n <= PACK_MAX_NUMBER; n++) if (!used[n]) return n;
  return nextNumber();
}

// A built channel (def + build result) onto the dial. opts.number pins the number
// (a pack channel); without it, the next free number is used. Returns { ch, renumbered }
// or { skipped } when a channel with that slug is already on this TV. Does not save:
// the caller calls saveCustom once it is done adding.
function addBuiltChannel(def, res, opts) {
  const o = opts || {};
  const existing = app.channels.filter(function (c) {
    return c.slug === def.slug;
  })[0];
  // A pack channel loaded twice is skipped; a search made twice is simply another channel.
  if (existing && o.number != null) return { skipped: "CH " + chLabel(existing) + " " + existing.name + " is already on this TV" };
  const taken = function (slug) {
    return app.channels.some(function (c) {
      return c.slug === slug;
    });
  };
  let slug = def.slug;
  for (let k = 2; taken(slug); k++) slug = def.slug + "-" + k;
  let number;
  let renumbered = false;
  if (o.number == null) {
    number = nextNumber();
  } else if (
    o.number >= PACK_MIN_NUMBER &&
    o.number <= PACK_MAX_NUMBER &&
    !app.channels.some(function (c) {
      return c.number === o.number;
    })
  ) {
    number = o.number;
  } else {
    number = nextPackNumber();
    renumbered = true;
  }
  const ch = {
    slug: slug,
    number: number,
    name: def.name,
    tagline: def.tagline || "Your channel",
    icon: def.icon || "📡",
    color: def.color || SWATCHES[hash32(def.slug) % SWATCHES.length],
    kind: def.kind === "audio" ? "audio" : "video",
    items: res.items,
    about: res.about,
    custom: true,
    built: new Date().toISOString(),
  };
  Object.assign(app.about, res.about);
  app.channels.push(ch);
  sortChannels();
  return { ch: ch, renumbered: renumbered };
}

function buildCustom(def) {
  let cancelled = false;
  dialog.open({
    title: "Building " + def.name,
    html: "Asking the Internet Archive for programs. This takes a few seconds.",
    onClose: function () {
      cancelled = true;
    },
    buttons: [
      {
        label: "Cancel",
        action: function (d) {
          cancelled = true;
          d.close();
        },
      },
    ],
  });
  dialog.status("Searching…");
  fetchChannelPrograms(def, function (n, total) {
    if (!cancelled) dialog.status("Checking " + n + " of " + total + " items…");
  })
    .then(function (res) {
      if (cancelled) return;
      if (!res.items.length) {
        dialog.status("Nothing playable turned up. Try other words.");
        return;
      }
      const added = addBuiltChannel(def, res, {});
      if (added.skipped) {
        dialog.status(added.skipped);
        return;
      }
      const ch = added.ch;
      const saved = saveCustom();
      cancelled = true; // done: closing the dialog now is not a cancel
      dialog.close();
      tuneTo(ch);
      V.toast("CH " + chLabel(ch) + " " + ch.name + " is on the air" + (saved ? "" : " (couldn't save it on this TV)"), 4000);
    })
    .catch(function (err) {
      if (!cancelled) dialog.status("Couldn't reach the Archive (" + err.message + "). Try again in a moment.");
    });
}

function drawDonateQr() {
  loadScript("vendor/qrcode.js")
    .then(function () {
      const box = document.querySelector("#dialog .link-qr");
      if (box) box.innerHTML = qrSvg(box.getAttribute("data-url"));
    })
    .catch(function () {
      /* the address is in the text */
    });
}

// A first start gets a welcome; an update, what's changed since the version last seen. force: from the
// menu, every version's changes.
function showWhatsNew(force) {
  const seen = load("seenVersion", "");
  const w = force ? { kind: "update", entries: CHANGES } : whatsNew(seen, VERSION, HAD_USED);
  if (!w.kind) return false;
  const welcome = w.kind === "welcome";
  const buttons = [
    {
      label: welcome ? "▶ Start watching" : "Got it",
      action: function (d) {
        d.close();
      },
    },
  ];
  if (welcome) {
    buttons.push({
      label: "📰 What's new",
      action: function (d) {
        d.close();
        showWhatsNew(true);
      },
    });
  }
  dialog.open({
    title: welcome ? "📺 Welcome to NostalGem" : "✨ What's new in NostalGem",
    html: '<div class="wn-head">Version ' + esc(VERSION) + (native.app ? " · TV app " + esc(native.app) : "") + "</div>" + (welcome ? WELCOME_HTML : changesHtml(w.entries)),
    buttons: buttons,
    onClose: function () {
      save("seenVersion", VERSION);
    },
  });
  return true;
}

function showArchiveAbout() {
  dialog.open({
    title: "Disclaimer & donate",
    html: '<div class="donate-qr"><div class="link-qr" data-url="https://archive.org/donate"></div>Scan to donate</div>' + archiveAboutHtml(),
    buttons: [
      {
        label: "Close",
        action: function (d) {
          d.close();
        },
      },
    ],
  });
  drawDonateQr();
}

// ---------- channel packs ----------
function packPage() {
  return {
    title: "Load a channel pack",
    sub: "Archive-only packs · saved on this TV",
    items: function () {
      return [
        { head: true, label: "From a file" },
        {
          label: "Choose a .json file…",
          ok: function () {
            pickPackFile();
            return "close";
          },
        },
        { head: true, label: "Or paste it" },
        {
          label: "Paste pack JSON…",
          ok: function () {
            openPackPaste();
            return "close";
          },
        },
        { head: true, label: "About packs" },
        {
          label: "How channel packs work",
          ok: function () {
            showPackHelp();
            return "close";
          },
        },
      ];
    },
  };
}

function showPackHelp() {
  dialog.open({
    title: "How channel packs work",
    html:
      "A channel pack is a small JSON file that adds channels from the <b>Internet Archive</b> — " +
      "a collection search, or Archive item IDs. Nothing else: no YouTube, no other sites, no direct video links.<br><br>" +
      "Pack channels land on <b>CH 30–49</b> and are saved on this TV only, like channels you add by search. " +
      "Loading a pack never changes the shipped lineup.<br><br>" +
      "The format is in <b>PACKS.md</b>, with an example pack in <b>packs/example-pack.json</b>. " +
      "On a TV with no file picker, use Paste pack JSON instead. " +
      "Channels you load are your choice on your own TV.",
    buttons: [
      {
        label: "Got it",
        action: function (d) {
          d.close();
        },
      },
    ],
  });
}

function showPackErrors(label, errors) {
  dialog.open({
    title: "That pack won't load",
    html:
      "<b>" +
      esc(label) +
      "</b> has a problem:<br>" +
      errors
        .slice(0, 8)
        .map(esc)
        .join("<br>") +
      (errors.length > 8 ? "<br>…and " + (errors.length - 8) + " more." : ""),
    buttons: [
      {
        label: "OK",
        action: function (d) {
          d.close();
        },
      },
    ],
  });
}

function pickPackFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.addEventListener("change", function () {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      handlePackText(String(reader.result || ""), file.name);
    };
    reader.onerror = function () {
      dialog.open({
        title: "Load a channel pack",
        html: "Couldn't read that file.",
        buttons: [
          {
            label: "OK",
            action: function (d) {
              d.close();
            },
          },
        ],
      });
    };
    reader.readAsText(file);
  });
  input.click();
}

function openPackPaste() {
  dialog.open({
    title: "Paste pack JSON",
    html:
      "Paste the pack file's text. Packs only point at the Internet Archive — a collection search or " +
      "Archive item IDs — and their channels land on CH 30–49 on this TV.",
    textarea: { placeholder: '{"pack": "Example pack", "version": 1, "channels": [...]}', rows: 8 },
    buttons: [
      {
        label: "Check this pack",
        action: function (d) {
          handlePackText(d.value(), "pasted pack");
        },
      },
      {
        label: "Cancel",
        action: function (d) {
          d.close();
        },
      },
    ],
  });
}

function handlePackText(text, label) {
  const parsed = parsePack(text);
  if (!parsed.ok) return showPackErrors(label, parsed.errors);
  const v = validatePack(parsed.pack);
  if (!v.ok) return showPackErrors(label, v.errors);
  const pack = parsed.pack;
  let html =
    "<b>" +
    esc(pack.pack) +
    "</b> — " +
    pack.channels.length +
    " channel" +
    (pack.channels.length > 1 ? "s" : "") +
    ":<br>" +
    pack.channels
      .map(function (ch) {
        return "CH " + ch.number + " · " + ch.name + (ch.kind === "audio" ? " (radio)" : "");
      })
      .map(esc)
      .join("<br>");
  if (v.warnings.length) {
    html += "<br><br>Heads up:<br>" + v.warnings.map(esc).join("<br>");
  }
  html += "<br><br>Channels you load are saved on this TV only. They never change the shipped lineup.";
  dialog.open({
    title: "Load this pack?",
    html: html,
    buttons: [
      {
        label: "Load pack",
        action: function (d) {
          d.close();
          loadPack(pack);
        },
      },
      {
        label: "Cancel",
        action: function (d) {
          d.close();
        },
      },
    ],
  });
}

function loadPack(pack) {
  let cancelled = false;
  const done = [];
  const notes = [];
  dialog.open({
    title: "Loading " + pack.pack,
    html: "Asking the Internet Archive for programs. This takes a few seconds per channel.",
    onClose: function () {
      cancelled = true;
    },
    buttons: [
      {
        label: "Cancel",
        action: function (d) {
          cancelled = true;
          d.close();
        },
      },
    ],
  });
  let i = 0;
  const finish = function () {
    saveCustom();
    cancelled = true; // done: closing the dialog now is not a cancel
    dialog.close();
    if (!done.length) {
      dialog.open({
        title: "Pack loaded — nothing new",
        html: notes.length ? notes.map(esc).join("<br>") : "No channels were added.",
        buttons: [
          {
            label: "OK",
            action: function (d) {
              d.close();
            },
          },
        ],
      });
      return;
    }
    const first = done[0];
    tuneTo(first);
    let msg = "Pack on the air: " + done.map(function (c) {
      return "CH " + chLabel(c) + " " + c.name;
    }).join(", ");
    if (notes.length) msg += ". " + notes.join("; ");
    V.toast(msg, 6000);
  };
  const step = function () {
    if (cancelled) return;
    if (i >= pack.channels.length) return finish();
    const ch = pack.channels[i];
    i++;
    dialog.status("Building " + ch.name + " (" + i + " of " + pack.channels.length + ")…");
    const def = packChannelDef(pack.pack, ch);
    const job = def.items
      ? buildItemsChannel(def.items, def, channelCtx())
      : fetchChannelPrograms(def, function (n, total) {
          if (!cancelled) dialog.status("Checking " + n + " of " + total + " items for " + ch.name + "…");
        });
    job
      .then(function (res) {
        if (cancelled) return;
        if (!res.items.length) {
          notes.push(ch.name + ": nothing playable turned up");
          return step();
        }
        const added = addBuiltChannel(def, res, { number: ch.number });
        if (added.skipped) {
          notes.push(ch.name + ": " + added.skipped);
          return step();
        }
        if (added.renumbered) {
          notes.push(ch.name + ": CH " + ch.number + " was taken, so it went to CH " + added.ch.number);
        }
        if (res.items.length < 25) {
          notes.push(ch.name + ": only " + res.items.length + " programs — a thin channel");
        }
        const hours = res.items.reduce(function (t, p) {
          return t + p.d;
        }, 0) / 3600;
        if (hours < 5) {
          notes.push(ch.name + ": only about " + hours.toFixed(1) + " hours before it repeats");
        }
        done.push(added.ch);
        step();
      })
      .catch(function (err) {
        if (!cancelled) {
          notes.push(ch.name + ": couldn't reach the Archive (" + err.message + ")");
          step();
        }
      });
  };
  step();
}

// ---------- phone remote ----------
// Menu ▸ Phone remote shows a QR code. The phone opens remote.html#CODE and talks to this TV directly
// (see link.js). The code is kept, so a paired phone reconnects after the TV restarts; "New code"
// locks out every phone paired before.
function phoneCode() {
  let code = cleanCode(load("phoneCode", ""));
  if (!code) {
    code = makeCode();
    save("phoneCode", code);
  }
  return code;
}

const link = new TvLink({
  code: phoneCode(),
  vendorBase: "",
  snapshot: phoneSnapshot,
  channels: phoneChannels,
  onMessage: phoneMessage,
  onStatus: pairStatus,
  onCalling: function (what, why) {
    app.calling = what;
    app.callingWhy = why || "";
    pairStatus();
  },
  lan: function () {
    return native.lan;
  },
  onPhones: function (n) {
    if (n > app.phones) V.toast("📱 Phone remote connected");
    else if (n < app.phones && !n) V.toast("📱 Phone remote disconnected");
    app.phones = n;
    pairStatus();
    if (menu.isOpen) menu.render();
  },
});
V.onToast(function (text) {
  if (link.phones()) link.send({ t: "toast", text: text });
});

function phoneValue() {
  if (!s.phone) return "Off";
  const n = link.phones();
  return n ? n + (n === 1 ? " phone" : " phones") : prettyCode(link.code);
}

function phoneSnapshot() {
  const ch = current();
  const sl = player.slot;
  const it = sl ? sl.item : null;
  const paused = player.mode === "paused";
  let now = null;
  if (it) {
    let start = sl.startMs;
    let pos = -1;
    if (player.shifted) {
      const p = player.position();
      const at = p ? p.at : 0;
      if (paused) {
        start = 0;
        pos = Math.round(at);
      } else start = Math.round((Date.now() - at * 1000) / 2000) * 2000;
    }
    now = { t: it.t, y: it.y || 0, d: it.d, start: start, pos: pos };
  }
  let dlg = null;
  if (dialog.isOpen && dialog.spec && !app.pairOpen) {
    const st = document.querySelector("#dialog .d-status");
    dlg = { title: dialog.spec.title, status: st ? st.textContent : "" };
  }
  return {
    app: app.state,
    mode: player.mode,
    paused: paused,
    shifted: player.shifted,
    muted: player.muted,
    cc: ccValue(),
    fav: ch ? app.favs.has(ch.slug) : false,
    ch: ch ? { slug: ch.slug, number: ch.number, label: chLabel(ch), name: ch.name, icon: ch.icon || "", color: ch.color || "", kind: ch.kind || "video", tagline: ch.tagline || "" } : null,
    now: now,
    next: sl && sl.next ? sl.next.t : "",
    overlay: dialog.isOpen ? "dialog" : menu.isOpen ? "menu" : guide.isOpen ? "guide" : "",
    dialog: dlg,
  };
}

function phoneChannels() {
  const now = Date.now();
  return visibleChannels().map(function (ch) {
    const sl = slotAt(timelineFor(ch), now);
    return {
      slug: ch.slug,
      number: ch.number,
      label: chLabel(ch),
      name: ch.name,
      icon: ch.icon || "",
      color: ch.color || "",
      kind: ch.kind || "video",
      fav: app.favs.has(ch.slug),
      now: sl ? sl.item.t : "",
    };
  });
}

// A phone's tap wakes the TV the way a button press does.
function phoneWake() {
  app.lastInput = Date.now();
  if (app.stillShownAt) {
    app.stillShownAt = 0;
    restoreCard();
  }
  if (app.state === "off") {
    app.state = "on";
    V.hideCard();
  }
}

function phoneMessage(m) {
  if (app.state === "boot") return;
  if (m.t === "key") {
    if (m.type === "back") back();
    else handleAction({ type: m.type, digit: m.digit });
  } else if (m.t === "tune") {
    const ch = app.channels.filter(function (c) {
      return c.slug === m.slug;
    })[0];
    if (!ch) return;
    phoneWake();
    closeOverlays();
    tuneTo(ch);
  } else if (m.t === "search") {
    phoneWake();
    closeOverlays();
    if (!tuneTypedNumber(m.text)) buildCustom(searchDef(m.text, m.kind));
  } else if (m.t === "find") {
    phoneWake();
    closeOverlays();
    if (!tuneTypedNumber(m.text)) showFound(m.text);
  }
}

function pairStatus() {
  if (!app.pairOpen) return;
  const n = link.phones();
  const words = {
    off: "Phone remote is off",
    starting: "Getting a line to the pairing service…",
    ready: n ? "📱 " + n + (n === 1 ? " phone" : " phones") + " connected" : "Ready. Waiting for your phone…",
    retrying: "Can't reach the pairing service. Trying again…",
    taken: "That code is busy. Choose New code.",
    unsupported: "This TV's browser can't do phone remotes. Try the NostalGem app or a newer browser.",
  };
  let text = words[link.status] || "";
  if (link.status === "ready" && app.calling === "calling") text = "📱 A phone is calling… linking up";
  else if (link.status === "ready" && app.calling === "failed")
    text =
      "📱 A phone called, but the two couldn't reach each other. " +
      (ANDROID ? "Guest Wi-Fi, VPNs and “AP isolation” on a router block it." : "On the same Wi-Fi, the NostalGem TV app links more reliably than a browser.") +
      (app.callingWhy ? " (" + app.callingWhy + ")" : "");
  // Which ways in are open, so a phone that won't link can be compared against it.
  if (link.status !== "off" && link.status !== "unsupported") text += "  ·  This TV: " + pathsText(link.paths());
  dialog.status(text);
}

function drawPairing() {
  const url = remoteUrl(link.code, window.location, params.get("remote"));
  const box = document.querySelector("#dialog .pair-qr");
  const code = document.querySelector("#dialog .pair-code");
  if (code) code.textContent = prettyCode(link.code);
  loadScript("vendor/qrcode.js")
    .then(function () {
      if (app.pairOpen && box) box.innerHTML = qrSvg(url);
    })
    .catch(function () {
      if (box) box.textContent = "No QR code; type the address instead.";
    });
}

function openPairing() {
  if (!s.phone) {
    s.phone = true;
    saveSettings();
  }
  link.start();
  const url = remoteUrl(link.code, window.location, params.get("remote"));
  const shown = url.replace(/^https?:\/\//, "").replace(/\.html#.*$/, "").replace(/#.*$/, "");
  dialog.open({
    title: "Phone remote",
    html:
      '<div class="pair"><div class="pair-qr"></div><div class="pair-info">' +
      "Point your phone's camera at the code to use it as the remote: buttons, a channel list and a keyboard for searching." +
      '<div class="pair-or">or open <b>' +
      esc(shown) +
      "</b> and enter</div>" +
      '<div class="pair-code"></div>' +
      '<div class="pair-note">Nothing to install. Easiest with the phone on the same Wi-Fi as the TV.</div>' +
      "</div></div>",
    buttons: [
      {
        label: "Done",
        action: function (d) {
          d.close();
        },
      },
      {
        label: "New code",
        action: function () {
          link.newCode(makeCode());
          save("phoneCode", link.code);
          drawPairing();
          V.toast("New code. Phones paired before are disconnected.");
        },
      },
      {
        label: "Turn off",
        action: function (d) {
          s.phone = false;
          saveSettings();
          link.stop();
          d.close();
          V.toast("Phone remote off");
        },
      },
    ],
    onClose: function () {
      app.pairOpen = false;
    },
  });
  app.pairOpen = true;
  drawPairing();
  pairStatus();
}

// ---------- help & about ----------
function showHelp() {
  const rows = [
    ["▲ ▼  CH+ CH−", "Change channel", "↑ ↓ PgUp PgDn"],
    ["0 – 9", "Go to a channel number (no number buttons? Menu ▸ 🔢 Number pad)", "0 – 9"],
    ["OK", "What's on now", "Enter"],
    ["◀", "TV guide", "← or G"],
    ["▶", "Menu: subtitles, sleep timer, picture, channels", "→ or O"],
    ["▶❚❚", "Pause and resume", "Space or K"],
    ["Back", "Close, or back up a step", "Esc"],
    ["Red", "★ Favorite this channel", "F"],
    ["Green", "Subtitles", "C"],
    ["Yellow", "Previous channel", "P"],
    ["Blue", "TV guide", "G"],
    ["", "Back to live after pausing", "L"],
    ["", "Sound on / off", "M"],
    ["🎨", "Next picture filter (a controller's Y button too)", "V"],
    ["📱", "Use your phone as the remote: Menu ▸ Phone remote", ""],
  ];
  dialog.open({
    title: "Remote buttons",
    html:
      '<div class="keys">' +
      rows
        .map(function (r) {
          return "<b>" + esc(r[0]) + "</b><span>" + esc(r[1]) + "</span><span>" + esc(r[2]) + "</span>";
        })
        .join("") +
      "</div>",
    buttons: [
      {
        label: "Got it",
        action: function (d) {
          d.close();
        },
      },
    ],
  });
}

function showAbout() {
  const L = app.lineup;
  let programs = 0;
  let hours = 0;
  app.channels.forEach(function (c) {
    programs += c.items.length;
    c.items.forEach(function (p) {
      hours += p.d / 3600;
    });
  });
  const built = L.built ? new Date(L.built).toLocaleDateString() : "";
  dialog.open({
    title: NAME,
    html:
      "<b>" +
      app.channels.length +
      " channels</b>, " +
      programs.toLocaleString() +
      " programs, about " +
      Math.round(hours).toLocaleString() +
      " hours before anything repeats. " +
      "Every channel is a 24/7 schedule set by the clock, so every TV tuned in sees the same thing at the same time.<br><br>" +
      "All programming streams from the <b>Internet Archive</b> (archive.org), a non-profit library. " +
      "Most of it is in the public domain or openly licensed. If you enjoy it, consider donating at <b>archive.org/donate</b>. " +
      "Channels 50 and up air official uploads from the studios' own <b>YouTube</b> channels, in YouTube's player." +
      (app.country && app.country !== "US" ? " What YouTube doesn't allow in " + esc(countryName(app.country)) + " is left out of the schedule." : "") +
      "<br><br>" +
      "A program that won't play is skipped on this TV for a day. Lineup built " +
      esc(built) +
      (app.lineupSource === "web" ? " (fresh from the web)" : app.lineupSource === "saved" ? " (saved copy; offline)" : "") +
      ". Version " +
      VERSION +
      (native.app ? " (TV app " + esc(native.app) + (ON_PAGES ? "" : ", offline copy") + ")" : "") +
      ".",
    buttons: [
      {
        label: "Close",
        action: function (d) {
          d.close();
        },
      },
    ],
  });
}

// ---------- sleep and "still watching?" ----------
function signOff() {
  app.sleepAt = 0;
  closeOverlays();
  hideBanner();
  app.state = "off";
  V.showCard("signoff", V.signoffCard());
  player.fadeOut(8000);
  updateBug();
}

function wake() {
  app.state = "on";
  app.stillShownAt = 0;
  V.hideCard();
  if (current()) tuneTo(current());
}

// The TV app can open a link-out station's site right on the TV (newer versions say so).
function canOpenHere() {
  return ANDROID && native.can.indexOf("open") >= 0;
}

// A link-out station's card, with a QR code so a phone can open the site too.
function showLinkCard(ch) {
  V.showCard(linkCardName(ch), V.linkCard(ch, ANDROID, canOpenHere()));
  loadScript("vendor/qrcode.js")
    .then(function () {
      const box = document.querySelector(".link-qr");
      const url = linkUrl(current());
      if (box && url && box.getAttribute("data-url") === url) box.innerHTML = qrSvg(url);
    })
    .catch(function () {
      /* no QR code: the address is on the card */
    });
}

// OK on a link-out station: a new tab in a browser; in the TV app, the site right on the TV (BACK on the
// remote comes back); in an older TV app that can't, the phone.
function openLinkOut(ch) {
  if (canOpenHere()) {
    V.toast("Opening " + ch.name + "… BACK on the remote comes back here", 4000);
    const url = linkUrl(ch);
    setTimeout(function () {
      window.location.href = url;
    }, 700);
    return;
  }
  if (ANDROID) {
    V.toast("Scan the code with your phone, or update the NostalGem TV app to open it right here", 6000);
    return;
  }
  if (!openLinkChannel(ch)) V.toast("Scan the code on the screen with your phone to open it there", 5000);
}

function restoreCard() {
  const ch = current();
  if (player.mode === "gap" && player.slot) V.showCard("gap", V.gapCard(ch, player.slot, s.clock24, app.bumpers));
  else if (player.mode === "standby") V.showCard("standby", V.standbyCard(app.standby));
  else if (player.mode === "empty") V.showCard("empty", V.emptyCard(ch, app.emptyWhy));
  else if (player.mode === "adbreak") V.showCard("adbreak", V.adBreakCard(app.adQuip));
  else if (player.mode === "gesture") V.showCard("gesture", V.gestureCard());
  else if (isLinkChannel(ch)) showLinkCard(ch);
  else V.hideCard();
}

// ---------- input ----------
function handleAction(a) {
  app.lastInput = Date.now();
  if (app.introTimer) hideIntro(false);
  ambience.resume();
  if (fx.audio && fx.audio.state === "suspended") {
    try {
      fx.audio.resume();
    } catch (e) {
      /* fine */
    }
  }
  if (app.state === "boot") return;
  if (app.stillShownAt) {
    app.stillShownAt = 0;
    restoreCard();
    return;
  }
  if (app.state === "off") {
    wake();
    return;
  }
  if (reader.isOpen && !dialog.isOpen) {
    reader.handle(a);
    return;
  }
  if (player.mode === "gesture") {
    player.userGesture();
    return;
  }
  if (numpad.isOpen) {
    numpad.handle(a);
    return;
  }
  if (a.type === "back") {
    back();
    return;
  }
  if (dialog.isOpen) {
    dialog.handle(a);
    return;
  }
  if (menu.isOpen) {
    if (a.type === "menu") menu.close();
    else if (!menu.handle(a)) rootAction(a);
    return;
  }
  if (guide.isOpen) {
    if (a.type === "guide" || a.type === "blue") guide.close();
    else if (a.type === "digit") {
      guide.close();
      digit(a.digit);
    } else if (!guide.handle(a)) rootAction(a);
    updateBug();
    return;
  }
  rootAction(a);
}

function rootAction(a) {
  switch (a.type) {
    case "up":
    case "chup":
      surf(1);
      break;
    case "down":
    case "chdown":
      surf(-1);
      break;
    case "left":
    case "guide":
    case "blue":
      openGuide();
      break;
    case "right":
    case "menu":
      openMenu();
      break;
    case "ok":
      if (isLinkChannel(current())) {
        openLinkOut(current());
        break;
      }
      if (app.digits) commitDigits();
      else if (!banner.hidden) hideBanner();
      else showBanner(8000);
      break;
    case "info":
      if (app.digits) commitDigits();
      else if (!banner.hidden) hideBanner();
      else showBanner(8000);
      break;
    case "digit":
      digit(a.digit);
      break;
    case "playpause":
    case "play":
    case "pause":
      togglePause(a.type);
      break;
    case "live":
      if (player.shifted) {
        player.goLive();
        V.toast("Back to live");
      }
      break;
    case "last":
    case "yellow":
      lastChannel();
      break;
    case "fav":
    case "red":
      toggleFav(current());
      if (!banner.hidden) renderBanner();
      break;
    case "cc":
    case "green":
      cycleCc(1);
      V.toast("Subtitles: " + ccValue());
      break;
    case "look":
      setLook(nextLook(lookId(), 1).id);
      break;
    case "mute":
      player.setMuted(!player.muted);
      V.toast(player.muted ? "Sound off" : "Sound on");
      break;
    case "help":
      showHelp();
      break;
    default:
      break;
  }
}

// Returns false when there is nothing left to close (the Android app then exits).
function back() {
  app.lastInput = Date.now();
  if (app.stillShownAt) {
    app.stillShownAt = 0;
    restoreCard();
    return true;
  }
  if (app.state === "off") {
    wake();
    return true;
  }
  if (dialog.isOpen) {
    dialog.close();
    return true;
  }
  if (reader.isOpen) {
    reader.handle({ type: "back" });
    return true;
  }
  if (menu.isOpen) {
    menu.pop();
    return true;
  }
  if (guide.isOpen) {
    guide.close();
    updateBug();
    return true;
  }
  if (app.digits) {
    app.digits = "";
    clearTimeout(app.digitTimer);
    V.osdHide();
    return true;
  }
  if (!banner.hidden) {
    hideBanner();
    return true;
  }
  if (ANDROID) {
    const now = Date.now();
    if (now - app.exitArmedAt < 2500) return false;
    app.exitArmedAt = now;
    V.toast("Press BACK again to exit", 2500);
  }
  return true;
}

document.addEventListener("keydown", function (e) {
  const a = actionFor(e);
  if (!a) return;
  if (isTypingTarget(e.target)) {
    // A text field keeps its own keys; the app takes Escape, Enter and ▲▼.
    const esc = a.type === "back" && e.key !== "Backspace" && e.keyCode !== 8;
    if (!(esc || a.type === "ok" || a.type === "up" || a.type === "down")) return;
  }
  e.preventDefault();
  fromInput("key", a);
});

// On Android TV a controller's D-pad and A button also arrive as key presses, so one press can come in
// twice: once as a key, once from the Gamepad API. The second copy within a moment is dropped.
const lastInputFrom = { key: {}, pad: {} };
function fromInput(source, a) {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  lastInputFrom[source][a.type] = now;
  const other = lastInputFrom[source === "key" ? "pad" : "key"][a.type] || 0;
  if (now - other < 250) return;
  handleAction(a);
}

// ---------- mouse and touch ----------
let pointerTimer = 0;
function pointerActivity() {
  touch.hidden = false;
  tv.classList.add("touch-on");
  tv.classList.remove("hide-cursor");
  syncTouch();
  clearTimeout(pointerTimer);
  const hide = function () {
    // With the guide or a menu open the buttons stay: they're how a finger gets around it.
    if (navOpen()) {
      pointerTimer = setTimeout(hide, 5000);
      return;
    }
    touch.hidden = true;
    tv.classList.remove("touch-on");
    tv.classList.add("hide-cursor");
    syncTouch();
  };
  pointerTimer = setTimeout(hide, 5000);
}
// The guide, a menu, a dialog or the number pad: the dock turns into arrows, OK and BACK.
function navOpen() {
  return (dialog.isOpen || menu.isOpen || guide.isOpen || numpad.isOpen) && !reader.isOpen;
}
// Keeps the dock and the screens under it in step: the guide and menus end above the dock.
function syncTouch() {
  const nav = navOpen();
  touch.classList.toggle("overlay", nav);
  const pad = nav && !touch.hidden;
  if (tv.classList.contains("touch-nav") !== pad) {
    tv.classList.toggle("touch-nav", pad);
    if (guide.isOpen) guide.render();
    if (menu.isOpen) menu.render();
  }
}
// Hold an arrow (or CH) to keep going, like holding a remote's button.
let held = null;
function stopHold() {
  if (!held) return;
  clearTimeout(held.timer);
  clearInterval(held.every);
  held = null;
}
touch.addEventListener("pointerdown", function (e) {
  const b = e.target.closest ? e.target.closest("[data-repeat]") : null;
  if (!b) return;
  e.preventDefault();
  stopHold();
  const t = b.getAttribute("data-act");
  const press = function () {
    pointerActivity();
    handleAction({ type: t });
    syncTouch();
  };
  press();
  held = { timer: 0, every: 0 };
  held.timer = setTimeout(function () {
    if (held) held.every = setInterval(press, 110);
  }, 400);
});
["pointerup", "pointercancel", "blur"].forEach(function (ev) {
  window.addEventListener(ev, stopHold);
});
document.addEventListener("mousemove", pointerActivity);
document.addEventListener("touchstart", pointerActivity, { passive: true });
touch.addEventListener("click", function (e) {
  const b = e.target.closest ? e.target.closest("[data-act]") : null;
  if (!b) return;
  e.stopPropagation();
  if (b.hasAttribute("data-repeat")) return; // pressed on pointerdown
  pointerActivity();
  const t = b.getAttribute("data-act");
  if (t === "back") back();
  else if (t === "numpad") {
    if (numpad.isOpen) numpad.close();
    else openNumpad();
  } else handleAction({ type: t });
  syncTouch();
});
tv.addEventListener("click", function (e) {
  // A click on a menu row or dialog button can remove that element before the click gets here (the menu
  // closes and a dialog opens). It was a click on an overlay, not on the picture: don't press OK again.
  if (!tv.contains(e.target)) return;
  if (e.target.closest && e.target.closest(".touch,.guide,.menu,.dialog,.banner,.numpad,.reader")) return;
  handleAction({ type: "ok" });
});
// Swipe up or down on the picture to change channel. The cards on the picture (the banner, a break's
// countdown, stand-by) redraw every second, which can take away the element under the finger before it
// lifts; a touch's events keep going to that element even then, so the swipe's end is heard there.
tv.addEventListener(
  "touchstart",
  function (e) {
    if (!e.touches || e.touches.length !== 1) return;
    const x0 = e.touches[0].clientX;
    const y0 = e.touches[0].clientY;
    const target = e.target;
    const done = function () {
      target.removeEventListener("touchend", end);
      target.removeEventListener("touchcancel", done);
    };
    const end = function (ev) {
      done();
      const t = ev.changedTouches && ev.changedTouches[0];
      if (!t || overlayOpen()) return;
      const dy = t.clientY - y0;
      if (Math.abs(dy) > 70 && Math.abs(dy) > Math.abs(t.clientX - x0)) surf(dy < 0 ? 1 : -1);
    };
    target.addEventListener("touchend", end, { passive: true });
    target.addEventListener("touchcancel", done, { passive: true });
  },
  { passive: true }
);

// ---------- app lifecycle ----------
function suspend() {
  ambience.sleep();
  if (app.state !== "on" || app.suspended) return;
  app.suspended = true;
  player.off();
}
function resume() {
  ambience.wake();
  askApp();
  if (!app.suspended) return;
  app.suspended = false;
  if (app.state === "on" && current()) tuneTo(current(), { quiet: true });
  refreshLineup();
}

// Back in the app after a while: if the website has a newer lineup, switch to it now, while the viewer
// is just settling in. A late answer is kept for the next start instead of interrupting a program.
function refreshLineup() {
  if (!ANDROID || !app.lineup || Date.now() - app.lineupCheckedAt < LINEUP_RECHECK) return;
  app.lineupCheckedAt = Date.now();
  const asked = Date.now();
  loadLineup({ bundled: "data/lineup.json", live: LIVE_LINEUP })
    .then(function (got) {
      if (!got || builtAt(got.lineup) <= builtAt(app.lineup) || Date.now() - asked > 15000 || app.suspended) return;
      swapLineup(got.lineup, got.source);
    })
    .catch(function () {
      /* keep the lineup we have */
    });
}
window.addEventListener("pagehide", function () {
  ambience.sleep();
});
window.addEventListener("pageshow", function () {
  if (!document.hidden) ambience.wake();
});
document.addEventListener("visibilitychange", function () {
  if (document.hidden) {
    // Radio keeps playing in a background tab; pictures don't (no one's watching them).
    const ch = current();
    if (ANDROID || !ch || ch.kind !== "audio") suspend();
  } else resume();
});

// The Android TV app talks to the page through this.
window.NP = {
  version: VERSION,
  remote: function (type, d) {
    if (type === "back") return back();
    handleAction({ type: type, digit: d });
    return true;
  },
  back: back,
  suspend: suspend,
  resume: resume,
  // Read-only snapshot for tests and debugging.
  state: function () {
    const ch = current();
    const it = player.slot ? player.slot.item : null;
    return {
      app: app.state,
      mode: player.mode,
      shifted: player.shifted,
      channel: ch ? ch.number : 0,
      sub: ch && ch.sub ? ch.sub : 0,
      label: ch ? chLabel(ch) : "",
      name: ch ? ch.name : "",
      program: it ? it.t : "",
      channels: app.channels.length,
      overlay: dialog.isOpen ? "dialog" : menu.isOpen ? "menu" : guide.isOpen ? "guide" : "",
      phone: { on: s.phone, status: link.status, phones: link.phones(), code: link.code, lan: native.lan.length, calling: app.calling, why: app.callingWhy },
      tvApp: native.app,
      lineup: { source: app.lineupSource, built: app.lineup ? app.lineup.built : "" },
      country: app.country,
      ambience: { mode: ambience.mode, on: ambience.active, audio: ambience.ctx ? ambience.ctx.state : "" },
      club: {
        card: lib.card ? lib.card.name : "",
        tape: app.tape,
        loans: lib.loans.map(function (l) {
          return { t: l.t, pos: Math.round(l.pos), rewound: isRewound(l) };
        }),
        returned: lib.history.length,
        books: (lib.books || []).map(function (b) {
          return { id: b.id, t: b.t, mark: markFor(lib, b.id) };
        }),
      },
      reader: reader.state(),
      station: app.station || "",
      intro: !$("intro").hidden,
      look: { id: lookId(), setting: s.look, station: app.stationLook || "", mix: s.mix, key: lookKey(), lite: lookIsLite(), quality: s.lookQuality, watching: frameWatch.key, fps: frameWatch.last },
      sound: player.soundState(),
    };
  },
};

// ---------- clock ----------
function tick() {
  const now = Date.now();
  app.ticks++;
  player.tick();
  ambience.setActive(app.state === "on" && !app.suspended && !player.muted);
  watchFrames();
  clubTick(now);
  syncTouch();
  if (app.pairOpen && app.ticks % 4 === 0) pairStatus(); // relay servers coming and going
  if (app.bannerUntil) {
    if (now > app.bannerUntil && player.mode !== "paused") hideBanner();
    else if (app.ticks % 2 === 0) renderBanner();
  }
  if (player.mode === "gap" && player.slot && !app.stillShownAt) {
    const el = document.querySelector("#card .card-count");
    if (el) el.textContent = fmtDuration(V.gapSecondsLeft(player.slot));
  }
  if (player.mode === "standby" && app.ticks % 2 === 0) V.showCard("standby", V.standbyCard(app.standby));
  if (guide.isOpen && app.ticks % 30 === 0) guide.render();
  if (menu.isOpen && app.ticks % 4 === 0) menu.render();
  if (app.sleepAt && app.state === "on") {
    if (now >= app.sleepAt) signOff();
    else if (app.sleepAt - now < 60000 && !app.sleepWarned) {
      app.sleepWarned = true;
      V.toast("Sleep timer: one minute left", 4000);
    }
  }
  if (app.state === "on" && (player.mode === "playing" || player.mode === "gap")) {
    if (!app.stillShownAt && now - app.lastInput > STILL_AFTER) {
      app.stillShownAt = now;
      closeOverlays();
      hideBanner();
      V.showCard("still", V.stillCard());
    } else if (app.stillShownAt && now - app.stillShownAt > STILL_GRACE) {
      app.stillShownAt = 0;
      app.state = "off";
      player.off();
      V.showCard("tunedout", V.tunedOutCard());
    }
  }
  if (app.ticks % 4 === 0) updateBug();
  link.tick(now);
}

// ---------- lineup ----------
function applyLineup(lineup, source) {
  app.lineup = lineup;
  app.country = tvCountry();
  app.badSet = null;
  app.lineupSource = source || "";
  app.lineupCheckedAt = Date.now();
  app.about = Object.assign({}, lineup.about || {});
  // A channel number typed into Search used to build a channel of whatever the Archive had for "777"
  // (a TV remote with no number buttons). Those channels are mistakes: drop them.
  const keys = {};
  lineup.channels.concat(LINK_CHANNELS, SECRET_STATIONS).forEach(function (c) {
    keys[chKey(c)] = 1;
    keys[String(c.number)] = 1;
  });
  const saved = load("custom", []);
  const customs = saved.filter(function (c) {
    const d = /^u-/.test(c.slug || "") ? numberText(c.name) : "";
    return !(d && keys[d]);
  });
  if (customs.length !== saved.length) save("custom", customs);
  customs.forEach(function (c) {
    Object.assign(app.about, c.about || {});
  });
  app.channels = lineup.channels.concat(
    customs.map(function (c) {
      return Object.assign({}, c, { custom: true });
    })
  );
  app.channels.sort(chOrder);
  // The secret link-out stations (420, 555, 777): tuned by number only, never listed, never scheduled.
  LINK_CHANNELS.forEach(function (c) {
    app.channels.push(c);
  });
  // The secret stations (069, 666): hidden like the link-outs, but they play.
  SECRET_STATIONS.forEach(function (c) {
    app.channels.push(c);
  });
  Object.assign(app.about, SECRET_ABOUT);
  app.timelines = {};
}

// A newer lineup while running: same channel if it still exists, and the remote's lists catch up.
function swapLineup(lineup, source) {
  const cur = current();
  const prev = app.channels[app.last];
  applyLineup(lineup, source);
  const at = function (ch) {
    if (!ch) return -1;
    for (let i = 0; i < app.channels.length; i++) if (app.channels[i].slug === ch.slug) return i;
    return -1;
  };
  app.idx = Math.max(0, at(cur));
  app.last = at(prev);
  link.channelsChanged();
  if (app.state === "on" && !app.suspended && current()) tuneTo(current(), { quiet: true });
}

// ---------- boot ----------
function wait(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}

// The TV app (Android) answers what a web page can't find out: this TV's real Wi-Fi address, so a phone
// on the same Wi-Fi can reach it directly (see link.js), and the app's version. It answers only pages
// from this site.
const native = { lan: [], app: "", can: [] };
function askApp() {
  const bridge = window.NostalGemTV;
  if (!ANDROID || !bridge || typeof bridge.postMessage !== "function") return;
  bridge.onmessage = function (e) {
    let m = null;
    try {
      m = JSON.parse(e.data);
    } catch (x) {
      return;
    }
    if (!m || typeof m !== "object") return;
    if (Array.isArray(m.lan)) native.lan = m.lan.filter(isIPv4).slice(0, 4);
    if (typeof m.app === "string") native.app = m.app.slice(0, 20);
    if (Array.isArray(m.can)) {
      native.can = m.can
        .filter(function (x) {
          return typeof x === "string";
        })
        .slice(0, 10);
      // A link-out card on screen now says it opens right here.
      if (app.state === "on" && isLinkChannel(current())) showLinkCard(current());
    }
  };
  try {
    bridge.postMessage("hello");
  } catch (x) {
    /* an older app */
  }
}

async function boot() {
  const bootVersion = document.querySelector(".boot-version");
  if (bootVersion) bootVersion.textContent = "v" + VERSION;
  askApp();
  registerTvKeys();
  applyLook();
  tv.classList.add("hide-cursor");
  const status = document.querySelector(".boot-status");
  const t0 = Date.now();
  let got = null;
  while (!got) {
    got = await loadLineup({ bundled: "data/lineup.json", live: LIVE_LINEUP });
    if (!got) {
      status.textContent = "NO SIGNAL · RETRYING";
      await wait(5000);
      status.textContent = "TUNING IN…";
    }
  }
  applyLineup(got.lineup, got.source);
  // House bumpers for the station breaks. Loads in the background; a missing
  // file just means plain "up next" cards.
  loadBumpers("data/bumpers.json").then(function (list) {
    app.bumpers = list;
  });
  const asked = (params.get("ch") || "").replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "");
  const lastSlug = load("last", "");
  const start =
    app.channels.filter(function (c) {
      return asked && chKey(c) === asked;
    })[0] ||
    app.channels.filter(function (c) {
      return c.slug === lastSlug;
    })[0] ||
    app.channels[0];

  await wait(Math.max(0, 1300 - (Date.now() - t0)));
  const bootEl = $("boot");
  bootEl.classList.add("gone");
  setTimeout(function () {
    bootEl.hidden = true;
    bootEl.innerHTML = "";
  }, 700);
  app.state = "on";
  tuneTo(start);
  // Once the start-up screen has gone: a welcome, or what's new since last time.
  setTimeout(function () {
    if (app.state === "on" && !overlayOpen()) showWhatsNew(false);
  }, 1500);
  // Any standard controller drives the remote: D-pad to surf, A for OK, B to go back.
  createGamepad(
    function (a) {
      fromInput("pad", a);
    },
    {
      onConnect: function (id) {
        V.toast("Controller connected" + (id ? ": " + id.slice(0, 40) : ""));
      },
    }
  ).start();
  setInterval(tick, 500);
  if (s.phone) link.start();

  if ("serviceWorker" in navigator && window.location.protocol === "https:" && !ANDROID) {
    navigator.serviceWorker.register("sw.js").catch(function () {
      /* works without it */
    });
  }
}

// The boot screen shares the sunset scene.
$("boot").insertAdjacentHTML("afterbegin", V.SCENE);
boot();
