// NostalGem: the set itself. Wires the remote, the tuner, the guide, the menu and the screen together.

import { makeTimeline, slotAt, programKey } from "./schedule.js";
import { Player } from "./player.js";
import { Static } from "./static.js";
import { actionFor, isTypingTarget, registerTvKeys } from "./remote.js";
import { load, save } from "./store.js";
import { buildChannel, browserFetchJson } from "./archive.js";
import { pickSubtitle, subtitleLabel } from "./captions.js";
import { Guide } from "./ui/guide.js";
import { Menu } from "./ui/menu.js";
import { Dialog } from "./ui/dialog.js";
import * as V from "./ui/views.js";
import { TvLink, makeCode, cleanCode, remoteUrl, prettyCode, qrSvg, loadScript, isIPv4, PAGES_BASE } from "./link.js";
import { loadLineup, builtAt } from "./lineup.js";
import { pad2, escapeHtml as esc, slugify, fmtClock, fmtDuration, hash32, chLabel, chKey, chOrder } from "./util.js";

const VERSION = "1.3.0";
const NAME = "NostalGem";
const params = new URLSearchParams(window.location.search);
const ANDROID = params.get("tv") === "android";
// The TV app opens the published site, and falls back to its own copy when it can't reach it. That
// copy's lineup is as old as the app, while the published one is rebuilt daily, so the copy asks for it.
const ON_PAGES = window.location.href.indexOf(PAGES_BASE) === 0;
const LIVE_LINEUP = ANDROID && !ON_PAGES ? PAGES_BASE + "data/lineup.json" : "";
const LINEUP_RECHECK = 3 * 3600 * 1000; // coming back to the app after this long: look for a newer lineup

const DEFAULTS = { crt: "light", fit: "contain", cc: "off", staticFx: "sound", bug: true, clock24: false, surf: "all", phone: false };
const SLEEP_STEPS = [0, 15, 30, 45, 60, 90, 120];
const STILL_AFTER = 4 * 3600 * 1000; // no button pressed for four hours: ask
const STILL_GRACE = 2 * 60 * 1000; // then switch off two minutes later
const BAD_TTL = 24 * 3600 * 1000; // a file that wouldn't play is skipped for a day
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
  about: {},
  channels: [],
  idx: -1,
  last: -1,
  s: Object.assign({}, DEFAULTS, load("settings", {})),
  favs: new Set(load("favs", [])),
  hidden: new Set(load("hidden", [])),
  bad: pruneBad(load("bad", {})),
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
const player = new Player($("screen"), {
  ytHost: $("yt"),
  state: onPlayerState,
  program: onProgram,
  bad: onBad,
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
    tuneTo(ch);
    if (prog && prog.startMs > now + 60000) V.toast('"' + prog.item.t + '" starts at ' + fmtClock(new Date(prog.startMs), s.clock24), 4000);
  },
});
const menu = new Menu($("menu"), updateBug);
const dialog = new Dialog($("dialog"));

