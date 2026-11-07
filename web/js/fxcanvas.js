// The pixel and ASCII looks, drawn on a canvas. As SVG filters they were far too slow on a TV (ASCII ran
// at a couple of frames a second), so here each video frame is drawn small onto a canvas and the
// graphics chip does the rest:
//
//   pixel, 8bit, gameboy  the small picture is shown stretched to the screen with hard pixel edges;
//                         8-bit and Game Boy colors are applied while it's drawn small (ctx.filter).
//   ascii                 one small pixel per character cell. Each brightness band picks its
//                         characters (sparse "." for dark, dense "@" for bright), tiled from a pattern
//                         and cut to the cells in that band. The patterns shift every moment, so the
//                         characters shimmer; "matrix" adds falling Matrix rain on top.
//
// Drawing another site's video onto a canvas is allowed; reading its pixels isn't, and nothing here
// reads them. YouTube's player can't be drawn at all, so it keeps the CSS versions (looks.js).

import { ASCII_BANDS } from "./looks.js";

const COLS = 128; // ASCII cells across; rows follow the screen's shape
const CELL = 8; // pixels per cell on the ASCII canvas (the screen scales it up)
const PIXEL_WIDE = { pixel: 192, "8bit": 240, gameboy: 160 };
const PALETTE = { "8bit": "url(#ng-pal-8bit)", gameboy: "url(#ng-pal-gameboy)" };

// Characters for each band, sparse to dense. Matrix uses half-width katakana and digits.
const GLYPHS = [".,`'", ":;-'", "=~+-", "+*<>x", "#X%&$", "@#M%W"];
const MATRIX = ["..:", ":ｰﾊ", "ﾐﾋｰ1", "ｳｼﾅﾓﾆ7", "ｻﾜﾂｵﾘｱ3", "ﾎﾃﾏｹﾒｴｶｷ0"];
// Katakana where the TV has the font (Android TVs do), digits and symbols everywhere.
const RAIN = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789Z:=*+<>|";
const TILE = 16; // a pattern tile is TILE × TILE cells of random characters

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
function pick(s) {
  return s.charAt(Math.floor(Math.random() * s.length));
}

// Where the video goes on a w × h canvas for object-fit contain | cover | fill.
export function fitRect(vw, vh, w, h, fit) {
  if (!vw || !vh || fit === "fill") return [0, 0, w, h];
  const k = fit === "cover" ? Math.max(w / vw, h / vh) : Math.min(w / vw, h / vh);
  const dw = vw * k;
  const dh = vh * k;
  return [(w - dw) / 2, (h - dh) / 2, dw, dh];
}

export class CanvasLook {
  // opts: { video, yt (YouTube's container, to step aside while it shows), before (insert canvases
  // before this element) }
  constructor(opts) {
    this.video = opts.video;
    this.yt = opts.yt;
    this.out = canvas(2, 2);
    this.out.className = "fxcv";
    this.out.hidden = true;
    this.rain = canvas(2, 2);
    this.rain.className = "fxrain";
    this.rain.hidden = true;
    opts.before.parentNode.insertBefore(this.out, opts.before);
    if (opts.rainBefore) opts.rainBefore.parentNode.insertBefore(this.rain, opts.rainBefore);
    else opts.before.parentNode.insertBefore(this.rain, opts.before);
    this.look = null;
    this.fit = "contain";
    this.mix = "";
    this.running = false;
    this.frameHandle = 0;
    this.timers = [];
  }

  // look: a looks.js look (or null to stop); fit: the picture setting; mix: a CSS filter on top.
  set(look, fit, mix) {
    const was = this.look;
    this.look = look && look.canvas ? look : null;
    this.fit = fit || "contain";
    this.mix = mix || "";
    if (!this.look) {
      this.stop();
      return;
    }
    if (!was || was.id !== this.look.id) this.setup();
    this.out.style.filter = this.mix || "";
    if (!this.running) this.start();
  }

