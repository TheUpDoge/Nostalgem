// The tuner. Plays whatever the schedule says is on, joining in progress like a real TV,
// and keeps going when the Internet Archive or YouTube doesn't: a program that won't play is reported
// to the app (which drops it from that channel) with the reason (problems.js). A service that won't
// play anything, or three unexplained failures in a row, shows "technical difficulties" and quietly
// retries; a channel where nothing in a row will play here says so.
//
// Modes: idle, tuning, adbreak (YouTube is showing an ad first), playing, paused, gap (station break / up
// next), standby, gesture, off, empty
//
// A channel can change how its films sound: rate (666 plays them at half speed, an octave down, like a
// tape running slow) and sound: "church" (111's films ring around a nave, church.js): echoes of the film.
// A reverb needs the file loaded with CORS, which the Archive's video servers don't allow (checked
// November 2026), so it's only tried when hooks.corsReverb says so; then a <video> whose sound has gone into
// it can't come back out, so the next ordinary film gets a fresh <video> (hooks.media hears about it), and a
// file that won't load with CORS plays the ordinary way, with echoes (after the first, the rest aren't
// tried).
//
// Clean cuts (cuts.js): hooks.cutsFor(slot) says how this program plays with its list of scenes — a card over
// each one with the sound cut (anywhere), or jumping over each one (Video Club tapes) — and hooks.cut hears
// when the card goes up or comes down, and when a scene was skipped.

import { slotAt } from "./schedule.js";
import { downloadUrl, corsUrl } from "./archive.js";
import { srtToVtt, pickSubtitle, subtitleLabel } from "./captions.js";
import { YtMedia, isYouTube, videoIdOf } from "./youtube.js";
import { failureInfo } from "./problems.js";
import { sceneAt, nextScene } from "./cuts.js";

const TUNE_TIMEOUT = 25000; // no picture this long after tuning: give up on the file
const STALL_TIMEOUT = 40000; // buffering this long mid-program: give up on the file
const AD_TIMEOUT = 180000; // an "ad" this long is something else: ask for a button press
const MAX_DRIFT = 30; // fallen this many seconds behind live after buffering: jump back to live
const RETRY_AFTER = 30000; // standby retry interval
const SKIPS_IN_A_ROW = 6; // this many programs in a row that can't play here: say so instead of trying them all
const CUT_WATCH_MS = 100; // how often a film with a clean-cut list is checked against its scenes
const UNKNOWN_LENGTH = 4 * 3600; // seconds an on-demand program is given until its real length is known

export class Player {
  constructor(video, hooks) {
    this.video = video;
    this.v = video; // the element playing now: the <video>, or the YouTube player made to look like one
    this.ytm = null;
    this.hooks = hooks || {};
    this.tl = null;
    this.slot = null;
    this.mode = "idle";
    this.shifted = false; // paused or restarted: no longer following the live schedule
    this.token = 0;
    this.failures = [];
    this.skips = 0;
    this.retryAt = 0;
    this.loadStart = 0;
    this.waitingSince = 0;
    this.pendingSeek = false;
    this.ccWanted = false;
    this.ccLang = "en";
    this.ccStrict = false;
    this.trackEl = null;
    this.trackUrl = null;
    this.muted = false;
    this.fadeTimer = 0;
    this.adSince = 0;
    this.church = this.hooks.church || null;
    this.routed = null; // the <video> whose sound is in the church
    this.noCors = {}; // films that wouldn't load with CORS: they play the ordinary way, with echoes
    this.corsBroken = !this.hooks.corsReverb; // no CORS this session: don't keep trying
    this.cuts = null; // { mode: "card" | "skip", skips, text } for the program playing now
    this.cutScene = null; // the scene the card is covering
    this.cutSkipped = 0;
    this.cutTimer = 0;
    this.cutSoon = 0;

    this.wire(video);
  }

