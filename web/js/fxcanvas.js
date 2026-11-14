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
//                         "666" draws the numbers of the beast, crosses and stars instead, each band in
//                         its own grey, red or white.
//   glass                 stained glass: the picture drawn tiny, one pixel per pane, and each pane of an
//                         irregular window (a Voronoi diagram) filled with its pixel's color, in jewel
//                         tones. The lead between the panes is drawn once, on the layer above, so it
//                         shows over YouTube too.
//   filter                the light version of any SVG look (Menu ▸ Filter quality): the filter runs on
//                         a small copy of each frame instead of the whole screen, which is far less work
//                         for a TV, and the graphics chip scales it back up.
//
// Drawing another site's video onto a canvas is allowed; reading its pixels isn't, and nothing here
// reads them. YouTube's player can't be drawn at all, so it keeps the CSS versions (looks.js).

import { ASCII_BANDS } from "./looks.js";

const COLS = 128; // ASCII cells across; rows follow the screen's shape
const CELL = 8; // pixels per cell on the ASCII canvas (the screen scales it up)
const LITE_COLS = 88; // ASCII cells across in the light version
const PIXEL_WIDE = { pixel: 192, "8bit": 240, gameboy: 160 };
const FILTER_WIDE = 640; // the light version of an SVG look runs at this width
const PALETTE = { "8bit": "url(#ng-pal-8bit)", gameboy: "url(#ng-pal-gameboy)" };
const GLASS_WIDE = 480; // the panes are drawn at this width
const GLASS_COLS = 26; // panes across
const LITE_GLASS_COLS = 17; // panes across in the light version
const GLASS_MS = 66; // a new picture in the glass at most this often
const LITE_GLASS_MS = 125;
const GLASS_SEED = 111; // the same window every time
// A TV's limits (main.js turns them on in the TV app and TV browsers; a computer has none). Measured on a
// TV-sized screen with the processor slowed 4× (the TV performance PR has the numbers): ASCII at 128
// characters across, redrawn with every frame of the film, kept a TV's processor busy all the time (0.4–4
// frames a second, the remote waiting behind it). On a TV it has 80 square characters across, an old
// terminal's width, and a new picture at most 10 times a second; stained glass a new picture 8 times a
// second (its cost is the pictures, not the panes: fewer panes or no filter changed nothing); the light
// version of an SVG look is drawn 400 pixels wide instead of 640 (it's always the light tier: on a TV the
// light version is where an SVG look starts, main.js lookIsLite).
const TV_LIMITS = { asciiCols: 80, asciiMs: 100, glassMs: 125, filterWide: 480 };
// …and on a TV that still struggles (Filter quality: Light, or Auto after the frame-rate watch spoke up).
const TV_LITE_LIMITS = { asciiCols: 64, asciiMs: 150, glassMs: 250, glassCols: 17, filterWide: 400 };
// The light through the window: the picture brightened and mostly gray, then each pane's own glass color on
// top (multiplied, as light through colored glass is), so black-and-white films come out in colors too.
const GLASS_LIGHT = "grayscale(0.55) contrast(1.35) brightness(1.5) saturate(1.5)";
const GLASS_COLORS = ["#ff3b4a", "#e0303c", "#3b6bff", "#2f4fe0", "#2fe07a", "#ffc53b", "#ffb02e", "#b45cff", "#3be0ff", "#fff1d0", "#fff1d0"];

// Characters for each band, sparse to dense. Matrix uses half-width katakana and digits.
const GLYPHS = [".,`'", ":;-'", "=~+-", "+*<>x", "#X%&$", "@#M%W"];
const MATRIX = ["..:", ":ｰﾊ", "ﾐﾋｰ1", "ｳｼﾅﾓﾆ7", "ｻﾜﾂｵﾘｱ3", "ﾎﾃﾏｹﾒｴｶｷ0"];
// Katakana where the TV has the font (Android TVs do), digits and symbols everywhere.
const RAIN = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789Z:=*+<>|";
const TILE = 16; // a pattern tile is TILE × TILE cells of random characters
// 666: what each band (dark to bright) writes, and in what color. A token takes a cell per character.
const HELL = [
  { t: ["*"], c: "#575757" },
  { t: ["†", "*"], c: "#9a9a9a" },
  { t: ["999"], c: "#8c0010" },
  { t: ["666"], c: "#d10019" },
  { t: ["666", "†"], c: "#ff3030" },
  { t: ["666", "†", "999"], c: "#ffffff" },
];

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

