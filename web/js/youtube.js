// YouTube programs. A program whose id is "yt:<videoId>" plays through YouTube's official IFrame Player
// API instead of the <video> element. YtMedia wraps that player in the small part of the HTMLMediaElement
// interface player.js uses (src, play, pause, currentTime, duration, muted, volume and the playing /
// waiting / ended / error / loadedmetadata events), so the tuner treats both the same way: join in
// progress, skip a video that won't play, stand by when the network is down.
//
// YouTube's own player and branding stay on screen; NostalGem only lays its banner over it for a moment.

export const YT_PREFIX = "yt:";

export function isYouTube(item) {
  return !!item && typeof item.id === "string" && item.id.indexOf(YT_PREFIX) === 0;
}

export function videoIdOf(item) {
  return isYouTube(item) ? item.id.slice(YT_PREFIX.length) : "";
}

export function ytThumb(videoId) {
  return "https://i.ytimg.com/vi/" + encodeURIComponent(videoId) + "/mqdefault.jpg";
}

// Errors that mean "this video can't play here": bad id (2), HTML5 player error (5), removed or private
// (100), embedding disabled (101, 150), and the configuration errors (152, 153) some embedders get.
export const BAD_VIDEO_ERRORS = [2, 5, 100, 101, 150, 152, 153];