  // Events count only from the element that is playing now.
  wire(el) {
    const self = this;
    el.addEventListener("loadedmetadata", function () {
      if (self.v === el) self.onMeta();
    });
    el.addEventListener("playing", function () {
      if (self.v === el) self.onPlaying();
    });
    el.addEventListener("waiting", function () {
      if (self.v !== el) return;
      if (self.mode === "playing" && !self.waitingSince) self.waitingSince = Date.now();
      self.emit("buffering", true);
    });
    el.addEventListener("error", function () {
      if (self.v === el) self.onError();
    });
    el.addEventListener("ended", function () {
      if (self.v === el) self.onEnded();
    });
    const cutCheck = function () {
      if (self.v === el && self.cuts) self.watchCuts();
    };
    el.addEventListener("seeked", cutCheck);
    el.addEventListener("timeupdate", cutCheck);
  }

  youtube() {
    if (!this.ytm) {
      const host = this.hooks.ytHost;
      const ytm = new YtMedia(host);
      const self = this;
      this.ytm = ytm;
      if (typeof this.hooks.autoplayOk === "function") ytm.autoplayOk = this.hooks.autoplayOk;
      this.wire(ytm);
      ytm.addEventListener("adbreak", function () {
        if (self.v !== ytm || (self.mode !== "tuning" && self.mode !== "gesture")) return;
        self.adSince = Date.now();
        self.setMode("adbreak");
      });
    }
    return this.ytm;
  }

  // Switch between the <video> and the YouTube player, silencing the one going off screen.
  useMedia(next) {
    if (next === this.v) return;
    const old = this.v;
    try {
      old.pause();
    } catch (e) {
      /* nothing loaded */
    }
    if (old.getAttribute("src")) {
      old.removeAttribute("src");
      try {
        old.load();
      } catch (e) {
        /* already empty */
      }
    }
    this.v = next;
    this.video.hidden = next !== this.video;
  }

  emit(name, a, b, c) {
    const fn = this.hooks[name];
    if (typeof fn === "function") fn(a, b, c);
  }

  setMode(mode, extra) {
    this.mode = mode;
    this.emit("state", mode, extra);
  }

  // Start following a channel's schedule.
  // again: the same channel, retuned after dropping a program that wouldn't play.
  tune(timeline, again) {
    this.tl = timeline;
    this.retryAt = 0;
    if (!again) this.skips = 0;
    this.syncToLive();
  }

  syncToLive() {
    this.shifted = false;
    const slot = this.tl ? slotAt(this.tl, Date.now()) : null;
    this.slot = slot;
    if (!slot) {
      this.clear();
      this.setMode("empty");
      return;
    }
    this.emit("program", slot);
    if (slot.inGap) {
      this.enterGap();
      return;
    }
    this.load(slot.into);
  }

  load(startAt) {
    const item = this.slot.item;
    const yt = isYouTube(item) && this.hooks.ytHost;
    if (this.church) this.church.quiet(); // a new film: its own echoes, once it plays
    if (!yt) this.readyVideo(this.corsFor(item));
    this.useMedia(yt ? this.youtube() : this.video);
    const v = this.v;
    const token = ++this.token;
    this.removeTrack();
    this.pendingSeek = true;
    this.loadStart = Date.now();
    this.waitingSince = 0;
    this.stopFade();
    v.volume = 1;
    this.setCuts(this.hooks.cutsFor ? this.hooks.cutsFor(this.slot) : null);
    v.muted = this.muted;
    this.setMode("tuning");
    // The media fragment starts the download near the live point instead of at 0:00.
    // A live stream has no "into the program": it is joined wherever it is now.
    const at = startAt > 2 && !item.live ? "#t=" + Math.floor(startAt) : "";
    if (v === this.video) this.setSpeed(v, this.rate());
    v.src = isYouTube(item) ? "yt:" + videoIdOf(item) + at : downloadUrl(item.id, item.f) + at;
    if (v === this.video) this.setSpeed(v, this.rate());
    this.tryPlay(token);
    this.applyCaptions(token);
  }

  // How fast this channel plays its films (1: as made).
  rate() {
    return (this.slot && this.slot.rate) || 1;
  }

  // Seconds into the file that the clock says we should be at.
  liveTarget(now) {
    return ((now - this.slot.startMs) / 1000) * this.rate();
  }