  setup() {
    const look = this.look;
    const tv = this.out.parentNode;
    const aspect = tv && tv.clientWidth ? tv.clientHeight / tv.clientWidth : 9 / 16;
    if (look.canvas === "ascii") {
      this.cols = COLS;
      this.rows = Math.max(16, Math.round(COLS * aspect * 1.0));
      this.small = canvas(this.cols, this.rows);
      this.band = canvas(this.cols, this.rows);
      this.tint = canvas(this.cols, this.rows);
      const w = this.cols * CELL;
      const h = this.rows * CELL;
      this.out.width = w;
      this.out.height = h;
      this.work = canvas(w, h);
      this.patterns = [];
      for (let k = 1; k <= ASCII_BANDS; k++) this.patterns.push(this.makeTile(k, look.ascii === "matrix" ? MATRIX : GLYPHS));
      const wctx = this.work.getContext("2d");
      this.fills = this.patterns.map(function (p) {
        return wctx.createPattern(p, "repeat");
      });
      this.offsets = this.patterns.map(function () {
        return [0, 0];
      });
      this.out.classList.remove("pix");
      if (look.rain) {
        this.rain.width = w;
        this.rain.height = h;
        this.drops = [];
        for (let c = 0; c < this.cols; c++) this.drops.push(Math.random() < 0.5 ? -Math.floor(Math.random() * this.rows) : Math.floor(Math.random() * this.rows));
      }
    } else {
      const w = PIXEL_WIDE[look.canvas] || 192;
      this.out.width = w;
      this.out.height = Math.max(2, Math.round(w * aspect));
      this.small = this.out;
      this.out.classList.add("pix");
    }
  }