// A small random-number source with a seed, so the window is laid out the same way every time.
function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The part of polygon poly that is nearer point a than point b.
function nearer(poly, a, b) {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const nx = b[0] - a[0];
  const ny = b[1] - a[1];
  const out = [];
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k];
    const q = poly[(k + 1) % poly.length];
    const sp = (p[0] - mx) * nx + (p[1] - my) * ny;
    const sq = (q[0] - mx) * nx + (q[1] - my) * ny;
    if (sp <= 0) out.push(p);
    if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

// A stained-glass window over a W × H picture: cols × rows irregular panes, each the area nearest one point
// of a jittered grid (a Voronoi diagram). Pane (i, j) takes its color from pixel (i, j) of the picture drawn
// cols × rows small. Returns [{ i, j, pts: [[x, y], …], cx, cy (its point), x, y, w, h (its box) }].
export function glassPanes(cols, rows, W, H, seed) {
  const rnd = seeded(seed || 1);
  const cw = W / cols;
  const ch = H / rows;
  const at = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) at.push([(i + 0.5 + (rnd() - 0.5) * 0.72) * cw, (j + 0.5 + (rnd() - 0.5) * 0.72) * ch]);
  const panes = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const p = at[j * cols + i];
      const x0 = Math.max(0, p[0] - 2.5 * cw);
      const x1 = Math.min(W, p[0] + 2.5 * cw);
      const y0 = Math.max(0, p[1] - 2.5 * ch);
      const y1 = Math.min(H, p[1] + 2.5 * ch);
      let poly = [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ];
      for (let dj = -2; dj <= 2; dj++) {
        for (let di = -2; di <= 2; di++) {
          const ni = i + di;
          const nj = j + dj;
          if ((!di && !dj) || ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
          poly = nearer(poly, p, at[nj * cols + ni]);
        }
      }
      let bx0 = W;
      let by0 = H;
      let bx1 = 0;
      let by1 = 0;
      poly.forEach(function (q) {
        bx0 = Math.min(bx0, q[0]);
        by0 = Math.min(by0, q[1]);
        bx1 = Math.max(bx1, q[0]);
        by1 = Math.max(by1, q[1]);
      });
      panes.push({ i: i, j: j, pts: poly, cx: p[0], cy: p[1], x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 });
    }
  }
  return panes;
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
    this.tv = false;
    this.limits = {};
    this.lastPicture = 0;
    this.pictures = 0; // pictures drawn (tests)
  }

  // On a TV: the limits above (main.js). more: changes to them, for measuring (?perf=asciiCols:64,…).
  setTv(on, more) {
    this.tv = !!on;
    this.more = more || null;
    this.setupKey = "";
  }

  // The player swapped in a fresh <video> (after a church film, player.js): draw from that one.
  setVideo(el) {
    if (!el || el === this.video) return;
    const was = this.running;
    this.stop();
    this.video = el;
    if (was && this.look) this.start();
  }

  // look: a looks.js look (or null to stop), or { id, canvas: "filter", filter: "<CSS filter>" } for the
  // light version of an SVG look; fit: the picture setting; mix: a CSS filter on top; lite: fewer ASCII
  // characters, fewer and slower panes of glass.
  set(look, fit, mix, lite) {
    const was = this.setupKey;
    this.look = look && look.canvas ? look : null;
    this.fit = fit || "contain";
    this.mix = mix || "";
    this.lite = !!lite;
    this.limits = this.tv ? Object.assign({}, this.lite ? TV_LITE_LIMITS : TV_LIMITS, this.more) : {};
    if (!this.look) {
      this.setupKey = "";
      this.stop();
      return;
    }
    this.setupKey = this.look.id + (this.lite ? ":lite" : "") + (this.tv ? ":tv" : "") + (this.look.filter ? ":" + this.look.filter : "");
    if (was !== this.setupKey) {
      this.stop();
      this.setup();
    }
    this.out.style.filter = this.mix || "";
    if (!this.running) this.start();
  }

  setup() {
    const look = this.look;
    const tv = this.out.parentNode;
    const aspect = tv && tv.clientWidth ? tv.clientHeight / tv.clientWidth : 9 / 16;
    this.drops = null;
    this.offsets = null;
    this.panes = null;
    if (look.canvas === "ascii") {
      this.cols = this.limits.asciiCols || (this.lite ? LITE_COLS : COLS);
      // On a TV, fewer characters in both directions (square cells); elsewhere the rows of the full grid.
      this.rows = this.limits.asciiCols ? Math.max(12, Math.round(this.cols * aspect)) : Math.max(16, Math.round(COLS * aspect * 1.0));
      this.small = canvas(this.cols, this.rows);
      this.band = canvas(this.cols, this.rows);
      this.tint = canvas(this.cols, this.rows);
      const w = this.cols * CELL;
      const h = this.rows * CELL;
      this.out.width = w;
      this.out.height = h;
      this.work = canvas(w, h);
      this.patterns = [];
      for (let k = 1; k <= ASCII_BANDS; k++) this.patterns.push(look.ascii === "666" ? this.makeHellTile(k) : this.makeTile(k, look.ascii === "matrix" ? MATRIX : GLYPHS));
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
    } else if (look.canvas === "glass") {
      this.setupGlass(aspect);
    } else if (look.canvas === "filter") {
      const fw = this.limits.filterWide || FILTER_WIDE;
      this.out.width = fw;
      this.out.height = Math.max(2, Math.round(fw * aspect));
      this.small = this.out;
      this.out.classList.remove("pix");
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

  // 666: band k's tokens laid end to end along each row, in the band's own color.
  makeHellTile(k) {
    const band = HELL[Math.min(HELL.length, k) - 1];
    const tile = canvas(TILE * CELL, TILE * CELL);
    const ctx = tile.getContext("2d");
    ctx.font = "bold " + (CELL + 2) + "px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = band.c;
    for (let y = 0; y < TILE; y++) {
      let row = "";
      while (row.length < TILE) row += band.t[Math.floor(Math.random() * band.t.length)];
      for (let x = 0; x < TILE; x++) ctx.fillText(row.charAt(x), x * CELL + CELL / 2, y * CELL + CELL / 2 + 1);
    }
    return tile;
  }

  // Stained glass: the panes, one pixel each on a tiny canvas, and the lead and the light on the layer above.
  setupGlass(aspect) {
    const W = GLASS_WIDE;
    const H = Math.max(2, Math.round(W * aspect));
    const cols = this.limits.glassCols || (this.lite ? LITE_GLASS_COLS : GLASS_COLS);
    const rows = Math.max(6, Math.round(cols * aspect * 1.05));
    this.out.width = W;
    this.out.height = H;
    this.out.classList.remove("pix");
    this.small = canvas(cols, rows);
    this.panes = glassPanes(cols, rows, W, H, GLASS_SEED);
    // Each pane's glass, one pixel each: no two neighbors alike.
    this.hues = canvas(cols, rows);
    const hc = this.hues.getContext("2d");
    const rnd = seeded(GLASS_SEED + 1);
    const picked = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        let c = 0;
        for (let tries = 0; tries < 8; tries++) {
          c = Math.floor(rnd() * GLASS_COLORS.length);
          const left = i ? picked[j * cols + i - 1] : -1;
          const up = j ? picked[(j - 1) * cols + i] : -1;
          if (GLASS_COLORS[c] !== GLASS_COLORS[left] && GLASS_COLORS[c] !== GLASS_COLORS[up]) break;
        }
        picked.push(c);
        hc.fillStyle = GLASS_COLORS[c];
        hc.fillRect(i, j, 1, 1);
      }
    }
    let size = 0;
    this.panes.forEach(function (p) {
      p.path = new Path2D();
      p.pts.forEach(function (q, k) {
        if (k) p.path.lineTo(q[0], q[1]);
        else p.path.moveTo(q[0], q[1]);
      });
      p.path.closePath();
      size = Math.max(size, p.w, p.h);
    });
    this.paneSize = Math.ceil(size) + 2;
    this.lastGlass = 0;
    this.drawLead(aspect);
  }

  // The lead between the panes, each pane a little darker at its edges, and light coming in from above.
  // Drawn once, at about the screen's own size so the lines stay sharp.
  drawLead(aspect) {
    const tv = this.out.parentNode;
    const LW = Math.max(640, Math.min(1920, (tv && tv.clientWidth) || 1280));
    const LH = Math.round(LW * aspect);
    const k = LW / this.out.width;
    const c = this.rain.getContext("2d");
    this.rain.width = LW;
    this.rain.height = LH;
    c.clearRect(0, 0, LW, LH);
    const trace = function (p) {
      c.beginPath();
      p.pts.forEach(function (q, n) {
        if (n) c.lineTo(q[0] * k, q[1] * k);
        else c.moveTo(q[0] * k, q[1] * k);
      });
      c.closePath();
    };
    this.panes.forEach(function (p) {
      const r = Math.max(p.w, p.h) * k * 0.75;
      const g = c.createRadialGradient(p.cx * k, p.cy * k, r * 0.15, p.cx * k, p.cy * k, r);
      g.addColorStop(0, "rgba(255,250,235,0.10)");
      g.addColorStop(0.6, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.30)");
      c.fillStyle = g;
      trace(p);
      c.fill();
    });
    const light = c.createLinearGradient(0, 0, LW * 0.3, LH);
    light.addColorStop(0, "rgba(255,236,190,0.16)");
    light.addColorStop(0.5, "rgba(255,236,190,0)");
    c.fillStyle = light;
    c.fillRect(0, 0, LW, LH);
    const lead = Math.max(3, LW / 300);
    c.lineJoin = "round";
    c.strokeStyle = "#17120d";
    c.lineWidth = lead;
    this.panes.forEach(function (p) {
      trace(p);
      c.stroke();
    });
    // A glint along the top of each lead line.
    c.strokeStyle = "rgba(255,255,255,0.10)";
    c.lineWidth = Math.max(1, lead / 3);
    c.save();
    c.translate(-lead / 4, -lead / 4);
    this.panes.forEach(function (p) {
      trace(p);
      c.stroke();
    });
    c.restore();
    // The window's frame.
    c.strokeStyle = "#17120d";
    c.lineWidth = lead * 2.5;
    c.strokeRect(0, 0, LW, LH);
  }

  // Each pane in its pixel's color: the tiny picture as a pattern, scaled up so that pixel covers the pane.
  drawGlass() {
    const o = this.out.getContext("2d");
    const K = this.paneSize;
    const small = this.small;
    o.imageSmoothingEnabled = false;
    o.fillStyle = "#000";
    o.fillRect(0, 0, this.out.width, this.out.height);
    const pat = typeof DOMMatrix === "function" ? o.createPattern(small, "no-repeat") : null;
    if (pat && pat.setTransform) {
      this.panes.forEach(function (p) {
        pat.setTransform(new DOMMatrix([K, 0, 0, K, p.x - p.i * K, p.y - p.j * K]));
        o.fillStyle = pat;
        o.fill(p.path);
      });
      return;
    }
    this.panes.forEach(function (p) {
      o.save();
      o.clip(p.path);
      o.drawImage(small, p.i, p.j, 1, 1, p.x, p.y, K, K);
      o.restore();
    });
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
    // Rain falls over YouTube too, and the lead of the stained glass stays: they're our own drawing, laid
    // over the player.
    this.rain.hidden = !(this.look && (this.look.rain || this.look.canvas === "glass"));
  }

  draw() {
    const look = this.look;
    if (!look || !this.showingVideo()) {
      this.out.hidden = true;
      return;
    }
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (look.canvas === "glass") {
      // Glass doesn't need every frame: a TV has better things to do.
      if (now - this.lastGlass < (this.limits.glassMs || (this.lite ? LITE_GLASS_MS : GLASS_MS)) && !this.video.paused) return;
      this.lastGlass = now;
    }
    // On a TV, ASCII needn't follow every frame of the film: its characters shimmer on their own clock.
    if (look.canvas === "ascii" && this.limits.asciiMs) {
      if (now - this.lastPicture < this.limits.asciiMs && !this.video.paused) return;
      this.lastPicture = now;
    }
    this.out.hidden = false;
    this.pictures++;
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
    else if (look.canvas === "filter") s.filter = look.filter;
    else if (look.canvas === "glass") s.filter = GLASS_LIGHT;
    try {
      s.drawImage(v, r[0], r[1], r[2], r[3]);
    } catch (e) {
      return;
    }
    s.filter = "none";
    if (look.canvas === "ascii") this.drawAscii();
    else if (look.canvas === "glass") {
      s.globalCompositeOperation = "multiply";
      s.drawImage(this.hues, 0, 0);
      s.globalCompositeOperation = "source-over";
      this.drawGlass();
    }
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
    // 666's characters come in their own colors.
    if (look.ascii === "666") return;
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