  // Slower and lower together, like a tape running slow; as made otherwise.
  setSpeed(v, rate) {
    try {
      v.defaultPlaybackRate = rate;
      v.playbackRate = rate;
    } catch (e) {
      /* this browser plays at one speed */
    }
    const keep = rate === 1;
    if ("preservesPitch" in v) v.preservesPitch = keep;
    if ("webkitPreservesPitch" in v) v.webkitPreservesPitch = keep;
    if ("mozPreservesPitch" in v) v.mozPreservesPitch = keep;
  }

  wantsChurch(item) {
    const ch = this.tl && this.tl.channel;
    return !!(this.church && ch && ch.sound === "church" && item && !isYouTube(item) && !item.live && !item.sent);
  }

  // Load this film with CORS, for the full reverb?
  corsFor(item) {
    return this.wantsChurch(item) && !this.corsBroken && !this.noCors[item.id];
  }

  // The <video> for the next film: one that loads with CORS for the church's reverb, an ordinary one
  // otherwise. One whose sound went into the reverb is swapped for a fresh one.
  readyVideo(cors) {
    if (cors) {
      if (this.video.crossOrigin !== "anonymous") this.video.crossOrigin = "anonymous";
      return;
    }
    if (this.routed === this.video) this.freshVideo();
    else if (this.video.hasAttribute("crossorigin")) this.video.removeAttribute("crossorigin");
  }

  freshVideo() {
    const old = this.video;
    const el = old.cloneNode(false);
    el.removeAttribute("src");
    el.removeAttribute("crossorigin");
    try {
      old.pause();
    } catch (e) {
      /* nothing loaded */
    }
    if (old.getAttribute("src")) {
      old.removeAttribute("src");
      try {
        old.load();
      } catch (e) {
        /* already empty */
      }
    }
    if (old.parentNode) old.parentNode.replaceChild(el, old);
    if (this.church) this.church.quiet();
    if (this.church && this.routed === old) this.church.detach();
    this.routed = null;
    this.video = el;
    if (this.v === old) this.v = el;
    this.wire(el);
    this.emit("media", el);
  }

  // A church film that's playing: its sound into the nave (once the browser lets sound start), or, if
  // that can't be, echoes of it.
  churchIn() {
    if (!this.church || this.v !== this.video || this.routed === this.video) return;
    if (!this.slot || !this.wantsChurch(this.slot.item)) return;
    if (this.video.crossOrigin === "anonymous" && this.church.attach(this.video)) {
      this.routed = this.video;
      this.church.quiet();
      return;
    }
    this.church.echo(this.video);
  }

  // What the sound is doing, for the app's state report and tests.
  soundState() {
    const v = this.video;
    return {
      rate: this.v === v ? v.playbackRate : 1,
      pitch: !("preservesPitch" in v) || v.preservesPitch,
      church: !!(this.slot && this.wantsChurch(this.slot.item)),
      cors: v.crossOrigin === "anonymous",
      inChurch: !!this.routed && this.routed === v,
      level: this.church && this.routed === v ? Math.round(this.church.level() * 10000) / 10000 : 0,
      echo: this.church ? this.church.echoState() : { on: 0, off: 0 },
    };
  }

  tryPlay(token) {
    const self = this;
    const p = this.v.play();
    if (p && p.catch) {
      p.catch(function (err) {
        if (token !== self.token) return;
        if (err && err.name === "NotAllowedError") self.setMode("gesture"); // browser wants a button press first
      });
    }
  }

  // The viewer pressed something: browsers that blocked autoplay will now allow it.
  userGesture() {
    if (this.mode !== "gesture") return false;
    if (this.v === this.ytm && this.v.getAttribute("src")) {
      // Just press play: loading the video again would start its ad over.
      this.loadStart = Date.now();
      this.setMode("tuning");
      this.tryPlay(this.token);
      return true;
    }
    if (this.slot && this.slot.onDemand) this.load(this.slot.into || 0);
    else this.syncToLive();
    return true;
  }

