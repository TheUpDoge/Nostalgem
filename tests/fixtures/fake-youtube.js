// Stand-in for https://www.youtube.com/iframe_api in the browser test. Implements the slice of YT.Player
// that web/js/youtube.js uses. A video id starting with "bad" fails with error 150 (embedding disabled),
// one starting with "cfg" with error 153 (YouTube refuses the page); one starting with "ad" sits unstarted for
// 8 seconds first, the way the embed does while a pre-roll ad runs; every video is 12 seconds long. window.__yt.log records what was loaded and where it started.
(function () {
  const log = [];
  window.__yt = { log: log, players: [] };
  function Player(mount, opts) {
    const el = document.createElement("div");
    el.className = "fake-yt";
    el.style.cssText = "width:100%;height:100%;background:#123;color:#fff;font:40px sans-serif";
    mount.parentNode.replaceChild(el, mount);
    this.el = el;
    this.ev = opts.events || {};
    this.vars = opts.playerVars || {};
    this.state = -1;
    this.t = 0;
    this.at = 0;
    this.muted = false;
    this.vid = "";
    window.__yt.players.push(this);
    const self = this;
    setTimeout(function () {
      self.ev.onReady && self.ev.onReady({ target: self });
    }, 30);
    setInterval(function () {
      if (self.state === 1 && self.getCurrentTime() >= 12) self.set(0);
    }, 100);
  }
  Player.prototype.set = function (s) {
    if (this.state === 1) this.t = this.getCurrentTime();
    this.state = s;
    this.at = performance.now();
    this.ev.onStateChange && this.ev.onStateChange({ data: s, target: this });
  };
  Player.prototype.loadVideoById = function (o) {
    const self = this;
    this.vid = o.videoId;
    this.t = o.startSeconds || 0;
    log.push({ id: o.videoId, start: this.t });
    this.el.textContent = "YouTube: " + o.videoId;
    if (/^(bad|cfg)/.test(o.videoId)) {
      setTimeout(function () {
        self.ev.onError && self.ev.onError({ data: /^bad/.test(o.videoId) ? 150 : 153, target: self });
      }, 60);
      return;
    }
    setTimeout(function () {
      if (self.vid !== o.videoId) return;
      self.set(3);
      setTimeout(function () {
        if (self.vid === o.videoId) self.set(1);
      }, 80);
    }, /^ad/.test(o.videoId) ? 8000 : 60);
  };
  Player.prototype.playVideo = function () {
    if (this.vid && this.state === 2) this.set(1);
  };
  Player.prototype.pauseVideo = function () {
    if (this.state === 1) this.set(2);
  };
  Player.prototype.stopVideo = function () {
    this.vid = "";
    this.set(5);
  };
  Player.prototype.seekTo = function (t) {
    this.t = t;
    this.at = performance.now();
  };
  Player.prototype.getCurrentTime = function () {
    return this.state === 1 ? this.t + (performance.now() - this.at) / 1000 : this.t;
  };
  Player.prototype.getDuration = function () {
    return 12;
  };
  Player.prototype.mute = function () {
    this.muted = true;
  };
  Player.prototype.unMute = function () {
    this.muted = false;
  };
  Player.prototype.setVolume = function () {};
  Player.prototype.loadModule = function () {};
  Player.prototype.unloadModule = function () {};
  Player.prototype.setOption = function () {};
  window.YT = { Player: Player, PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } };
  setTimeout(function () {
    if (typeof window.onYouTubeIframeAPIReady === "function") window.onYouTubeIframeAPIReady();
  }, 0);
})();
