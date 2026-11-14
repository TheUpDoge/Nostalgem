// NostalGem: the set itself. Wires the remote, the tuner, the guide, the menu and the screen together.

import { makeTimeline, slotAt, programKey, nextAiring, foldText } from "./schedule.js";
import { guessCountry, playableIn } from "./regions.js";
import { Player } from "./player.js";
import { Static } from "./static.js";
import { actionFor, isTypingTarget, registerTvKeys } from "./remote.js";
import { load, save } from "./store.js";
import { archiveLinkQuery, buildChannel, browserFetchJson, metadataUrl } from "./archive.js";
import { archiveAboutHtml } from "./about.js";
import { asPack, buildItemsChannel, packChannelDef, packFilesFromZip, packSkipLists, parsePack, validatePack } from "./packs.js";
import { channelForDigits, moreToType, packNumberFor, typedLabel } from "./dial.js";
import { LINK_CHANNELS, isLinkChannel, isGuideVisible, linkCardName, linkUrl, openLinkChannel } from "./linkout.js";
import { createGamepad, samePress } from "./gamepad.js";
import { LOOKS, asciiMask, comboCss, lookById, lookCss, lookYtCss, looksSvg, mixable, nextLook } from "./looks.js";
import { FrameWatch } from "./framewatch.js";
import { MAX_TAPES, LOAN_HOURS, MAX_BOOKS, BOOK_DAYS, cleanLibrary, issueCard, cancelCard, loanFor, checkOut, setPosition, setSafeCut, isRewound, rewind, returnTape, overdue, storeShelves, staffPicks, searchStore, groupAisles, aisleFilms, bookLoan, borrowBook, returnBook, overdueBooks, setMark, markFor } from "./library.js";
import { bookSearchUrl, parseBookSearch, bookFromMetadata, pageNumbersUrl, parsePageNumbers, scandataUrl, parseScandata, parseShelves, parseCatalog, groupStackShelves } from "./books.js";
import { Reader } from "./ui/reader.js";
import * as Stacks from "./ui/stacks.js";
import * as Club from "./ui/club.js";
import { SECRET_STATIONS, SECRET_ABOUT, secretStation, introHtml, introSound, stationQuip, stationClock, bugText } from "./secrets.js";
import { Church } from "./church.js";
import { checkSkipLists, cutsFor, listFor, SKIP_FORMAT } from "./cuts.js";
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
import { PagePointer, appMessage } from "./pointer.js";
import { utf8Text } from "./zip.js";
import { pathsText } from "./relay.js";
import { loadLineup, builtAt } from "./lineup.js";
import { SNOW_FRAMES, createTurnOn, introAudible, playTurnOnSound, prefersStill, showBootSnow, snowBufferSize, snowPixels, turnOnAction, turnOnDuration } from "./intro.js";
import { mountTreasureBoot, playTreasureSound, treasureWanted } from "./boot-treasure.js";
import { loadBumpers } from "./bumpers.js";
import { DEFAULT_CARDS, loadCards, familyAdQuips, familyOf, cardClass } from "./cards.js";
import { crystalChime, stopCrystalChime } from "./crystal-chime.js";
import { pictureReady, loadCardDecision } from "./loadhold.js";
import { parseSent, archivePlan, whyNot, QUEUE_MAX } from "./sendto.js";
import { playlistIds } from "./youtube.js";
import { escapeHtml as esc, slugify, fmtClock, fmtDuration, hash32, chLabel, chKey, chOrder, numberText } from "./util.js";

const VERSION = "1.18.0";
const NAME = "NostalGem";
const params = new URLSearchParams(window.location.search);
const ANDROID = params.get("tv") === "android";
// A TV: the TV app, or a TV's own browser (LG webOS, Samsung Tizen, Sony, Fire TV, Google TV and the like).
const ON_TV = ANDROID || /SMART-TV|SmartTV|Web0S|WebOS|Tizen|NetCast|BRAVIA|HbbTV|\bAFT[A-Z]|GoogleTV|Android TV|CrKey|AppleTV/i.test(navigator.userAgent || "");
// The TV app opens the published site, and falls back to its own copy when it can't reach it. That
// copy's lineup is as old as the app, while the published one is rebuilt daily, so the copy asks for it.
const ON_PAGES = window.location.href.indexOf(PAGES_BASE) === 0;
const LIVE_LINEUP = ANDROID && !ON_PAGES ? PAGES_BASE + "data/lineup.json" : "";
const LINEUP_RECHECK = 3 * 3600 * 1000; // coming back to the app after this long: look for a newer lineup

const DEFAULTS = { shape: "wide", crt: "light", fit: "contain", cc: "off", staticFx: "sound", bug: true, clock24: false, surf: "all", phone: false, region: "auto", look: "off", mix: "off", ambience: "off", lookQuality: "auto", liteLooks: {}, readMode: "auto", readPaper: "day" };
const SLEEP_STEPS = [0, 15, 30, 45, 60, 90, 120];
// Whether this TV had used NostalGem before this start (for a welcome, or "what's new").
const HAD_USED = load("settings", null) != null || load("last", null) != null || load("favs", null) != null;
const STILL_AFTER = 4 * 3600 * 1000; // no button pressed for four hours: ask
const STILL_GRACE = 2 * 60 * 1000; // then switch off two minutes later
const BAD_TTL = 24 * 3600 * 1000; // a file that wouldn't play is skipped for a day
const PROBLEMS_KEPT = 30; // Menu ▸ Playback problems lists this many
const CUSTOM_FROM = 30; // channels you add start at CH 30
const LOAD_CARD_AFTER = 1500; // ms of loading before the channel's own "one moment" card takes over from the snow
// Once that card is up, loadhold.js keeps it until the picture is really playing (at least this long,
// and no longer than LOAD_CARD_HOLD). Claude: the wait lives here and in loadhold.js; player.pictureState is read-only.
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
  away: "", // a link-out station's site the TV app has over NostalGem (its name)
  ptrAt: 0, // when the phone's pointer last moved

  adCount: Math.floor(Math.random() * 1000), // which ad-break quip comes next
  boxToken: 0, // the book box showing now (its details arrive later)
  adQuip: "",
  about: {},
  bumpers: [],
  cards: DEFAULT_CARDS, // the station cards' words, in each channel family's voice (cards.js, data/cards.json)
  loadCardTimer: 0,
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
  sentPlain: false, // a station's own look is set aside while something sent is on
  sent: null, // Send to TV: what a phone sent, while it plays { items, i, conn }
  sentToken: 0, // the latest link sent (an answer about an earlier one is dropped)
};
const s = app.s;
// 4:3 for an old TV, before anything is drawn (see applyShape).
document.documentElement.classList.toggle("shape-43", s.shape === "43");

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
// The TV path gets the strictest limits on the filters (fxcanvas.js TV_LIMITS): what a filter costs a TV's
// slow processor, a computer never notices. Nothing changes on a computer.
// ?perf=asciiCols:64,asciiMs:150 changes them, for measuring (tests, and the profile in the TV performance PR).
canvasLook.setTv(
  ON_TV,
  (params.get("perf") || "").split(",").reduce(function (o, kv) {
    const a = kv.split(":");
    if (a.length === 2 && isFinite(Number(a[1]))) o[a[0]] = Number(a[1]);
    return o;
  }, {})
);
const church = new Church(); // 111's sound