  onMeta() {
    if (!this.pendingSeek || !this.slot) return;
    this.pendingSeek = false;
    if (this.shifted || this.slot.item.live) return;
    const v = this.v;
    const dur = v.duration;
    const target = this.liveTarget(Date.now());
    if (isFinite(dur) && dur > 0 && target >= dur - 1) {
      this.enterGap(); // the file is shorter than its listing; sit out the rest of the slot
      return;
    }
    if (Math.abs(v.currentTime - target) > 1.5) {
      try {
        v.currentTime = target;
      } catch (e) {
        /* not seekable yet */
      }
    }
  }

  onPlaying() {
    const m = this.mode;
    if (m !== "tuning" && m !== "adbreak" && m !== "playing" && m !== "paused" && m !== "gesture") return;
    this.waitingSince = 0;
    this.failures = [];
    this.skips = 0;
    this.emit("buffering", false);
    if (this.v === this.ytm && this.ccWanted) this.ytm.setCaptions(true, this.ccLang);
    this.churchIn();
    this.learn();
    if (this.mode !== "playing") this.setMode("playing");
  }

  // An on-demand program whose length or title wasn't known when it was asked for (a YouTube video sent
  // from a phone): the player knows once it plays.
  learn() {
    const sl = this.slot;
    if (!sl || !sl.onDemand) return;
    const item = sl.item;
    let learned = false;
    const dur = this.v.duration;
    if (!(item.d > 0) && isFinite(dur) && dur > 0) {
      item.d = Math.round(dur);
      sl.endMs = sl.slotEndMs = Date.now() + ((item.d - Math.max(0, this.v.currentTime || 0)) / this.rate()) * 1000;
      learned = true;
    }
    const title = item.untitled && this.v === this.ytm ? this.ytm.title : "";
    if (title) {
      item.t = title;
      delete item.untitled;
      learned = true;
    }
    if (learned) this.emit("learned", sl);
  }

  onError() {
    const m = this.mode;
    if (m !== "tuning" && m !== "adbreak" && m !== "playing" && m !== "paused") return;
    if (!this.v.getAttribute("src")) return;
    const item = this.slot && this.slot.item;
    if (this.v === this.video && this.video.crossOrigin === "anonymous" && item && !this.noCors[item.id]) {
      // It wouldn't load with CORS: try it the ordinary way before giving up on it (with echoes), and
      // don't try the others that way.
      this.noCors[item.id] = true;
      this.corsBroken = true;
      if (this.slot.onDemand) this.load(Math.max(0, this.video.currentTime || this.slot.into || 0));
      else this.syncToLive();
      return;
    }
    this.fail("error");
  }

  onEnded() {
    if (this.mode !== "playing") return;
    if (this.slot && this.slot.item.live) {
      // The broadcast is over: drop it for now and move on to the next stream.
      const item = this.slot.item;
      const info = failureInfo({ youtube: isYouTube(item), reason: "ended" });
      this.clear();
      this.emit("problem", item, info);
      this.emit("bad", item, info);
      return;
    }
    if (this.shifted || !this.slot) {
      // An on-demand program is over: the app may have the next one lined up (a sent item's next part),
      // or it's back to the schedule.
      if (this.slot && this.slot.onDemand && this.hooks.demandEnded && this.hooks.demandEnded(this.slot.item)) return;
      this.syncToLive();
      return;
    }
    if (Date.now() < this.slot.slotEndMs - 500) this.enterGap();
    else this.syncToLive();
  }