  // One pattern tile for band k: random characters from that band, brighter for brighter bands.
  makeTile(k, sets) {
    const tile = canvas(TILE * CELL, TILE * CELL);
    const ctx = tile.getContext("2d");
    ctx.font = "bold " + (CELL + 2) + "px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255," + (0.45 + (0.55 * k) / ASCII_BANDS).toFixed(2) + ")";
    const set = sets[k - 1];
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) ctx.fillText(pick(set), x * CELL + CELL / 2, y * CELL + CELL / 2 + 1);
    return tile;
  }

  start() {
    const self = this;
    self.running = true;
    const v = self.video;
    const next = function () {
      if (!self.running) return;
      if (v.requestVideoFrameCallback) self.frameHandle = v.requestVideoFrameCallback(frame);
      else self.frameHandle = requestAnimationFrame(frame);
    };
    const frame = function () {
      if (!self.running) return;
      self.draw();
      next();
    };
    next();
    // Things that change without a new video frame: YouTube taking over, the characters shimmering, the
    // rain falling.
    self.timers.push(
      setInterval(function () {
        self.visibility();
      }, 300)
    );
    if (self.look.canvas === "ascii")
      self.timers.push(
        setInterval(function () {
          self.shimmer();
          if (self.video.paused) self.draw();
        }, 140)
      );
    if (self.look.rain)
      self.timers.push(
        setInterval(function () {
          self.fall();
        }, 70)
      );
    self.visibility();
    self.draw();
  }

  stop() {
    this.running = false;
    if (this.frameHandle) {
      if (this.video.cancelVideoFrameCallback) this.video.cancelVideoFrameCallback(this.frameHandle);
      cancelAnimationFrame(this.frameHandle);
    }
    this.frameHandle = 0;
    this.timers.forEach(function (t) {
      clearInterval(t);
    });
    this.timers = [];
    this.out.hidden = true;
    this.rain.hidden = true;
    this.out.style.filter = "";
  }

  showingVideo() {
    const v = this.video;
    return !(this.yt && !this.yt.hidden) && v.readyState >= 2 && v.videoWidth > 0 && getComputedStyle(v).visibility !== "hidden" && v.style.display !== "none";
  }

  visibility() {
    const onVideo = this.showingVideo();
    this.out.hidden = !onVideo;
    // Rain falls over YouTube too: it's our own drawing, laid over the player.
    this.rain.hidden = !(this.look && this.look.rain);
  }

  draw() {
    const look = this.look;
    if (!look || !this.showingVideo()) {
      this.out.hidden = true;
      return;
    }
    this.out.hidden = false;
    const v = this.video;
    const s = this.small.getContext("2d");
    const w = this.small.width;
    const h = this.small.height;
    const r = fitRect(v.videoWidth, v.videoHeight, w, h, this.fit);
    s.filter = "none";
    s.fillStyle = "#000";
    s.fillRect(0, 0, w, h);
    s.imageSmoothingEnabled = true;
    if (PALETTE[look.canvas]) s.filter = PALETTE[look.canvas];
    try {
      s.drawImage(v, r[0], r[1], r[2], r[3]);
    } catch (e) {
      return;
    }
    s.filter = "none";
    if (look.canvas === "ascii") this.drawAscii();
  }

  drawAscii() {
    const look = this.look;
    const o = this.out.getContext("2d");
    const t = this.work.getContext("2d");
    const b = this.band.getContext("2d");
    const W = this.out.width;
    const H = this.out.height;
    o.globalCompositeOperation = "source-over";
    o.clearRect(0, 0, W, H);
    for (let k = 1; k <= ASCII_BANDS; k++) {
      // Which cells are in band k: the small picture through a brightness-band filter.
      b.clearRect(0, 0, this.cols, this.rows);
      b.filter = "url(#ng-band-" + k + ")";
      b.drawImage(this.small, 0, 0);
      b.filter = "none";
      // Band k's characters, cut to those cells.
      const off = this.offsets[k - 1];
      t.globalCompositeOperation = "source-over";
      t.clearRect(0, 0, W, H);
      t.save();
      t.translate(off[0], off[1]);
      t.fillStyle = this.fills[k - 1];
      t.fillRect(-off[0], -off[1], W, H);
      t.restore();
      t.globalCompositeOperation = "destination-in";
      t.imageSmoothingEnabled = false;
      t.drawImage(this.band, 0, 0, W, H);
      o.drawImage(this.work, 0, 0);
    }
    // Color the characters: each cell's own color, or one phosphor color.
    o.globalCompositeOperation = "source-in";
    if (look.ascii === "color") {
      // Brighten the colors at cell size (cheap), then stretch them over the characters.
      const tc = this.tint.getContext("2d");
      tc.filter = "saturate(1.5) brightness(1.35)";
      tc.drawImage(this.small, 0, 0);
      tc.filter = "none";
      o.imageSmoothingEnabled = false;
      o.drawImage(this.tint, 0, 0, W, H);
    } else {
      o.fillStyle = look.ascii === "matrix" ? "#2bff6a" : "#39ff6a";
      o.fillRect(0, 0, W, H);
    }
    o.globalCompositeOperation = "source-over";
  }

  // Shift a few bands' patterns by whole cells, so characters change in place.
  shimmer() {
    if (!this.offsets) return;
    for (let i = 0; i < this.offsets.length; i++) {
      if (Math.random() < 0.5) continue;
      this.offsets[i] = [Math.floor(Math.random() * TILE) * CELL, Math.floor(Math.random() * TILE) * CELL];
    }
  }

  // Matrix rain: bright heads falling down the columns, leaving fading green trails.
  fall() {
    if (!this.drops || this.rain.hidden) return;
    const c = this.rain.getContext("2d");
    const W = this.rain.width;
    const H = this.rain.height;
    c.globalCompositeOperation = "destination-out";
    c.fillStyle = "rgba(0,0,0,0.1)";
    c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = "source-over";
    c.font = "bold " + (CELL + 3) + "px monospace";
    c.textAlign = "center";
    c.textBaseline = "middle";
    for (let x = 0; x < this.drops.length; x++) {
      const y = this.drops[x];
      if (y >= 0 && y < this.rows) {
        c.fillStyle = "#3dff6e";
        c.fillText(pick(RAIN), x * CELL + CELL / 2, (y - 1) * CELL + CELL / 2);
        c.fillStyle = "#f0fff0";
        c.fillText(pick(RAIN), x * CELL + CELL / 2, y * CELL + CELL / 2);
        c.fillText(pick(RAIN), x * CELL + CELL / 2, y * CELL + CELL / 2);
      }
      this.drops[x] = y > this.rows + Math.random() * 30 ? -Math.floor(Math.random() * 20) : y + 1;
    }
  }
}
