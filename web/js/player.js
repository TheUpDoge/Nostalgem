// The tuner. Plays whatever the schedule says is on, joining in progress like a real TV,
// and keeps going when the Internet Archive doesn't: a file that won't play is reported to the app
// (which drops it from that channel), and three failures in a row means the network is down,
// so it shows "technical difficulties" and quietly retries.
//
// Modes: idle, tuning, playing, paused, gap (station break / up next), standby, gesture, off, empty

import { slotAt } from "./schedule.js";
import { downloadUrl, corsUrl } from "./archive.js";
import { srtToVtt, pickSubtitle, subtitleLabel } from "./captions.js";

const TUNE_TIMEOUT = 25000; // no picture this long after tuning: give up on the file
const STALL_TIMEOUT = 40000; // buffering this long mid-program: give up on the file
const MAX_DRIFT = 30; // fallen this many seconds behind live after buffering: jump back to live
const RETRY_AFTER = 30000; // standby retry interval

export class Player {
  constructor(video, hooks) {
    this.v = video;
    this.hooks = hooks || {};
    this.tl = null;
    this.slot = null;
    this.mode = "idle";
    this.shifted = false; // paused or restarted: no longer following the live schedule
    this.token = 0;
    this.failures = [];
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

    const self = this;
    video.addEventListener("loadedmetadata", function () {
      self.onMeta();
    });
    video.addEventListener("playing", function () {
      self.onPlaying();
    });
    video.addEventListener("waiting", function () {
      if (self.mode === "playing" && !self.waitingSince) self.waitingSince = Date.now();
      self.emit("buffering", true);
    });
    video.addEventListener("error", function () {
      self.onError();
    });
    video.addEventListener("ended", function () {
      self.onEnded();
    });
  }

  emit(name, a, b) {
    const fn = this.hooks[name];
    if (typeof fn === "function") fn(a, b);
  }

  setMode(mode, extra) {
    this.mode = mode;
    this.emit("state", mode, extra);
  }

  // Start following a channel's schedule.
  tune(timeline) {
    this.tl = timeline;
    this.retryAt = 0;
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
    const v = this.v;
    const item = this.slot.item;
    const token = ++this.token;
    const self = this;
    this.removeTrack();
    this.pendingSeek = true;
    this.loadStart = Date.now();
    this.waitingSince = 0;
    this.stopFade();
    v.volume = 1;
    v.muted = this.muted;
    this.setMode("tuning");
    // The media fragment starts the download near the live point instead of at 0:00.
    v.src = downloadUrl(item.id, item.f) + (startAt > 2 ? "#t=" + Math.floor(startAt) : "");
    this.tryPlay(token);
    this.applyCaptions(token);
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
    this.syncToLive();
    return true;
  }

  onMeta() {
    if (!this.pendingSeek || !this.slot) return;
    this.pendingSeek = false;
    if (this.shifted) return;
    const v = this.v;
    const dur = v.duration;
    const target = (Date.now() - this.slot.startMs) / 1000;
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
    if (this.mode !== "tuning" && this.mode !== "playing" && this.mode !== "paused" && this.mode !== "gesture") return;
    this.waitingSince = 0;
    this.failures = [];
    this.emit("buffering", false);
    if (this.mode !== "playing") this.setMode("playing");
  }

  onError() {
    if (this.mode !== "tuning" && this.mode !== "playing" && this.mode !== "paused") return;
    if (!this.v.getAttribute("src")) return;
    this.fail("error");
  }

  onEnded() {
    if (this.mode !== "playing") return;
    if (this.shifted || !this.slot) {
      this.syncToLive();
      return;
    }
    if (Date.now() < this.slot.slotEndMs - 500) this.enterGap();
    else this.syncToLive();
  }

  fail(reason) {
    const now = Date.now();
    this.failures = this.failures.filter(function (t) {
      return now - t < 120000;
    });
    this.failures.push(now);
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    if (offline || this.failures.length >= 3) {
      this.standby(offline ? "offline" : "archive");
      return;
    }
    const item = this.slot && this.slot.item;
    this.clear();
    if (item) this.emit("bad", item, reason); // the app drops it from the channel and retunes
  }

  standby(why) {
    this.clear();
    this.retryAt = Date.now() + RETRY_AFTER;
    this.setMode("standby", { why: why, retryAt: this.retryAt });
  }

  enterGap() {
    this.clear();
    this.setMode("gap");
  }

  clear() {
    this.token++;
    this.pendingSeek = false;
    this.removeTrack();
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
  }

  // Called twice a second by the app.
  tick() {
    const now = Date.now();
    const v = this.v;
    switch (this.mode) {
      case "tuning":
        if (now - this.loadStart > TUNE_TIMEOUT) this.fail("timeout");
        break;
      case "playing":
        if (this.waitingSince && now - this.waitingSince > STALL_TIMEOUT) {
          this.fail("stall");
          break;
        }
        if (v.paused && !v.ended && !v.seeking) this.tryPlay(this.token); // the TV paused us (audio focus etc.)
        if (!this.shifted && this.slot) {
          if (now >= this.slot.endMs + 1500) {
            // the file runs longer than its listing: the schedule wins
            if (now >= this.slot.slotEndMs) this.syncToLive();
            else this.enterGap();
            break;
          }
          const target = (now - this.slot.startMs) / 1000;
          if (!v.seeking && v.readyState > 0 && target - v.currentTime > MAX_DRIFT) {
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

  restart() {
    if ((this.mode !== "playing" && this.mode !== "paused") || !this.slot) return false;
    this.shifted = true;
    try {
      this.v.currentTime = 0;
    } catch (e) {
      return false;
    }
    if (this.mode === "paused") this.togglePause();
    return true;
  }

  // Seconds into the program and its length, for the info banner.
  position() {
    if (!this.slot) return null;
    const d = this.slot.item.d;
    if (this.mode === "playing" || this.mode === "paused") {
      const t = this.v.currentTime;
      if (isFinite(t) && t > 0) return { at: Math.min(t, d), d: d };
    }
    return { at: Math.min(d, Math.max(0, (Date.now() - this.slot.startMs) / 1000)), d: d };
  }

  setMuted(m) {
    this.muted = !!m;
    this.v.muted = this.muted;
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