  fail(reason) {
    const now = Date.now();
    const item = this.slot && this.slot.item;
    const yt = !!item && isYouTube(item);
    const err = this.v && this.v.error;
    const info = failureInfo({ youtube: yt, code: err ? err.code : undefined, reason: reason });
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      this.standby("offline");
      return;
    }
    this.emit("problem", item, info);
    if (info.kind === "service") {
      // Nothing from this service will play right now; the program itself is fine.
      this.standby(info.service, info.text);
      return;
    }
    if (info.kind === "unsure") {
      this.failures = this.failures.filter(function (t) {
        return now - t < 120000;
      });
      this.failures.push(now);
      if (this.failures.length >= 3) {
        this.standby(info.service);
        return;
      }
    }
    this.clear();
    if (++this.skips >= SKIPS_IN_A_ROW) {
      // Program after program won't play here (a region lock on a whole channel, say): stop and say why.
      // Tuning back in later tries the rest.
      if (item) this.emit("bad", item, info, true);
      this.setMode("empty", { why: info.text });
      return;
    }
    if (item) this.emit("bad", item, info); // the app drops it from the channel and retunes
  }

  standby(why, text) {
    this.clear();
    this.retryAt = Date.now() + RETRY_AFTER;
    this.setMode("standby", { why: why, text: text || "", retryAt: this.retryAt });
  }

  enterGap() {
    this.clear();
    this.setMode("gap");
  }

  clear() {
    this.token++;
    this.pendingSeek = false;
    this.removeTrack();
    this.setCuts(null);
    if (this.church) this.church.quiet();
    const v = this.v;
    try {
      v.pause();
    } catch (e) {
      /* nothing loaded */
    }
    if (v.getAttribute("src")) {
      v.removeAttribute("src");
      try {
        v.load();
      } catch (e) {
        /* already empty */
      }
    }
    // Nothing is playing now: back to as-made speed, so 666's slow-and-low doesn't hang about on a station
    // break or a stand-by card (the next film sets its own speed as it loads).
    if (v === this.video) this.setSpeed(v, 1);
  }

  // Read-only, for the loading card (loadhold.js). Whether a frame is really on the way.
  // Claude: this does not change playback. Drop it with the hold in main.js if you don't want the wait.
  pictureState() {
    const v = this.v;
    const playing = this.mode === "playing";
    if (!v || (typeof v.readyState !== "number" && typeof v.currentTime !== "number")) return { playing: playing, signals: false };
    return {
      playing: playing,
      signals: true,
      readyState: typeof v.readyState === "number" ? v.readyState : null,
      currentTime: typeof v.currentTime === "number" && isFinite(v.currentTime) ? v.currentTime : null,
    };
  }

  // Called twice a second by the app.
  tick() {
    const now = Date.now();
    const v = this.v;
    switch (this.mode) {
      case "tuning":
        if (now - this.loadStart > TUNE_TIMEOUT) this.fail("timeout");
        break;
      case "adbreak":
        if (now - this.adSince > AD_TIMEOUT) this.setMode("gesture");
        break;
      case "playing":
        if (this.waitingSince && now - this.waitingSince > STALL_TIMEOUT) {
          this.fail("stall");
          break;
        }
        if (v.paused && !v.ended && !v.seeking) this.tryPlay(this.token); // the TV paused us (audio focus etc.)
        if (this.routed && this.routed === this.video) this.church.context(); // woken if the TV put it to sleep
        else if (this.church) this.churchIn(); // the browser may let sound start now
        if (!this.shifted && this.slot) {
          if (now >= this.slot.endMs + 1500) {
            // the file runs longer than its listing: the schedule wins
            if (now >= this.slot.slotEndMs) this.syncToLive();
            else this.enterGap();
            break;
          }
          const target = this.liveTarget(now);
          if (!this.slot.item.live && !v.seeking && v.readyState > 0 && target - v.currentTime > MAX_DRIFT) {
            try {
              v.currentTime = target;
            } catch (e) {
              /* try again next tick */
            }
          }
        }
        break;
      case "gap":
        if (this.slot && now >= this.slot.slotEndMs) this.syncToLive();
        break;
      case "standby":
        if (now >= this.retryAt) {
          this.failures = [];
          this.syncToLive();
        }
        break;
      default:
        break;
    }
  }

  togglePause() {
    const v = this.v;
    if (this.mode === "playing") {
      v.pause();
      this.shifted = true;
      this.setMode("paused");
      return "paused";
    }
    if (this.mode === "paused") {
      this.tryPlay(this.token);
      this.setMode("playing");
      return "playing";
    }
    return this.mode;
  }

  goLive() {
    if (this.tl) this.syncToLive();
  }

  // On demand: one of this channel's programs from its start, off the schedule. It plays to the end (or
  // until "Back to live"), and then the channel's schedule takes over again.
  // at: seconds in to start from (a Video Club tape picks up where it was stopped).
  // opts.rate: the speed to play at, whatever the channel's own (something sent from a phone plays as made).
  // opts.anyLength: its length may not be known yet (a YouTube video): it's learned once it plays.
  playFromStart(item, at, opts) {
    const o = opts || {};
    const known = !!item && item.d > 0;
    if (!this.tl || !item || item.live || !(known || o.anyLength)) return false;
    const into = known ? Math.max(0, Math.min(item.d - 5, Number(at) || 0)) : Math.max(0, Number(at) || 0);
    const rate = o.rate || this.tl.rate || 1;
    const now = Date.now();
    const start = now - (into / rate) * 1000;
    const end = start + ((known ? item.d : UNKNOWN_LENGTH) / rate) * 1000;
    this.shifted = true;
    this.retryAt = 0;
    this.slot = { index: -1, item: item, into: into, rate: rate, startMs: start, endMs: end, slotEndMs: end, inGap: false, next: null, onDemand: true };
    this.emit("program", this.slot);
    this.load(into);
    return true;
  }

  restart() {
    if ((this.mode !== "playing" && this.mode !== "paused") || !this.slot || this.slot.item.live) return false;
    this.shifted = true;
    try {
      this.v.currentTime = 0;
    } catch (e) {
      return false;
    }
    if (this.mode === "paused") this.togglePause();
    return true;
  }

  // Seconds into the program and its length (the file's own seconds), and how fast it's playing, for the
  // info banner.
  position() {
    if (!this.slot) return null;
    const d = this.slot.item.d;
    const rate = this.rate();
    if ((this.mode === "playing" || this.mode === "paused") && !this.slot.item.live) {
      const t = this.v.currentTime;
      if (isFinite(t) && t > 0) return { at: d > 0 ? Math.min(t, d) : t, d: d, rate: rate };
    }
    const target = Math.max(0, this.liveTarget(Date.now()));
    return { at: d > 0 ? Math.min(d, target) : target, d: d, rate: rate };
  }

  // On demand only (the shared clock isn't for moving): jump to a place in the program, or by some seconds.
  // Returns where it went, or -1.
  seekTo(sec) {
    const sl = this.slot;
    if (!sl || !sl.onDemand || sl.item.live || (this.mode !== "playing" && this.mode !== "paused")) return -1;
    const d = sl.item.d;
    const t = Math.max(0, d > 0 ? Math.min(d - 2, Number(sec) || 0) : Number(sec) || 0);
    try {
      this.v.currentTime = t;
    } catch (e) {
      return -1;
    }
    return t;
  }
  seekBy(sec) {
    const t = this.v ? this.v.currentTime : NaN;
    return isFinite(t) ? this.seekTo(t + (Number(sec) || 0)) : -1;
  }

  setMuted(m) {
    this.muted = !!m;
    this.v.muted = this.muted || !!this.cutScene;
  }

  // ---------- clean cuts ----------
  // How this program plays with its list of scenes (or null: untouched). Starts or stops the watch.
  setCuts(c) {
    if (this.cutScene) {
      this.cutScene = null;
      this.v.muted = this.muted;
      this.emit("cut", { card: false });
    }
    clearInterval(this.cutTimer);
    clearTimeout(this.cutSoon);
    this.cutTimer = 0;
    this.cutSoon = 0;
    this.cutSkipped = 0;
    this.cuts = c && c.skips && c.skips.length ? c : null;
    if (!this.cuts) return;
    const self = this;
    this.cutTimer = setInterval(function () {
      self.watchCuts();
    }, CUT_WATCH_MS);
  }

  // The tape's TV-safe cut was turned on or off while it plays.
  refreshCuts() {
    this.setCuts(this.hooks.cutsFor && this.slot ? this.hooks.cutsFor(this.slot) : null);
    if (this.cuts) this.watchCuts();
  }

  // Where the film is against its scenes: the card up or down, or a jump over the scene.
  watchCuts() {
    const c = this.cuts;
    const v = this.v;
    if (!c || !v.getAttribute("src") || v.readyState < 1) return;
    const t = v.currentTime;
    if (!isFinite(t)) return;
    const scene = sceneAt(c.skips, t);
    if (c.mode === "skip") {
      if (scene && !v.seeking) {
        try {
          v.currentTime = scene.end;
        } catch (e) {
          return;
        }
        this.cutSkipped++;
        this.emit("cut", { skipped: this.cutSkipped, of: c.skips.length });
      }
    } else if (scene !== this.cutScene) {
      this.cutScene = scene;
      v.muted = this.muted || !!scene;
      this.emit("cut", { card: !!scene, text: c.text, end: scene ? scene.end : 0 });
    }
    // A scene about to start gets a check right on time, not up to a tenth of a second late.
    const next = nextScene(c.skips, t);
    const rate = v.playbackRate || 1;
    if (next && !this.cutSoon && !v.paused && next.start - t < 0.3) {
      const self = this;
      this.cutSoon = setTimeout(function () {
        self.cutSoon = 0;
        self.watchCuts();
      }, Math.max(0, ((next.start - t) * 1000) / rate));
    }
  }

  // For the app's state report and tests.
  cutState() {
    return this.cuts ? { mode: this.cuts.mode, scenes: this.cuts.skips.length, card: !!this.cutScene, skipped: this.cutSkipped } : null;
  }

  // strict: only the wanted language will do (no English fallback)
  setCaptions(on, lang, strict) {
    this.ccWanted = !!on;
    this.ccLang = lang || "en";
    this.ccStrict = !!strict;
    this.applyCaptions(this.token);
  }

  applyCaptions(token) {
    this.removeTrack();
    const item = this.slot && this.slot.item;
    if (item && isYouTube(item)) {
      if (this.ytm) this.ytm.setCaptions(this.ccWanted, this.ccLang);
      return;
    }
    if (!this.ccWanted || !item || !item.cc || !item.cc.length) return;
    const pick = pickSubtitle(item.cc, this.ccLang, this.ccStrict);
    if (!pick) return;
    const self = this;
    fetch(corsUrl(item.id, pick[0]), { credentials: "omit" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      })
      .then(function (text) {
        if (token !== self.token) return;
        const url = URL.createObjectURL(new Blob([srtToVtt(text)], { type: "text/vtt" }));
        const tr = document.createElement("track");
        tr.kind = "subtitles";
        tr.srclang = pick[1] || "und";
        tr.label = subtitleLabel(pick);
        tr.src = url;
        tr.default = true;
        self.v.appendChild(tr);
        self.trackEl = tr;
        self.trackUrl = url;
        const show = function () {
          const tracks = self.v.textTracks;
          for (let i = 0; i < tracks.length; i++) tracks[i].mode = "showing";
        };
        tr.addEventListener("load", show);
        setTimeout(show, 50);
        self.emit("captions", { on: true, lang: pick[1], label: subtitleLabel(pick) });
      })
      .catch(function () {
        if (token === self.token) self.emit("captions", { on: false, error: true });
      });
  }

  removeTrack() {
    if (this.trackEl && this.trackEl.parentNode) this.trackEl.parentNode.removeChild(this.trackEl);
    if (this.trackUrl) URL.revokeObjectURL(this.trackUrl);
    this.trackEl = null;
    this.trackUrl = null;
  }

  // Sleep timer: turn the sound down slowly, then switch off.
  fadeOut(ms, done) {
    const v = this.v;
    const steps = 30;
    let n = 0;
    const self = this;
    this.stopFade();
    this.fadeTimer = setInterval(function () {
      n++;
      v.volume = Math.max(0, 1 - n / steps);
      if (n >= steps) {
        self.stopFade();
        self.off();
        if (done) done();
      }
    }, ms / steps);
  }

  stopFade() {
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    this.fadeTimer = 0;
  }

  off() {
    this.stopFade();
    this.clear();
    this.setMode("off");
  }
}