// ---------- channels ----------
function current() {
  return app.channels[app.idx];
}
function visibleChannels() {
  return app.channels.filter(function (c) {
    return !app.hidden.has(c.slug);
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
function badSet() {
  if (!app.badSet) app.badSet = new Set(Object.keys(app.bad));
  return app.badSet;
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
  }
  clearTimeout(app.surfTimer);
  app.pendingIdx = -1;
  staticBurst(450);
  V.osdChannel(ch);
  app.lastProgKey = "";
  applyCaptions();
  player.tune(timelineFor(ch));
  if (!o.quiet) showBanner(6000);
  updateBug();
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
function digit(n) {
  app.digits = (app.digits + String(n)).slice(-3);
  const typed = app.digits;
  clearTimeout(app.digitTimer);
  const exact = channelForDigits(typed, false);
  const longer = app.channels.some(function (c) {
    const k = chKey(c);
    return k.length > typed.length && k.indexOf(typed) === 0;
  });
  if (longer) {
    const shown = typed.length === 1 ? typed + "-" : typed.length === 2 ? pad2(Number(typed)) + "-" : typed;
    V.osd("CH " + shown, "", 2500);
  }
  if ((exact && !longer) || typed.length >= 3 || (!exact && !longer)) commitDigits();
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
    V.osd("CH " + (typed.length > 2 ? typed.slice(0, 2) + "-" + typed.slice(2) : pad2(Number(typed))), "NO SIGNAL", 2000);
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
    V.toast("PAUSED · press ▶❚❚ or OK in the menu to resume", 2500);
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
      if (player.slot) V.showCard("gap", V.gapCard(ch, player.slot, s.clock24));
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
      V.showCard("empty", V.emptyCard(ch));
      break;
    case "gesture":
      fx.release();
      hideRadio();
      V.showCard("gesture", V.gestureCard());
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

function onBad(item) {
  app.bad[programKey(item)] = Date.now() + BAD_TTL;
  save("bad", app.bad);
  app.badSet = null;
  app.timelines = {};
  const ch = current();
  if (ch) player.tune(timelineFor(ch));
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
function applyLook() {
  const keep = tv.className
    .split(/\s+/)
    .filter(function (c) {
      return c && !/^(crt|fit)-/.test(c);
    })
    .join(" ");
  tv.className = keep + " crt-" + s.crt + " fit-" + s.fit;
  fx.sound = s.staticFx === "sound";
  updateBug();
  if (!banner.hidden) renderBanner();
}

function updateBug() {
  const ch = current();
  const show = !!(s.bug && ch && app.state === "on" && (player.mode === "playing" || player.mode === "paused") && banner.hidden && !overlayOpen() && ch.kind !== "audio");
  bug.hidden = !show;
  if (show) {
    const text = (ch.icon ? ch.icon + " " : "") + chLabel(ch);
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
  return dialog.isOpen || menu.isOpen || guide.isOpen;
}
function closeOverlays() {
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
  const q = /[:()"]/.test(text) ? text : "(" + text + ")";
  return {
    slug: "u-" + slugify(text) + "-" + Date.now().toString(36),
    name: titleCase(text).slice(0, 24),
    tagline: "Your search: " + text,
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
      "Archive search terms like <b>collection:prelinger</b> work too.",
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

function buildCustom(def) {
  let cancelled = false;
  const L = app.lineup;
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
  buildChannel(def, {
    fetchJson: browserFetchJson,
    exclude: L.exclude,
    excludeDescription: L.excludeDescription,
    excludeFiles: L.excludeFiles,
    maxYear: L.maxYear,
    concurrency: 4,
    progress: function (n, total) {
      if (!cancelled) dialog.status("Checking " + n + " of " + total + " items…");
    },
  })
    .then(function (res) {
      if (cancelled) return;
      if (!res.items.length) {
        dialog.status("Nothing playable turned up. Try other words.");
        return;
      }
      const ch = {
        slug: def.slug,
        number: nextNumber(),
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
    buildCustom(searchDef(m.text, m.kind));
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
    ["0 – 9", "Go to a channel number", "0 – 9"],
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
      "Channels 50 and up air official uploads from the studios' own <b>YouTube</b> channels, in YouTube's player.<br><br>" +
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

function restoreCard() {
  const ch = current();
  if (player.mode === "gap" && player.slot) V.showCard("gap", V.gapCard(ch, player.slot, s.clock24));
  else if (player.mode === "standby") V.showCard("standby", V.standbyCard(app.standby));
  else if (player.mode === "empty") V.showCard("empty", V.emptyCard(ch));
  else V.hideCard();
}

// ---------- input ----------
function handleAction(a) {
  app.lastInput = Date.now();
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
  if (player.mode === "gesture") {
    player.userGesture();
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
  handleAction(a);
});

// ---------- mouse and touch ----------
let pointerTimer = 0;
function pointerActivity() {
  touch.hidden = false;
  tv.classList.remove("hide-cursor");
  clearTimeout(pointerTimer);
  pointerTimer = setTimeout(function () {
    touch.hidden = true;
    tv.classList.add("hide-cursor");
  }, 3500);
}
document.addEventListener("mousemove", pointerActivity);
document.addEventListener("touchstart", pointerActivity, { passive: true });
touch.addEventListener("click", function (e) {
  const b = e.target.closest ? e.target.closest("[data-act]") : null;
  if (!b) return;
  e.stopPropagation();
  pointerActivity();
  const t = b.getAttribute("data-act");
  if (t === "back") back();
  else handleAction({ type: t });
});
tv.addEventListener("click", function (e) {
  // A click on a menu row or dialog button can remove that element before the click gets here (the menu
  // closes and a dialog opens). It was a click on an overlay, not on the picture: don't press OK again.
  if (!tv.contains(e.target)) return;
  if (e.target.closest && e.target.closest(".touch,.guide,.menu,.dialog,.banner")) return;
  handleAction({ type: "ok" });
});
let touchY = null;
tv.addEventListener(
  "touchstart",
  function (e) {
    touchY = e.touches && e.touches.length === 1 ? e.touches[0].clientY : null;
  },
  { passive: true }
);
tv.addEventListener(
  "touchend",
  function (e) {
    if (touchY == null || overlayOpen() || !e.changedTouches || !e.changedTouches.length) return;
    const dy = e.changedTouches[0].clientY - touchY;
    touchY = null;
    if (Math.abs(dy) > 70) surf(dy < 0 ? 1 : -1);
  },
  { passive: true }
);

// ---------- app lifecycle ----------
function suspend() {
  if (app.state !== "on" || app.suspended) return;
  app.suspended = true;
  player.off();
}
function resume() {
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
    };
  },
};

// ---------- clock ----------
function tick() {
  const now = Date.now();
  app.ticks++;
  player.tick();
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
  app.lineupSource = source || "";
  app.lineupCheckedAt = Date.now();
  app.about = Object.assign({}, lineup.about || {});
  const customs = load("custom", []);
  customs.forEach(function (c) {
    Object.assign(app.about, c.about || {});
  });
  app.channels = lineup.channels.concat(
    customs.map(function (c) {
      return Object.assign({}, c, { custom: true });
    })
  );
  app.channels.sort(chOrder);
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
const native = { lan: [], app: "" };
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
  };
  try {
    bridge.postMessage("hello");
  } catch (x) {
    /* an older app */
  }
}

async function boot() {
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