let apiPromise = null;
function loadApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise(function (ok, fail) {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (typeof prev === "function") prev();
      ok(window.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = function () {
      apiPromise = null;
      fail(new Error("couldn't load the YouTube player"));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

// The videos on a playlist, in order (at most `max`): a player nobody sees is handed the list and asked
// what's on it. No key and no signing in, so it works for playlists anyone may watch. holder: an element to
// put that player in; it's taken out again afterwards.
export function playlistIds(listId, holder, max, timeoutMs) {
  return loadApi().then(function (YT) {
    return new Promise(function (ok, fail) {
      const box = document.createElement("div");
      const mount = document.createElement("div");
      box.style.cssText = "position:absolute;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none";
      box.appendChild(mount);
      holder.appendChild(box);
      let player = null;
      let poll = 0;
      let done = false;
      const read = function () {
        let ids = null;
        try {
          ids = player.getPlaylist();
        } catch (e) {
          /* not yet */
        }
        return (Array.isArray(ids) ? ids : []).filter(function (id) {
          return typeof id === "string" && /^[\w-]{6,20}$/.test(id);
        });
      };
      const finish = function (ids, err) {
        if (done) return;
        done = true;
        clearInterval(poll);
        clearTimeout(timer);
        try {
          if (player) player.destroy();
        } catch (e) {
          /* fine */
        }
        if (box.parentNode) box.parentNode.removeChild(box);
        if (ids && ids.length) ok(ids.slice(0, max || 200));
        else fail(err || new Error("YouTube listed no videos"));
      };
      const timer = setTimeout(function () {
        finish(read(), new Error("YouTube didn't answer"));
      }, timeoutMs || 12000);
      const loc = window.location;
      player = new YT.Player(mount, {
        width: "200",
        height: "113",
        host: "https://www.youtube-nocookie.com",
        playerVars: {
          listType: "playlist",
          list: listId,
          autoplay: 0,
          controls: 0,
          playsinline: 1,
          origin: /^https?:$/.test(loc.protocol) ? loc.protocol + "//" + loc.host : undefined,
          widget_referrer: loc.href.replace(/#.*$/, ""),
        },
        events: {
          onReady: function () {
            try {
              player.cuePlaylist({ listType: "playlist", list: listId });
            } catch (e) {
              /* the player variables above already asked for it */
            }
            poll = setInterval(function () {
              const ids = read();
              if (ids.length) finish(ids);
            }, 250);
          },
          onError: function (e) {
            finish(read(), new Error("YouTube error " + (e && e.data)));
          },
        },
      });
    });
  });
}

// YT.PlayerState
const ENDED = 0;
const PLAYING = 1;
const PAUSED = 2;
const BUFFERING = 3;
// A video still unstarted this long after loading is behind an ad (or autoplay is blocked).
const AD_GUESS_MS = 6000;

export class YtMedia {
  constructor(host) {
    this.host = host; // an element the iframe goes into
    this.yt = null;
    this.ready = false;
    this.videoId = "";
    this.srcText = "";
    this.startAt = 0;
    this.state = -1;
    this.metaSent = false;
    this.playWaiters = [];
    this.handlers = {};
    this._muted = false;
    this._volume = 1;
    this.loadToken = 0;
    this.hush = false; // an ad is running ahead of the show: keep it quiet
    this.inAd = false;
    // Whether this page may start sound by itself. The TV app always may; a browser tab may once the
    // viewer has pressed something on the page.
    this.autoplayOk = null;
  }

  addEventListener(type, fn) {
    (this.handlers[type] = this.handlers[type] || []).push(fn);
  }

  fire(type, detail) {
    (this.handlers[type] || []).forEach(function (fn) {
      fn({ type: type, detail: detail });
    });
  }

  // src is "yt:<videoId>#t=<seconds>", mirroring the media fragment the <video> path uses.
  set src(value) {
    const m = /^yt:([\w-]{6,20})(?:#t=(\d+))?/.exec(String(value || ""));
    this.srcText = m ? String(value) : "";
    this.videoId = m ? m[1] : "";
    this.startAt = m && m[2] ? Number(m[2]) : 0;
    this.metaSent = false;
    this.state = -1;
    this.error = null;
    // Quiet until the show itself starts, so an ad ahead of it can't be heard (only where sound may start
    // by itself: unmuting a video the browser let start muted would stop it).
    this.inAd = false;
    this.hush = this.mayAutoplay();
    const token = ++this.loadToken;
    if (!this.videoId) return;
    const self = this;
    this.host.hidden = false;
    this.ensure()
      .then(function () {
        if (token !== self.loadToken) return;
        self.yt.loadVideoById({ videoId: self.videoId, startSeconds: self.startAt });
        self.applySound();
      })
      .catch(function (e) {
        if (token !== self.loadToken) return;
        self.error = { code: 0, message: e.message };
        self.fire("error", self.error);
      });
  }
  get src() {
    return this.srcText;
  }
  getAttribute(name) {
    return name === "src" && this.srcText ? this.srcText : null;
  }
  removeAttribute(name) {
    if (name !== "src") return;
    this.srcText = "";
    this.videoId = "";
    this.loadToken++;
    this.endAd();
    this.rejectWaiters();
    if (this.yt && this.ready) {
      try {
        this.yt.stopVideo();
      } catch (e) {
        /* fine */
      }
    }
    this.host.hidden = true;
  }
  load() {
    /* nothing to reset beyond removeAttribute */
  }

  ensure() {
    if (this.yt && this.ready) return Promise.resolve();
    if (this.creating) return this.creating;
    const self = this;
    const mount = document.createElement("div");
    this.host.appendChild(mount);
    this.creating = loadApi().then(function (YT) {
      return new Promise(function (ok) {
        const loc = window.location;
        self.yt = new YT.Player(mount, {
          width: "100%",
          height: "100%",
          host: "https://www.youtube-nocookie.com",
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            playsinline: 1,
            rel: 0,
            // An embed needs to say where it lives, or YouTube may refuse it (errors 152/153), notably
            // inside an Android WebView.
            origin: /^https?:$/.test(loc.protocol) ? loc.protocol + "//" + loc.host : undefined,
            widget_referrer: loc.href.replace(/#.*$/, ""),
          },
          events: {
            onReady: function () {
              self.ready = true;
              ok();
            },
            onStateChange: function (e) {
              self.onState(e.data);
            },
            onError: function (e) {
              self.onError(e.data);
            },
          },
        });
      });
    });
    return this.creating;
  }

  onState(s) {
    this.state = s;
    if (!this.videoId) return;
    if (s === PLAYING) {
      this.endAd();
      if (!this.metaSent) {
        this.metaSent = true;
        this.fire("loadedmetadata");
      }
      this.resolveWaiters();
      this.fire("playing");
    } else if (s === BUFFERING) this.fire("waiting");
    else if (s === ENDED) this.fire("ended");
  }

  onError(code) {
    if (!this.videoId) return;
    this.error = { code: Number(code) || 0 };
    this.rejectWaiters();
    this.fire("error", this.error);
  }

  resolveWaiters() {
    const w = this.playWaiters;
    this.playWaiters = [];
    w.forEach(function (x) {
      clearTimeout(x.timer);
      x.ok();
    });
  }
  rejectWaiters(err) {
    const w = this.playWaiters;
    this.playWaiters = [];
    w.forEach(function (x) {
      clearTimeout(x.timer);
      if (err) x.fail(err);
    });
  }

  // Resolves once the video is playing. If it is still sitting unstarted after a while, either YouTube is
  // showing an ad ahead of the show (the embed reports nothing while one runs), or the browser is holding
  // autoplay back. When this page may autoplay, it's the ad: keep waiting, quietly ("adbreak"). Otherwise
  // reject the way <video>.play() does, so the TV asks for a button press.
  play() {
    const self = this;
    if (this.yt && this.ready && this.videoId) {
      try {
        this.yt.playVideo();
      } catch (e) {
        /* not ready */
      }
    }
    if (this.state === PLAYING) return Promise.resolve();
    const token = this.loadToken;
    return new Promise(function (ok, fail) {
      const x = { ok: ok, fail: fail, timer: 0 };
      x.timer = setTimeout(function () {
        if (token !== self.loadToken) return; // another video since
        if (!(self.videoId && !self.error && self.ready && (self.state === -1 || self.state === 5))) return;
        if (self.mayAutoplay()) {
          self.startAd();
          return; // still waiting: resolves when the show starts
        }
        const i = self.playWaiters.indexOf(x);
        if (i >= 0) self.playWaiters.splice(i, 1);
        const err = new Error("autoplay held back");
        err.name = "NotAllowedError";
        fail(err);
      }, AD_GUESS_MS);
      self.playWaiters.push(x);
    });
  }

  mayAutoplay() {
    if (typeof this.autoplayOk === "function") return !!this.autoplayOk();
    const ua = typeof navigator !== "undefined" && navigator.userActivation;
    return !!(ua && ua.hasBeenActive);
  }

  startAd() {
    this.inAd = true;
    this.hush = true;
    this.applySound();
    this.fire("adbreak");
  }
  endAd() {
    if (!this.inAd && !this.hush) return;
    this.inAd = false;
    this.hush = false;
    this.applySound();
  }

  pause() {
    if (this.yt && this.ready) {
      try {
        this.yt.pauseVideo();
      } catch (e) {
        /* fine */
      }
    }
  }

  get paused() {
    return this.state !== PLAYING && this.state !== BUFFERING;
  }
  get ended() {
    return this.state === ENDED;
  }
  get seeking() {
    return false;
  }
  get readyState() {
    return this.metaSent ? 4 : 0;
  }
  get duration() {
    const d = this.yt && this.ready && this.metaSent ? this.yt.getDuration() : NaN;
    return d > 0 ? d : NaN;
  }
  // The video's own title, once YouTube's player has it (for a video sent from a phone, which arrives
  // as a bare link).
  get title() {
    if (!this.yt || !this.ready || !this.videoId || typeof this.yt.getVideoData !== "function") return "";
    try {
      const d = this.yt.getVideoData();
      return d && d.video_id === this.videoId && typeof d.title === "string" ? d.title.replace(/\s+/g, " ").trim().slice(0, 140) : "";
    } catch (e) {
      return "";
    }
  }
  get currentTime() {
    return this.yt && this.ready ? this.yt.getCurrentTime() || 0 : 0;
  }
  set currentTime(t) {
    if (this.yt && this.ready) this.yt.seekTo(Math.max(0, t), true);
  }

  applySound() {
    if (!this.yt || !this.ready) return;
    try {
      if (this._muted || this.hush) this.yt.mute();
      else this.yt.unMute();
      this.yt.setVolume(Math.round(this._volume * 100));
    } catch (e) {
      /* fine */
    }
  }
  get muted() {
    return this._muted;
  }
  set muted(m) {
    this._muted = !!m;
    this.applySound();
  }
  get volume() {
    return this._volume;
  }
  set volume(v) {
    this._volume = Math.max(0, Math.min(1, Number(v) || 0));
    this.applySound();
  }

  // Captions are YouTube's own; ask its player to show or hide them.
  setCaptions(on, lang) {
    if (!this.yt || !this.ready) return;
    try {
      if (on) {
        this.yt.loadModule("captions");
        this.yt.setOption("captions", "track", { languageCode: lang || "en" });
      } else this.yt.unloadModule("captions");
    } catch (e) {
      /* not every video has them */
    }
  }

  // <video> has these; YouTube draws its own captions.
  get textTracks() {
    return [];
  }
  appendChild() {}
}