// Clean cuts (cuts.js): the lists that ship (data/skip-lists.json, none yet) and any a pack brought to this
// TV. A list names scenes by time; the player covers them with a card, or skips them on a tape.
const skipLists = { shipped: [], packs: [] };
function allSkipLists() {
  return skipLists.shipped.concat(skipLists.packs);
}
function loadSkipLists() {
  skipLists.packs = checkSkipLists({ format: SKIP_FORMAT, lists: load("skipLists", []) }).lists;
  fetch("data/skip-lists.json", { credentials: "omit" })
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (json) {
      if (!json) return;
      skipLists.shipped = checkSkipLists(json).lists;
      // The boot tunes as soon as the lineup is in, which can be before this file
      // comes back. Apply the list to whatever is already playing.
      if (player.refreshCuts) player.refreshCuts();
    })
    .catch(function () {
      /* none, then */
    });
}
// The film's enabled list, if it has one.
function filmList(item) {
  return listFor(allSkipLists(), item);
}
const numpad = new Numpad($("numpad"), {
  describe: function (typed) {
    const exact = channelForDigits(app.channels, typed, false);
    const longer = moreToType(app.channels, typed);
    const ch = channelForDigits(app.channels, typed, true);
    return {
      text: ch ? "CH " + chLabel(ch) + " · " + ch.name : longer ? "Keep typing…" : "No channel " + typed,
      done: !!exact && !longer,
    };
  },
  label: function (typed) {
    return typedLabel(app.channels, typed, false);
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
  // Clean cuts: a tape (Video Club) plays as it is unless its TV-safe cut is on (then it skips its scenes,
  // or covers them when its list says so); anything else covers them with a card.
  cutsFor: function (slot) {
    const item = slot && slot.item;
    if (!item) return null;
    const tapeKey = app.tapeLoading || app.tape;
    const tape = !!(slot.onDemand && tapeKey && programKey(item) === tapeKey);
    const loan = tape ? loanFor(lib, tapeKey) : null;
    return cutsFor(allSkipLists(), item, tape, !(loan && loan.cut));
  },
  cut: onCut,
  // 111's films echo around the nave. The full reverb needs CORS, which the Archive's video servers don't
  // send; ?reverb=1 tries it anyway (tests, or the day they do).
  corsReverb: params.get("reverb") === "1",
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
  // Send to TV: something sent in parts (or a playlist) plays one after the other.
  demandEnded: sentNext,
  // A sent YouTube video's title and length arrive once it plays.
  learned: function () {
    if (!banner.hidden) renderBanner();
  },
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
  // The turn-on draws its own snow. The surf snow repaints a canvas until it stops;
  // starting that under the ident would be work nobody can see.
  if (!(app.turnOn && app.turnOn.active())) {
    staticBurst(450);
    V.osdChannel(ch);
  }
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

// Number entry (dial.js). Channels are 1–3 digits; a sub-channel adds one or two more after its channel's
// two, so 5 0 1 is CH 50-1 and 0 3 2 is CH 3-2. The TV tunes as soon as no longer number could follow,
// otherwise after a short pause. 5 0 alone, on a channel that only has sub-channels, goes to the first of
// them. Numbers are typed like a cable box: 5 0 waits a beat for a sub-channel, 5 0 1 tunes 50-1, 1 0 waits
// a beat where there's a CH 101, and where there's a 60-10, 6 0 1 waits a beat for the 0. 2 0 2 is CH 20-2
// until a pack owns 202; then it tunes the pack.
function digit(n) {
  app.digits = (app.digits + String(n)).slice(-4);
  const typed = app.digits;
  clearTimeout(app.digitTimer);
  const exact = channelForDigits(app.channels, typed, false);
  const longer = moreToType(app.channels, typed);
  // A leading zero ("069", "01") waits for the rest of the number.
  const zero = typed.charAt(0) === "0" && typed.length < 3;
  if (longer || zero) V.osd("CH " + typedLabel(app.channels, typed, false), "", 2500);
  if (!zero && ((exact && !longer) || typed.length >= 4 || (!exact && !longer))) commitDigits();
  else app.digitTimer = setTimeout(commitDigits, 1600);
}

// A channel number typed into a search box (a remote with no number buttons) tunes that channel instead of
// building a channel out of an Archive search for "777". Returns true when it did.
function tuneTypedNumber(text) {
  const digits = numberText(text);
  const ch = digits ? channelForDigits(app.channels, digits, true) : null;
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
  const ch = channelForDigits(app.channels, typed, true);
  if (ch) {
    closeOverlays();
    tuneTo(ch);
  } else {
    V.osd("CH " + typedLabel(app.channels, typed, true), "NO SIGNAL", 2000);
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
// Clean cuts: the card goes up over a listed scene (the sound cut) and comes down after it; on a tape with
// its TV-safe cut on, a skipped scene gets a flash of snow and a word, so a jump doesn't look like a glitch.
function onCut(info) {
  const el = $("cutcard");
  if (info.skipped) {
    staticBurst(300);
    V.toast("⏭ TV-safe cut: skipped a scene (" + info.skipped + " of " + info.of + ")", 3000);
    return;
  }
  if (info.card) {
    el.innerHTML = V.cutCardHtml(info.text);
    el.hidden = false;
  } else {
    el.hidden = true;
    el.innerHTML = "";
  }
}

// Is what's on now sound only? A radio channel's program, or a recording sent from a phone (whatever the
// channel under it).
function radioNow(ch) {
  const item = player.slot ? player.slot.item : null;
  return item && item.sent ? item.sent === "audio" : !!ch && ch.kind === "audio";
}

// The channel whose look the ad card takes: none while the ad is ahead of something sent from a phone
// (that isn't the channel's show, so it gets the plain card).
function adChannel(ch) {
  const item = player.slot ? player.slot.item : null;
  return item && item.sent ? null : ch;
}
function showAdCard(ch) {
  const own = adChannel(ch);
  V.showCard("adbreak", V.adBreakCard(app.adQuip, own), own ? cardClass(own) : "");
}

// The loading card's extra hold. shown: when it appeared. readyAt: when the picture first qualified.
let loadShown = 0;
let loadReadyAt = 0;
let loadTime = null;
let loadFrame = false;
let loadTimer = 0;

function clearLoadHold() {
  loadShown = 0;
  loadReadyAt = 0;
  loadTime = null;
  loadFrame = false;
  clearTimeout(loadTimer);
  loadTimer = 0;
}

function armLoadFrame() {
  loadFrame = false;
  const v = player.v;
  if (!v || typeof v.requestVideoFrameCallback !== "function") return;
  try {
    v.requestVideoFrameCallback(function () {
      loadFrame = true;
      pokeLoadHold();
    });
  } catch (e) {
    /* the readyState and currentTime checks still apply */
  }
}

function pokeLoadHold() {
  if (!loadShown) return;
  clearTimeout(loadTimer);
  const card = $("card");
  if (!card || card.hidden || card.className.indexOf("card-tuning") < 0) {
    clearLoadHold();
    return;
  }
  const snap = player.pictureState ? player.pictureState() : { playing: player.mode === "playing", signals: false };
  const ready = pictureReady({
    playing: snap.playing,
    signals: snap.signals,
    frame: loadFrame,
    readyState: snap.readyState,
    currentTime: snap.currentTime,
    lastTime: loadTime,
  });
  if (typeof snap.currentTime === "number") loadTime = snap.currentTime;
  const d = loadCardDecision(performance.now(), loadShown, loadReadyAt, ready, LOAD_CARD_AFTER);
  loadReadyAt = d.readyAt;
  if (d.hide) fadeLoadCard();
  else loadTimer = setTimeout(pokeLoadHold, Math.max(40, d.wait || 200));
}

function fadeLoadCard() {
  clearTimeout(loadTimer);
  loadTimer = 0;
  const card = $("card");
  loadShown = 0;
  if (!card || card.hidden || card.className.indexOf("card-tuning") < 0) return;
  card.classList.add("card-leave");
  loadTimer = setTimeout(function () {
    stopCrystalChime();
    if (card.className.indexOf("card-tuning") >= 0) V.hideCard();
  }, 450);
}

function onPlayerState(mode, extra) {
  const ch = current();
  // Leave the ident playing while the loading card is held over the first frames.
  if (mode !== "playing") stopCrystalChime();
  clearTimeout(app.loadCardTimer);
  tv.classList.toggle("paused", mode === "paused");
  if (mode !== "playing") tv.classList.remove("buffering");
  if (app.stillShownAt && mode !== "playing" && mode !== "tuning") app.stillShownAt = 0;
  switch (mode) {
    case "tuning":
      clearLoadHold();
      if (s.staticFx !== "off") fx.hold();
      V.hideCard();
      showRadio(ch);
      // A slow load (a TV on slow Wi-Fi, a big film): after a moment the channel's own card, in its family's
      // look, takes over from the snow until the picture comes. Radio has its own panel. Something sent
      // from a phone isn't the channel's program: it gets NostalGem's own card, saying whose it is.
      if (ch && !radioNow(ch)) {
        const tunedAt = Date.now();
        const item = player.slot ? player.slot.item : null;
        app.loadCardTimer = setTimeout(function () {
          if (player.mode !== "tuning" || app.state !== "on" || current() !== ch || (player.slot ? player.slot.item : null) !== item) return;
          fx.release();
          if (item && item.sent) V.showCard("tuning", V.sentLoadingCard(item));
          else {
            V.showCard("tuning", V.loadingCard(ch, app.cards, tunedAt), cardClass(ch));
            // The ident plays once, with the light sweep. Muted, or a blocked audio context: silence.
            if (familyOf(ch).id === "crystalsignal") crystalChime({ muted: player.muted, volume: player.v && typeof player.v.volume === "number" ? player.v.volume : 1 });
          }
          // Either card stays until the picture is really there (loadhold.js).
          // performance.now(), not the wall clock: the schedule tests pin Date, and that must not freeze the card.
          loadShown = performance.now();
          loadReadyAt = 0;
          loadTime = null;
          armLoadFrame();
          pokeLoadHold();
        }, LOAD_CARD_AFTER);
      }
      break;
    case "playing":
      fx.release();
      // The loading card stays up until the picture is really ready (loadhold.js), for every theme.
      if (loadShown) pokeLoadHold();
      else if (!app.stillShownAt) V.hideCard();
      showRadio(ch);
      break;
    case "paused":
      break;
    case "gap":
      fx.release();
      hideRadio();
      if (player.slot) V.showCard("gap", V.gapCard(ch, player.slot, s.clock24, app.bumpers, app.cards), cardClass(ch));
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
      app.adQuip = V.adQuip(app.adCount++, adChannel(ch) ? familyAdQuips(app.cards, ch) : []);
      showAdCard(ch);
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
  if (sentBad(item, stop)) return;
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

// ---------- Send to TV: a link from a phone, played on demand ----------
// A paired phone sends a link (sendto.js: a YouTube video or playlist, an archive.org item) and the TV plays
// it right away, off the schedule, on the channel it was on: the way a tape or "watch from the start" does.
// An item in parts, or a playlist, plays one after the other. BACK (or changing channel, or LIVE) goes back
// to the schedule. The phone that sent it hears how it went: { t: "sent", state, text, i, n }.
function sentTell(conn, state, text, more) {
  const msg = Object.assign({ t: "sent", state: state, text: text || "" }, more || {});
  // The phone that sent it; or, if that link has gone (the relay gave way to a direct one), whoever's there.
  if (conn && conn.open) link.sendTo(conn, msg);
  else link.send(msg);
}

function sentItem() {
  return app.sent ? app.sent.items[app.sent.i] : null;
}

// A station's own look (666's red ASCII, 111's stained glass) steps aside while something sent is on, and
// comes back after: a sent film plays as made, with the viewer's own filter.
function sentLook(on) {
  if (!!app.sentPlain === !!on) return;
  app.sentPlain = !!on;
  if (app.stationLook) applyLook();
}

// What was sent is over, however it ended.
function sentOver() {
  app.sent = null;
  sentLook(false);
}

// Is what was sent still the thing on screen?
function sentOn() {
  const sl = player.slot;
  return !!(app.sent && sl && sl.onDemand && sl.item === sentItem() && player.mode !== "off" && player.mode !== "gap" && player.mode !== "empty" && player.mode !== "standby");
}

function playSent(m, conn) {
  const p = parseSent(m.url);
  if (!p) return;
  phoneWake();
  closeOverlays();
  if (app.introTimer) hideIntro(false);
  const token = ++app.sentToken;
  const fail = function (why, text) {
    if (token !== app.sentToken) return;
    const words = text || whyNot(why);
    sentTell(conn, why === "collection" || why === "search" ? "collection" : "failed", words);
    V.toast("📲 " + words, 6000);
  };
  if (p.kind === "search") {
    fail("search");
    return;
  }
  if (p.kind === "youtube") {
    startSent([ytSent(p.id)], 0, conn, p.at || 0);
    // A video from a playlist: the rest of the list lines up behind it once YouTube says what's on it.
    if (p.list) {
      readPlaylist(p.list).then(
        function (ids) {
          const q = app.sent;
          const at = ids.indexOf(p.id);
          if (token !== app.sentToken || !q || q.items.length !== 1 || at < 0 || ids.length < 2) return;
          const first = q.items[0];
          q.items = ids.map(function (id, k) {
            return k === at ? first : ytSent(id);
          });
          q.i = at;
          sentUpNext();
          sentTell(conn, "playing", first.t, { i: q.i, n: q.items.length });
        },
        function () {
          /* the video plays by itself */
        }
      );
    }
    return;
  }
  if (p.kind === "ytlist") {
    sentTell(conn, "looking", "Asking YouTube what's on that playlist…");
    readPlaylist(p.list).then(
      function (ids) {
        if (token === app.sentToken) startSent(ids.map(ytSent), 0, conn, 0);
      },
      function () {
        fail("playlist");
      }
    );
    return;
  }
  sentTell(conn, "looking", "Looking it up on the Archive…");
  browserFetchJson(metadataUrl(p.id)).then(
    function (meta) {
      if (token !== app.sentToken) return;
      const plan = archivePlan(meta, p.file);
      if (plan.why) {
        fail(plan.why);
        return;
      }
      if (plan.about) app.about[p.id] = plan.about;
      const items = plan.programs.map(function (it) {
        return Object.assign({}, it, { sent: plan.kind });
      });
      startSent(items, plan.start, conn, p.at || 0);
    },
    function (err) {
      fail("", "Couldn't reach the Archive (" + err.message + "). Try again in a moment.");
    }
  );
}

// What's on a YouTube playlist, asked twice if the first time gets no answer (it usually comes in under a
// second, but the first one asked has been seen to go unanswered).
function readPlaylist(list) {
  return playlistIds(list, tv, QUEUE_MAX, 8000).then(null, function () {
    return playlistIds(list, tv, QUEUE_MAX, 8000);
  });
}

// A YouTube video as a program: its title and length aren't known until its player has them.
function ytSent(id) {
  return { id: "yt:" + id, f: "yt", t: "YouTube video", d: 0, untitled: true, sent: "video" };
}

function startSent(items, i, conn, at) {
  // It plays over a channel with a schedule to come back to: this one, or the first there is.
  let ch = current();
  if (!ch || isLinkChannel(ch)) {
    ch = visibleChannels().filter(function (c) {
      return !isLinkChannel(c);
    })[0];
  }
  if (!ch || !items.length) {
    sentTell(conn, "failed", whyNot(ch ? "" : "nochannel"));
    return;
  }
  if (ch !== current() || player.mode === "off") tuneTo(ch, { quiet: true });
  if (app.tape) ejectTape(); // the tape comes out, keeping its place
  app.sent = { items: items, i: i, conn: conn };
  sentLook(true);
  if (!playSentAt(i, at)) {
    sentOver();
    sentTell(conn, "failed", whyNot(""));
  }
}

function playSentAt(i, at) {
  const q = app.sent;
  const item = q && q.items[i];
  if (!item || !player.playFromStart(item, at || 0, { rate: 1, anyLength: true })) return false;
  q.i = i;
  sentUpNext();
  showBanner(6000);
  const ch = current();
  const part = q.items.length > 1 ? " (" + (i + 1) + " of " + q.items.length + ")" : "";
  V.toast("📲 From your phone: " + sentTitle(item) + part + " · BACK returns to CH " + chLabel(ch), 5000);
  sentTell(q.conn, "playing", sentTitle(item), { i: i, n: q.items.length });
  q.told = item.t;
  return true;
}

function sentTitle(item) {
  return item.t + (item.e ? " · " + item.e : "");
}

// The banner's "up next" while a queue plays: the next part.
function sentUpNext() {
  const q = app.sent;
  if (q && player.slot && player.slot.item === q.items[q.i]) player.slot.next = q.items[q.i + 1] || null;
}

// The player finished one: the next in line, if there is one (true: something else is playing now).
function sentNext(item) {
  const q = app.sent;
  if (!q || q.items[q.i] !== item || q.i + 1 >= q.items.length) return false;
  return playSentAt(q.i + 1, 0);
}

// One that was sent won't play here. It isn't the channel's program to drop for a day: the next in line
// plays, or the phone hears why and the channel comes back. True: it was one of ours.
function sentBad(item, stop) {
  const q = app.sent;
  if (!q || item !== sentItem()) return false;
  const why = q.problem || "It wouldn't play on the TV.";
  q.problem = "";
  if (!stop && q.i + 1 < q.items.length && playSentAt(q.i + 1, 0)) return true;
  sentOver();
  sentTell(q.conn, "failed", why);
  const ch = current();
  if (ch && !stop) player.tune(timelineFor(ch), true);
  // stop: one after another wouldn't play, and the player is about to say the channel has nothing. It
  // was never the channel's doing: tune it in again once the player has finished giving up.
  else if (ch) {
    setTimeout(function () {
      if (!app.sent && player.mode === "empty" && current() === ch) player.tune(timelineFor(ch));
    }, 0);
  }
  return true;
}

// ⏮ ⏭ from the phone: another part of what was sent.
function sentStep(go) {
  const q = app.sent;
  if (!q || !sentOn()) return;
  const i = q.i + (go < 0 ? -1 : 1);
  if (i < 0 || i >= q.items.length) {
    V.toast(go < 0 ? "That's the first one" : "That's the last one", 2500);
    return;
  }
  playSentAt(i, 0);
}

// The phone's seek bar and its ⏪ ⏩: on demand only (a sent link, a tape, "watch from the start").
function sentSeek(m) {
  const to = m.by != null ? player.seekBy(m.by) : player.seekTo(m.to);
  if (to < 0) return;
  showBanner(3500);
}

// BACK, with something sent on screen: back to the channel.
function stopSent() {
  const ch = current();
  sentTell(app.sent.conn, "ended", "");
  sentOver();
  player.goLive();
  V.toast("Back to CH " + chLabel(ch) + " " + ch.name, 3000);
}

// Twice a second: what was sent is over once the screen has moved on (a channel change, LIVE, the last part
// ended, or it wouldn't play); its title, once YouTube's player has it, goes to the phone that sent it.
function sentTick() {
  const q = app.sent;
  if (!q) return;
  if (!sentOn()) {
    sentOver();
    sentTell(q.conn, q.problem ? "failed" : "ended", q.problem || "");
    return;
  }
  const item = q.items[q.i];
  if (q.told !== item.t) {
    q.told = item.t;
    sentTell(q.conn, "playing", sentTitle(item), { i: q.i, n: q.items.length });
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
    wide: true,
    place: "club",
    banner: function () {
      return Club.storefrontHtml();
    },
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
          swatch: Club.spineColor(loan.key),
          value: function () {
            return Club.tapeState(loan, now);
          },
          ok: function () {
            const film = findFilm(loan.key);
            if (film) openTape(film);
          },
        });
      });
      const shelves = clubShelves();
      const week = Math.floor(now / (7 * 86400000));
      const picks = staffPicks(shelves, week, 12);
      list.push({ head: true, label: "The front rack" });
      list.push({
        label: "🆕 New this week",
        sub: true,
        value: picks.length + " tapes",
        ok: function () {
          menu.push(shelfPage("🆕 New this week", picks, { kicker: "Staff picks · the same tapes all week" }));
        },
      });
      list.push({
        label: "🔎 Search the store",
        sub: true,
        ok: function () {
          openStoreSearch();
        },
      });
      list.push({ head: true, label: "Rows" });
      groupAisles(shelves).forEach(function (aisle) {
        list.push({
          label: aisle.icon + " " + aisle.name,
          sub: true,
          value: aisle.count + (aisle.count === 1 ? " tape" : " tapes"),
          ok: function () {
            menu.push(aislePage(aisle));
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

// One channel family: its shelves, and everything on them in one browse.
function aislePage(aisle) {
  const films = aisleFilms(aisle);
  return {
    title: aisle.icon + " " + aisle.name,
    wide: true,
    place: "club",
    banner: function () {
      return Club.spineRowHtml(films, "What's on the shelf");
    },
    sub: aisle.blurb || films.length + " tapes",
    items: function () {
      const list = [];
      if (aisle.shelves.length > 1) {
        list.push({
          label: "Browse everything on this row",
          sub: true,
          value: films.length + (films.length === 1 ? " tape" : " tapes"),
          ok: function () {
            menu.push(shelfPage(aisle.icon + " " + aisle.name, films, { kicker: "What's on the shelf · " + aisle.name }));
          },
        });
      }
      aisle.shelves.forEach(function (sh) {
        list.push({
          label: (sh.ch.icon || "📼") + " " + sh.ch.name,
          sub: true,
          swatch: sh.ch.color || "",
          value: sh.films.length + (sh.films.length === 1 ? " tape" : " tapes"),
          ok: function () {
            menu.push(shelfPage((sh.ch.icon || "📼") + " " + sh.ch.name, sh.films, { kicker: "What's on the shelf · " + sh.ch.name }));
          },
        });
      });
      return list;
    },
  };
}

function shelfPage(title, films, opts) {
  const o = opts || {};
  return {
    title: title,
    wide: true,
    place: "club",
    banner: function () {
      return Club.spineRowHtml(films, o.kicker || "What's on the shelf");
    },
    sub: films.length + (films.length === 1 ? " tape" : " tapes") + " · what's on the shelf · OK to look at the box",
    items: function () {
      return films.map(function (f) {
        return {
          label: f.item.t,
          swatch: Club.spineColor(f.key),
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
          menu.push(shelfPage("🔎 " + text, found, { kicker: "What's on the shelf · " + text }));
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
  const list = filmList(film.item);
  if (loan) {
    buttons.push({
      label: isRewound(loan) ? "▶ Play" : "▶ Play from " + fmtDuration(loan.pos),
      action: function (d) {
        d.close();
        playTape(film.key);
      },
    });
    if (list) {
      // Clean cuts: this film has a few scenes that can't air. The tape plays as it is unless the viewer
      // turns its TV-safe cut on; then they're skipped (or covered with a card).
      const cutLabel = function (on) {
        return on ? "✂ Play TV-safe cut: On" : "✂ Play TV-safe cut: Off";
      };
      buttons.push({
        label: cutLabel(loan.cut),
        action: function (d) {
          const now = loanFor(lib, film.key);
          lib = setSafeCut(lib, film.key, !(now && now.cut));
          saveLib();
          if (app.tape === film.key) player.refreshCuts();
          d.close();
          openTape(film, cutLabel(loanFor(lib, film.key).cut));
        },
      });
      note = loan.cut
        ? "✂ TV-safe cut: " + list.skips.length + " scene" + (list.skips.length === 1 ? "" : "s") + (list.mode === "skip" ? " skipped" : " covered")
        : "TV-safe cut off: plays as it is";
    }
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
    note = "On the shelf · a free library card checks it out" + (list ? " · ✂ TV-safe cut available" : "");
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
    note = "On the shelf · " + LOAN_HOURS / 24 + "-day rental" + (list ? " · ✂ TV-safe cut available" : "");
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
  app.tapeLoading = key; // so the player knows it's a tape, for its TV-safe cut
  const ok = player.playFromStart(film.item, at);
  app.tapeLoading = "";
  if (ok) {
    app.tape = key;
    app.tapePos = at;
    app.tapeDur = 0;
    app.tapeSavedAt = Date.now();
    showBanner(5000);
    const c = player.cutState();
    let note = "";
    if (c && c.mode === "skip") note = " · ✂ TV-safe cut: " + c.scenes + " scene" + (c.scenes === 1 ? "" : "s") + " skipped";
    else if (c) note = " · ✂ TV-safe cut: " + c.scenes + " scene" + (c.scenes === 1 ? "" : "s") + " covered";
    else if (filmList(film.item)) note = " · uncut (its TV-safe cut is on the tape's box)";
    V.toast("📼 Now playing your tape: " + film.item.t + (at > 2 ? " · from " + fmtDuration(at) : "") + note, 5000);
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

// The club's catalog (data/library-catalog.json): shelves of books and comics checked one by one to be
// public domain, with a note on the manga shelf about why it's empty.
let catalogDef = null;
let catalogList = null;
function catalogShelves() {
  if (!catalogDef) {
    catalogDef = fetch("data/library-catalog.json", { credentials: "omit" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(parseCatalog)
      .then(function (list) {
        catalogList = list;
        return list;
      })
      .catch(function () {
        catalogDef = null;
        return [];
      });
  }
  return catalogDef;
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
  catalogShelves().then(function () {
    if (menu.isOpen) menu.render();
  });
  return {
    title: "📚 Reading Room",
    wide: true,
    place: "room",
    banner: function () {
      return Stacks.readingRoomHtml();
    },
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
          swatch: Stacks.clothColor(b.id),
          value: function () {
            return (m ? "p. " + (m.p + 1) + " · " : "") + Stacks.dueSlipText(b, now);
          },
          ok: function () {
            openBookBox({ id: b.id, t: b.t, by: b.by, y: b.y });
          },
        });
      });
      list.push({ head: true, label: "The desk" });
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
      if (catalogList && catalogList.length) {
        list.push({ head: true, label: "Checked public domain · the club's catalog" });
        catalogList.forEach(function (sh) {
          list.push({
            label: sh.icon + " " + sh.name,
            sub: true,
            value: sh.books.length ? String(sh.books.length) : "none yet",
            ok: function () {
              if (sh.books.length) menu.push(catalogShelfPage(sh));
              else showCatalogNote(sh);
            },
          });
        });
        list.push({ head: true, label: "The Archive's stacks" });
      }
      groupStackShelves(shelvesCacheList || []).forEach(function (aisle) {
        list.push({ head: true, label: aisle.icon + " " + aisle.name });
        aisle.shelves.forEach(function (sh) {
          list.push({
            label: sh.icon + " " + sh.name,
            sub: true,
            ok: function () {
              menu.push(bookShelfPage(sh));
            },
          });
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

// A shelf of the club's catalog: every book on it was checked to be public domain.
function catalogShelfPage(sh) {
  return {
    title: sh.icon + " " + sh.name,
    wide: true,
    place: "room",
    banner: function () {
      return Stacks.bookSpineHtml(sh.books, "What's on the shelf · title order");
    },
    sub: "Checked public domain · " + sh.books.length + " on the shelf, title order · OK to look at one",
    items: function () {
      return sh.books.map(function (b) {
        return {
          label: b.t,
          swatch: Stacks.clothColor(b.id),
          value: function () {
            return (bookLoan(lib, b.id) ? "📚 YOURS · " : "") + (b.y ? String(b.y) : "");
          },
          ok: function () {
            openBookBox(b);
          },
        };
      });
    },
  };
}

// An empty catalog shelf says why it's empty.
function showCatalogNote(sh) {
  dialog.open({
    title: sh.icon + " " + sh.name + " · checked public domain",
    html: Stacks.emptyShelfHtml(sh.name, sh.note, sh.id === "pd-manga" ? "No verifiably public-domain manga — here's why" : ""),
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

function bookShelfPage(shelf) {
  loadShelf(shelf);
  return {
    title: shelf.icon + " " + shelf.name,
    wide: true,
    place: "room",
    banner: function () {
      const st = shelfState[shelf.id];
      return Stacks.bookSpineHtml((st && st.books) || [], "What's on the shelf · " + shelf.name);
    },
    sub: function () {
      const st = shelfState[shelf.id];
      return st && st.books.length ? st.books.length + " on the shelf · OK to look at one" : "From the Internet Archive";
    },
    items: function () {
      const st = shelfState[shelf.id] || { books: [] };
      const list = st.books.map(function (b) {
        return {
          label: b.t,
          swatch: Stacks.clothColor(b.id),
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
  // Something a phone sent wouldn't play: the phone hears why (onBad, or sentTick when it's the service).
  if (app.sent && item && item === sentItem()) app.sent.problem = info.text || "It wouldn't play on the TV.";
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
  const item = player.slot ? player.slot.item : null;
  // Something sent from a phone is radio or a picture by what it is, whatever the channel under it.
  if (!ch || !radioNow(ch) || app.state !== "on") {
    hideRadio();
    return;
  }
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
  // A station's own look is for its own programs: something sent from a phone gets the viewer's.
  return (app.sentPlain ? "" : app.stationLook) || s.look;
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
  if (s.liteLooks && s.liteLooks[lookKey()]) return true;
  // Auto, on a TV: a filter with an SVG part starts on its light version. The full version is worked out
  // over the whole screen, off the page's own thread (several times the work, measured), where the
  // frame-rate watch can't see it slowing the picture down. Filter quality: Full still gets it.
  const look = lookById(lookId());
  if (!ON_TV || look.canvas || look.id === "off") return false;
  const mix = lookById(s.mix);
  return /url\(/.test(comboCss(look, mixable(mix) && mix.id !== look.id ? mix : null));
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

// Menu ▸ Screen shape: 4:3 for an old CRT TV. The set becomes a 4:3 box in the middle of the screen, black
// at the sides (css/app.css, html.shape-43), and everything sized to the set follows it: the canvas
// filters are drawn again for the new shape, and the guide and menus lay themselves out inside it.
function applyShape() {
  const on = s.shape === "43";
  if (document.documentElement.classList.contains("shape-43") === on) return;
  document.documentElement.classList.toggle("shape-43", on);
  canvasLook.set(null);
  applyLook();
  if (guide.isOpen) guide.render();
  tellAppShape();
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
    cut: player.cutState(),
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
          "📺 Screen shape",
          "shape",
          [
            ["wide", "Widescreen"],
            ["43", "4:3 for old CRT TVs"],
          ],
          applyShape
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
  } else {
    // The number the pack asked for, or the next free one (dial.js): 30–49, 100–199, or 200–299.
    number = packNumberFor(app.channels, o.number);
    if (number == null) number = nextNumber();
    renumbered = number !== o.number;
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
          label: "Choose a .json or .zip file…",
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
      "Pack channels land on <b>CH 30–49</b>, <b>CH 100–199</b>, or <b>CH 200–299</b>, and are saved on this TV only, like channels you add by search. " +
      "Loading a pack never changes the shipped lineup.<br><br>" +
      "The format is in <b>PACKS.md</b>, with an example pack in <b>packs/example-pack.json</b>. " +
      "Several packs can come together in one <b>.zip</b>: every .json file in it is loaded. " +
      "On a TV with no file picker, send it from the phone remote (its Channels page: Send a pack to the TV), or use Paste pack JSON. " +
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

function showPackErrors(label, errors, report) {
  if (report) report({ state: "failed", bad: errors.slice(0, 12) });
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
  input.accept = ".json,.zip,application/json,application/zip,application/x-zip-compressed";
  input.addEventListener("change", function () {
    const file = input.files && input.files[0];
    if (!file) return;
    const zip = /\.zip$/i.test(file.name) || /zip/i.test(file.type || "");
    const reader = new FileReader();
    reader.onload = function () {
      if (zip) handlePackZip(reader.result, file.name);
      else handlePackText(String(reader.result || ""), file.name);
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
    if (zip) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  });
  input.click();
}

function openPackPaste() {
  dialog.open({
    title: "Paste pack JSON",
    html:
      "Paste the pack file's text. Packs only point at the Internet Archive — a collection search or " +
      "Archive item IDs — and their channels land on CH 30–49, 100–199, or 200–299 on this TV.",
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

// report(what): the phone that sent the file hears how it went (see packFromPhone); null when it was chosen here.
function handlePackText(text, label, report) {
  const parsed = parsePack(text);
  if (!parsed.ok) return showPackErrors(label, parsed.errors, report);
  const pack = asPack(parsed.pack, label);
  const v = validatePack(pack);
  if (!v.ok) return showPackErrors(label, v.errors, report);
  confirmPacks([{ pack: pack, warnings: v.warnings }], [], label, report);
}

// A .zip of packs: every .json file in it, each a pack or a skip-list file. The ones that check out can be
// loaded together; the others are listed with what's wrong.
function handlePackZip(buf, label, report) {
  let files;
  try {
    files = packFilesFromZip(buf);
  } catch (e) {
    return showPackErrors(label, [e.message], report);
  }
  const good = [];
  const bad = [];
  files.forEach(function (f) {
    const parsed = parsePack(f.text);
    if (!parsed.ok) return bad.push(f.name + ": " + parsed.errors[0]);
    const pack = asPack(parsed.pack, f.name);
    const v = validatePack(pack);
    if (!v.ok) return bad.push(f.name + ": " + v.errors[0] + (v.errors.length > 1 ? " (and " + (v.errors.length - 1) + " more)" : ""));
    good.push({ pack: pack, warnings: v.warnings });
  });
  if (!good.length) return showPackErrors(label, bad.length ? bad : ["There are no packs (.json files) in this zip."], report);
  confirmPacks(good, bad, label, report);
}

// What a pack would add, for the "Load?" dialog.
function packSummaryHtml(pack) {
  const channels = pack.channels || [];
  const cuts = packSkipLists(pack);
  let html = "<b>" + esc(pack.pack) + "</b>";
  if (channels.length) {
    html +=
      " — " +
      channels.length +
      " channel" +
      (channels.length > 1 ? "s" : "") +
      ":<br>" +
      channels
        .map(function (ch) {
          return "CH " + ch.number + " · " + ch.name + (ch.kind === "audio" ? " (radio)" : "");
        })
        .map(esc)
        .join("<br>");
  }
  if (cuts.length) {
    html +=
      "<br>✂ Clean cuts for " +
      cuts.length +
      " film" +
      (cuts.length === 1 ? "" : "s") +
      ": scenes covered with a card, or skipped on a tape whose TV-safe cut is turned on.";
  }
  return html;
}

// good: [{ pack, warnings }] that check out; bad: lines about the files that didn't (from a zip).
function confirmPacks(good, bad, label, report) {
  let html = good.length > 1 ? "<b>" + esc(label) + "</b> holds " + good.length + " packs.<br><br>" : "";
  html += good
    .map(function (g) {
      return packSummaryHtml(g.pack);
    })
    .join("<br><br>");
  const warnings = [];
  good.forEach(function (g) {
    g.warnings.forEach(function (w) {
      warnings.push((good.length > 1 ? g.pack.pack + ": " : "") + w);
    });
  });
  if (warnings.length) html += "<br><br>Heads up:<br>" + warnings.slice(0, 10).map(esc).join("<br>");
  if (bad.length) {
    html +=
      "<br><br>Not loaded (" +
      bad.length +
      "):<br>" +
      bad
        .slice(0, 8)
        .map(esc)
        .join("<br>") +
      (bad.length > 8 ? "<br>…and " + (bad.length - 8) + " more." : "");
  }
  html += "<br><br>Channels you load are saved on this TV only. They never change the shipped lineup.";
  let answered = false;
  dialog.open({
    title: good.length > 1 ? "Load these packs?" : "Load this pack?",
    html: html,
    onClose: function () {
      if (!answered && report) report({ state: "cancelled" });
      answered = true;
    },
    buttons: [
      {
        label: good.length > 1 ? "Load " + good.length + " packs" : "Load pack",
        action: function (d) {
          answered = true;
          d.close();
          loadPacks(
            good.map(function (g) {
              return g.pack;
            }),
            report
          );
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
  if (report) {
    report({
      state: "asked",
      title: good.length > 1 ? "Load these packs?" : "Load this pack?",
      ok: good.map(function (g) {
        const chs = g.pack.channels || [];
        const cuts = packSkipLists(g.pack).length;
        return g.pack.pack + (chs.length ? " — " + chs.map(function (c) { return "CH " + c.number + " " + c.name; }).join(", ") : "") + (cuts ? (chs.length ? "; " : " — ") + "clean cuts for " + cuts + " film" + (cuts === 1 ? "" : "s") : "");
      }),
      bad: bad.slice(0, 12),
    });
  }
}

// Clean cuts a pack brought: kept on this TV, replacing older lists for the same film.
function keepSkipLists(lists) {
  const key = function (l) {
    return l.item + "/" + (l.file || "");
  };
  const fresh = {};
  lists.forEach(function (l) {
    fresh[key(l)] = 1;
  });
  const kept = skipLists.packs
    .filter(function (l) {
      return !fresh[key(l)];
    })
    .concat(lists);
  save("skipLists", kept);
  skipLists.packs = checkSkipLists({ format: SKIP_FORMAT, lists: kept }).lists;
}

// Load packs, one channel after another (a zip can hold several; a number one pack took moves the next
// one's channel along).
function loadPacks(packs, report) {
  let cancelled = false;
  const done = [];
  const notes = [];
  const queue = [];
  packs.forEach(function (pack) {
    const cuts = packSkipLists(pack);
    if (cuts.length) {
      keepSkipLists(cuts);
      notes.push((packs.length > 1 ? pack.pack + ": " : "") + "✂ clean cuts for " + cuts.length + " film" + (cuts.length === 1 ? "" : "s"));
    }
    (pack.channels || []).forEach(function (ch) {
      queue.push({ pack: pack, ch: ch });
    });
  });
  const name = packs.length > 1 ? packs.length + " packs" : packs[0].pack;
  if (report) report({ state: "loading", title: "Loading " + name });
  dialog.open({
    title: "Loading " + name,
    html: "Asking the Internet Archive for programs. This takes a few seconds per channel.",
    onClose: function () {
      if (!cancelled && report) report({ state: "cancelled" });
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
    if (report) {
      report({
        state: "loaded",
        channels: done.map(function (c) {
          return "CH " + chLabel(c) + " " + c.name;
        }),
        notes: notes.slice(0, 12),
      });
    }
    if (!done.length) {
      dialog.open({
        title: notes.length && !queue.length ? (packs.length > 1 ? "Packs loaded" : "Pack loaded") : packs.length > 1 ? "Packs loaded — nothing new" : "Pack loaded — nothing new",
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
    let msg = (packs.length > 1 ? "Packs on the air: " : "Pack on the air: ") + done.map(function (c) {
      return "CH " + chLabel(c) + " " + c.name;
    }).join(", ");
    if (notes.length) msg += ". " + notes.join("; ");
    V.toast(msg, 6000);
  };
  const step = function () {
    if (cancelled) return;
    if (i >= queue.length) return finish();
    const pack = queue[i].pack;
    const ch = queue[i].ch;
    i++;
    dialog.status("Building " + ch.name + " (" + i + " of " + queue.length + ")…");
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
    now = { t: it.t + (it.sent && it.e ? " · " + it.e : ""), y: it.y || 0, d: it.d, start: start, pos: pos };
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
    // On demand (a sent link, a tape, "watch from the start"): the phone may move through it.
    demand: !!(sl && sl.onDemand && (player.mode === "playing" || paused)),
    sent: app.sent && sentOn() ? { i: app.sent.i, n: app.sent.items.length } : null,
    muted: player.muted,
    cc: ccValue(),
    fav: ch ? app.favs.has(ch.slug) : false,
    ch: ch ? { slug: ch.slug, number: ch.number, label: chLabel(ch), name: ch.name, icon: ch.icon || "", color: ch.color || "", kind: ch.kind || "video", tagline: ch.tagline || "" } : null,
    now: now,
    next: sl && sl.next ? (sl.next.sent && sl.next.e ? sl.next.e : sl.next.t) : "",
    overlay: dialog.isOpen ? "dialog" : menu.isOpen ? "menu" : guide.isOpen ? "guide" : "",
    dialog: dlg,
    away: app.away || "",
    pointer: appCan("pointer") ? "app" : "page",
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

// A link-out station's site is on top of the page (the TV app's overlay): what the phone asks for next is
// for NostalGem itself, so the site closes first.
function phoneHome() {
  if (!app.away) return;
  sendApp({ t: "close" });
  cameHome();
}

function phoneMessage(m, conn) {
  const turnOnUp = !!(app.turnOn && app.turnOn.active());
  // The pointer moving and a pack arriving in pieces aren't a press: the turn-on plays on over them.
  const press = m.t !== "ptr" && m.t !== "scroll" && m.t !== "file";
  if (app.state === "boot") {
    // No channel yet. The press still skips the turn-on; mute is remembered for the tune.
    if (turnOnUp && press) skipTurnOn();
    if (m.t === "key" && m.type === "mute") {
      player.setMuted(true);
      V.toast("Sound off");
    }
    return;
  }
  if (m.t === "key") {
    if (app.away && awayAction(m)) return;
    // Back only dismisses the ident: it must not also arm "press again to exit".
    if (m.type === "back") {
      if (turnOnUp) skipTurnOn();
      else back();
      return;
    }
    handleAction({ type: m.type, digit: m.digit });
    return;
  }
  // The Mouse page: its clicks and keys reach the page as a tap or a key would, and skip the turn-on the
  // same way.
  if (POINTER_MESSAGES.indexOf(m.t) >= 0) {
    pointerMessage(m);
    return;
  }
  if (m.t === "file") {
    packFromPhone(m, conn);
    return;
  }
  if (turnOnUp) skipTurnOn();
  if (m.t === "play") {
    phoneHome();
    playSent(m, conn);
  } else if (m.t === "seek") {
    if (!app.away) sentSeek(m);
  } else if (m.t === "queue") {
    if (!app.away) sentStep(m.go);
  } else if (m.t === "tune") {
    const ch = app.channels.filter(function (c) {
      return c.slug === m.slug;
    })[0];
    if (!ch) return;
    phoneHome();
    phoneWake();
    closeOverlays();
    tuneTo(ch);
  } else if (m.t === "search") {
    phoneHome();
    phoneWake();
    closeOverlays();
    if (!tuneTypedNumber(m.text)) buildCustom(searchDef(m.text, m.kind));
  } else if (m.t === "find") {
    phoneHome();
    phoneWake();
    closeOverlays();
    if (!tuneTypedNumber(m.text)) showFound(m.text);
  }
}

// ---------- the phone's Mouse page (pointer.js) ----------
// In the TV app (newer versions say "pointer"), the app draws the pointer over whatever is on screen and
// presses there for real, the YouTube player and 777's arcade included; this page passes the phone's
// messages on. Anywhere else, the page draws its own pointer and works its own screen.
const POINTER_MESSAGES = ["ptr", "click", "press", "scroll", "kbd", "text"];
const pagePointer = new PagePointer($("pointer"), {
  say: function (text) {
    V.toast(text, 5000);
  },
  // Two fingers over the guide or a menu move a row at a time, like ▲▼.
  steps: function (n) {
    if (!navOpen() || reader.isOpen) return false;
    for (let i = 0; i < Math.abs(n); i++) handleAction({ type: n > 0 ? "down" : "up" });
    return true;
  },
  // The pointer keeps to the set: with Screen shape 4:3, to the box.
  box: function () {
    return tv.getBoundingClientRect();
  },
});
function appCan(what) {
  return ANDROID && native.can.indexOf(what) >= 0;
}
function sendApp(m) {
  const bridge = window.NostalGemTV;
  if (!bridge || typeof bridge.postMessage !== "function") return false;
  try {
    bridge.postMessage(appMessage(m));
    return true;
  } catch (e) {
    return false;
  }
}
// The TV app has two pieces of its own on the screen: the pointer it draws, and a link-out station's site.
// A newer app (it says "box") is told the screen's shape, at start-up and when the setting changes, so
// with 4:3 on both keep to the box as well.
function tellAppShape() {
  if (appCan("box")) sendApp({ t: "shape", s: s.shape === "43" ? "43" : "wide" });
}
function pointerMessage(m) {
  // The pointer's own mouse and touch events aren't a hand on the screen: no touch buttons for them.
  app.ptrAt = Date.now();
  if (m.t !== "ptr" && m.t !== "scroll") phoneWake();
  if (appCan("pointer") && sendApp(m)) return;
  if (m.t === "ptr") pagePointer.move(m.dx, m.dy);
  else if (m.t === "click") pagePointer.click();
  else if (m.t === "press") pagePointer.press(m.down);
  else if (m.t === "scroll") pagePointer.scroll(m.dx, m.dy);
  else if (m.t === "kbd") pagePointer.key(m.key, m.down);
  else if (m.t === "text") pagePointer.text(m.s);
}

// ---------- a link-out station's site, over the TV (the TV app's second screen) ----------
// A newer TV app (it says "overlay") opens 777's arcade and friends over NostalGem instead of in its place,
// so this page keeps running underneath: the phone stays linked, and its pointer and keys reach the site.
// The program stops while the site is up and comes back when the app says it's closed.
function goAway(ch) {
  app.away = ch.name;
  suspend();
  if (!sendApp({ t: "open", url: linkUrl(ch) })) cameHome();
}
function cameHome() {
  if (!app.away) return;
  app.away = "";
  resume();
}
// The phone's buttons while a site is up: the arrows and OK go to the site (as the TV remote's do); BACK
// steps back through it and then home; anything else comes home first and then happens here.
const AWAY_KEYS = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", ok: "Enter" };
function awayAction(m) {
  if (AWAY_KEYS[m.type]) {
    app.ptrAt = Date.now();
    return sendApp({ t: "kbd", key: AWAY_KEYS[m.type], down: null });
  }
  if (m.type === "back") return sendApp({ t: "back" });
  if (m.type === "mute") return sendApp({ t: "mute" });
  sendApp({ t: "close" });
  cameHome();
  return false;
}

// ---------- a channel pack sent from the phone ----------
// The phone sends the file in pieces (link.js); once it's all here, it goes through the same loader as a
// file chosen on the TV — checked, then "Load these packs?" — and the phone hears what the TV made of it.
const incoming = {}; // id -> { name, size, n, parts, got, at }
function packFromPhone(m, conn) {
  const now = Date.now();
  Object.keys(incoming).forEach(function (id) {
    if (now - incoming[id].at > 60000) delete incoming[id];
  });
  let f = incoming[m.id];
  if (!f) {
    if (Object.keys(incoming).length >= 3) return;
    f = incoming[m.id] = { name: m.name, size: m.size, n: m.n, parts: [], got: 0, at: now };
  }
  if (f.n !== m.n || f.size !== m.size) return;
  f.at = now;
  if (f.parts[m.i] == null) {
    f.parts[m.i] = m.data;
    f.got++;
  }
  link.sendTo(conn, { t: "fileack", id: m.id, i: m.i });
  if (f.got < f.n) return;
  delete incoming[m.id];
  const report = function (what) {
    link.sendTo(conn, Object.assign({ t: "packs", id: m.id, name: f.name }, what));
  };
  let bytes = null;
  try {
    const bin = atob(f.parts.join(""));
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch (e) {
    bytes = null;
  }
  if (!bytes || bytes.length !== f.size) return report({ state: "failed", bad: ["The file didn't arrive whole. Send it again."] });
  phoneWake();
  closeOverlays();
  V.toast("📱 A channel pack from the phone: " + f.name, 3000);
  const zip = /\.zip$/i.test(f.name) || (bytes[0] === 0x50 && bytes[1] === 0x4b);
  if (zip) handlePackZip(bytes, f.name, report);
  else handlePackText(utf8Text(bytes), f.name, report);
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
      "Point your phone's camera at the code to use it as the remote: buttons, a mouse and keyboard, a channel list, searching, and Send to TV for a YouTube or archive.org link." +
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
  V.showCard(linkCardName(ch), V.linkCard(ch, ANDROID, canOpenHere(), appCan("pointer")));
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
  if (appCan("overlay")) {
    V.toast("Opening " + ch.name + "… BACK on the remote comes back here", 4000);
    setTimeout(function () {
      if (current() === ch) goAway(ch);
    }, 700);
    return;
  }
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
  if (player.mode === "gap" && player.slot) V.showCard("gap", V.gapCard(ch, player.slot, s.clock24, app.bumpers, app.cards), cardClass(ch));
  else if (player.mode === "standby") V.showCard("standby", V.standbyCard(app.standby));
  else if (player.mode === "empty") V.showCard("empty", V.emptyCard(ch, app.emptyWhy));
  else if (player.mode === "adbreak") showAdCard(ch);
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
  // The turn-on takes this press. Back only dismisses it. Anything else dismisses it and still happens
  // (mute, channel up, OK).
  const turn = turnOnAction(!!(app.turnOn && app.turnOn.active()), a.type);
  if (turn !== "run") skipTurnOn();
  if (turn === "skip") return;
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
    // The press that lets a blocked picture start still does its job when it is a channel
    // change or it is for a dialog, menu or guide that is already open. Dropping it left
    // the phone's channel-up on channel 1, and Enter unable to close What's new.
    const moves = a.type === "up" || a.type === "down" || a.type === "chup" || a.type === "chdown";
    if (!moves && !overlayOpen()) return;
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
      if (player.muted) stopCrystalChime();
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
  // Something sent from a phone is on: BACK is back to the channel.
  if (app.sent && sentOn()) {
    stopSent();
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
  // Keys the remote doesn't use still skip the turn-on. "a" should not have to be OK.
  if (app.turnOn && app.turnOn.active() && !actionFor(e) && !isTypingTarget(e.target)) {
    skipTurnOn();
    if (player.mode === "gesture") player.userGesture();
    e.preventDefault();
    return;
  }
  const a = actionFor(e);
  if (!a) return;
  if (e.isTrusted) {
    cameHome(); // a real key here: NostalGem is what's on screen
    pagePointer.hide(); // a hand on the remote: the phone's pointer gets out of the way
  }
  if (isTypingTarget(e.target)) {
    // A text field keeps its own keys; the app takes Escape, Enter and ▲▼.
    const esc = a.type === "back" && e.key !== "Backspace" && e.keyCode !== 8;
    if (!(esc || a.type === "ok" || a.type === "up" || a.type === "down")) return;
  }
  e.preventDefault();
  fromInput("key", a);
});

// On Android TV a controller's D-pad and A button also arrive as key presses, so one press can come in
// twice: once as a key, once from the Gamepad API. The second copy within a moment is dropped
// (gamepad.js, samePress).
const lastInputFrom = { key: {}, pad: {} };
function fromInput(source, a) {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (samePress(lastInputFrom, source, a.type, now)) return;
  handleAction(a);
}

// ---------- mouse and touch ----------
let pointerTimer = 0;
function pointerActivity() {
  if (Date.now() - (app.ptrAt || 0) < 1500) return; // the phone's pointer, not a hand on the screen
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
// A tap skips the turn-on. The click that follows belongs to that tap, so it doesn't also press OK.
let turnOnTap = false;
document.addEventListener(
  "pointerdown",
  function () {
    if (!(app.turnOn && app.turnOn.active())) return;
    skipTurnOn();
    // The click that follows this tap is swallowed, so this is the press that lets a
    // blocked picture start. Otherwise the next dock button (MENU, GUIDE) is eaten.
    if (player.mode === "gesture") player.userGesture();
    turnOnTap = true;
    setTimeout(function () {
      turnOnTap = false;
    }, 700);
  },
  true
);
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
  if (turnOnTap) {
    turnOnTap = false;
    return;
  }
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
  if (app.away) return; // a link-out station's site is on top; the app says when it's gone
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
    cameHome(); // the app only hands this page keys when NostalGem is what's on screen
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
      turnOn: !!(app.turnOn && app.turnOn.active()),
      look: { id: lookId(), setting: s.look, station: app.stationLook || "", mix: s.mix, key: lookKey(), lite: lookIsLite(), quality: s.lookQuality, watching: frameWatch.key, fps: frameWatch.last, canvas: canvasLook.out.hidden ? "" : canvasLook.out.width + "x" + canvasLook.out.height, pictures: canvasLook.pictures, onScreen: tv.style.getPropertyValue("--look") },
      tv: ON_TV,
      sound: player.soundState(),
      cut: player.cutState(),
      cutCard: !$("cutcard").hidden,
      pointer: pagePointer.state(),
      away: app.away,
      card: $("card").hidden ? "" : $("card").className,
      cardWords: app.cards !== DEFAULT_CARDS, // data/cards.json is in (a break card on screen is redrawn with it)
      sent: app.sent ? { i: app.sent.i, n: app.sent.items.length, on: sentOn(), titles: app.sent.items.map(sentTitle) } : null,
      at: player.position() ? Math.round(player.position().at * 10) / 10 : 0,
      length: player.slot ? player.slot.item.d : 0,
      radio: !radio.hidden,
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
  sentTick();
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
function skipTurnOn() {
  if (!app.turnOn || !app.turnOn.active()) return false;
  app.turnOn.skip();
  return true;
}

function endTurnOn() {
  if (app.turnOnEnded) return;
  app.turnOnEnded = true;
  const bootEl = $("boot");
  if (bootEl) {
    bootEl.classList.add("gone");
    setTimeout(function () {
      bootEl.hidden = true;
      bootEl.innerHTML = "";
      app.turnOn = null;
    }, 480);
  }
  // What's new waits until the picture is actually on screen.
  setTimeout(function () {
    if (app.state === "on" && !overlayOpen()) showWhatsNew(false);
  }, 1100);
}

function holdTurnOn() {
  const bootEl = $("boot");
  if (bootEl) bootEl.classList.add("boot-hold");
}

// A few stills of snow, then stop. No animation frame loop.
function paintBootSnow(turnOn) {
  const c = $("boot-snow");
  if (!c || !c.getContext) return;
  let ctx = null;
  try {
    ctx = c.getContext("2d");
  } catch (e) {
    return;
  }
  if (!ctx) return;
  const size = snowBufferSize(c.clientWidth || 160, c.clientHeight || 90, window.devicePixelRatio || 1);
  c.width = size.w;
  c.height = size.h;
  function draw() {
    if (!turnOn.active()) return;
    try {
      const img = ctx.createImageData(size.w, size.h);
      img.data.set(snowPixels(size.w, size.h));
      ctx.putImageData(img, 0, 0);
    } catch (e) {
      /* no canvas: the bars still play */
    }
  }
  // Three stills as the raster opens, then the canvas sits. Not a loop.
  let i;
  for (i = 0; i < SNOW_FRAMES.length; i++) turnOn.arm(draw, 380 + SNOW_FRAMES[i]);
}

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
    // A link-out station's site was closed (BACK, or held Select): back to the program.
    if (m.t === "home") return cameHome();
    if (m.t) return;
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
      tellAppShape();
    }
  };
  try {
    bridge.postMessage("hello");
  } catch (x) {
    /* an older app */
  }
}

async function boot() {
  const bootEl = $("boot");
  const still = prefersStill(function (q) {
    return window.matchMedia(q);
  });
  // Alternate card only. The CRT title card stays the markup in index.html.
  const treasure = !!(bootEl && treasureWanted(params.get("boot")));
  if (treasure) mountTreasureBoot(bootEl, still);
  const bootVersion = document.querySelector(".boot-version");
  if (bootVersion) bootVersion.textContent = "v" + VERSION;
  askApp();
  registerTvKeys();
  applyLook();
  tv.classList.add("hide-cursor");
  if (!treasure && (!showBootSnow(s.staticFx) || still)) bootEl.classList.add("boot-quiet");
  const waitEl = document.querySelector(".boot-wait");
  // The title card plays over the load. It does not wait, and it does not hold the tuner.
  const turnOn = createTurnOn({
    now: function () {
      return typeof performance !== "undefined" ? performance.now() : Date.now();
    },
    duration: turnOnDuration(still),
    schedule: function (fn, ms) {
      return setTimeout(fn, ms);
    },
    cancel: function (id) {
      clearTimeout(id);
    },
    audible: function () {
      return !still && introAudible({ muted: player.muted, staticFx: s.staticFx });
    },
    playSound: treasure ? playTreasureSound : playTurnOnSound,
    onFinish: endTurnOn,
    onWait: holdTurnOn,
  });
  app.turnOn = turnOn;
  if (!treasure && !still && showBootSnow(s.staticFx)) paintBootSnow(turnOn);
  let got = null;
  while (!got) {
    got = await loadLineup({ bundled: "data/lineup.json", live: LIVE_LINEUP });
    if (!got) {
      if (waitEl) waitEl.textContent = "NO SIGNAL · RETRYING";
      await wait(5000);
      if (waitEl) waitEl.textContent = "";
    }
  }
  applyLineup(got.lineup, got.source);
  // The tuner no longer waits for the start-up card, so a station break can be on screen before these two
  // files are in: when one arrives, a break card that's up is drawn again with it.
  const redrawBreak = function () {
    if (app.state !== "on" || app.stillShownAt) return;
    if (player.mode === "gap" && player.slot) {
      restoreCard();
      return;
    }
    // The card while a channel loads, in its family's words (not something sent from a phone, which has
    // NostalGem's own card, and not one that's already fading out).
    const card = $("card");
    const item = player.slot ? player.slot.item : null;
    const ch = current();
    if (player.mode === "tuning" && ch && !card.hidden && /\bcard-tuning\b/.test(card.className) && !/\bcard-leave\b/.test(card.className) && !(item && item.sent)) {
      V.showCard("tuning", V.loadingCard(ch, app.cards, Date.now()), cardClass(ch));
    }
  };
  // House bumpers for the station breaks. Loads in the background; a missing
  // file just means plain "up next" cards.
  loadBumpers("data/bumpers.json").then(function (list) {
    app.bumpers = list;
    redrawBreak();
  });
  // The station cards' words, in each family's voice. Missing: the plain words.
  loadCards("data/cards.json").then(function (c) {
    app.cards = c;
    redrawBreak();
  });
  loadSkipLists();
  const asked = (params.get("ch") || "").replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "");
  const lastSlug = load("last", "");
  const start =
    (asked && channelForDigits(app.channels, asked, false)) ||
    app.channels.filter(function (c) {
      return c.slug === lastSlug;
    })[0] ||
    app.channels[0];

  // Tune the moment the lineup is in. The title card is still up; uncovering it is lineupReady's job.
  // The channel's own banner and snow stay the tuning screen. This card does not become that.
  app.state = "on";
  tuneTo(start);
  turnOn.lineupReady();
  // Any standard controller drives the remote: D-pad to surf, A for OK, B to go back.
  createGamepad(
    function (a) {
      if (app.away) return; // a controller playing the arcade's games, over this page
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

boot();
