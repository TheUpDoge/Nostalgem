// The Reading Room's reader: a book open on a desk under a reading lamp. Pages come from the Internet
// Archive's page images (books.js). On a wide screen it shows two pages like an open book (the cover on
// its own); manga reads right to left. Everything works with a TV remote's arrows and OK, a touch screen
// (tap the edges or swipe) and a keyboard.
//
//   ◀ ▶          turn the page (in the book's direction: on a manga, ◀ goes forward)
//   ▲ ▼          turn the page; in "Fit width", scroll down the page first
//   CH ▲ CH ▼     ten pages on, ten pages back
//   0–9          go to a page (its printed number, when the book has them)
//   OK / MENU    the reader's settings: pages, direction, pairs, paper, volume, close
//   BACK         close the book (it remembers the page)

import { escapeHtml as esc } from "../util.js";
import { pageUrl, viewPages, viewStart, nextView, prevView, pageName, pageForNumber, pickWidth } from "../books.js";

export const MODES = ["auto", "single", "width"];
const MODE_NAMES = { auto: "Open book (two pages)", single: "One page", width: "Fit width (scroll)" };
export const PAPERS = ["day", "sepia", "night"];
const PAPER_NAMES = { day: "Day", sepia: "Sepia", night: "Night" };
const HUD_MS = 2600;

// The rustle of a page turning: a short burst of filtered noise.
let audio = null;
function rustle() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audio) audio = new AC();
    if (audio.state === "suspended") audio.resume();
    const t = audio.currentTime;
    const len = Math.floor(audio.sampleRate * 0.22);
    const buf = audio.createBuffer(1, len, audio.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.6);
    const src = audio.createBufferSource();
    src.buffer = buf;
    const f = audio.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(1100, t + 0.2);
    f.Q.value = 0.7;
    const g = audio.createGain();
    g.gain.value = 0.09;
    src.connect(f);
    f.connect(g);
    g.connect(audio.destination);
    src.start(t);
  } catch (e) {
    /* no sound: the page still turns */
  }
}

export class Reader {
  // el: the #reader element. opts: {
  //   pages(book, v) → Promise<{ count, labels }>: a volume's page count and printed numbers
  //   onMark(id, { v, p, rtl, shift }): where the reader is now (save it)
  //   onPrefs({ mode, paper }): the reader's settings changed (save them)
  //   onClose(): the book was closed
  //   sound(): page-turn sounds on? }
  constructor(el, opts) {
    this.el = el;
    this.o = opts || {};
    this.isOpen = false;
    this.book = null;
    this.v = 0;
    this.p = 0;
    this.count = 0;
    this.labels = [];
    this.mode = "auto";
    this.paper = "day";
    this.rtl = false;
    this.shift = false;
    this.controls = false;
    this.cfocus = 0;
    this.end = false;
    this.typed = "";
    this.typedTimer = 0;
    this.hudTimer = 0;
    this.volToken = 0;
    this.swiped = false;
    this.touch = null;
    const self = this;
    el.addEventListener("click", function (e) {
      self.click(e);
    });
    el.addEventListener(
      "touchstart",
      function (e) {
        const t = e.touches && e.touches.length === 1 ? e.touches[0] : null;
        self.touch = t ? { x: t.clientX, y: t.clientY } : null;
      },
      { passive: true }
    );
    el.addEventListener(
      "touchend",
      function (e) {
        const s = self.touch;
        self.touch = null;
        const t = e.changedTouches && e.changedTouches[0];
        if (!s || !t || self.controls) return;
        const dx = t.clientX - s.x;
        const dy = t.clientY - s.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          self.swiped = true;
          // A swipe drags the page: finger to the left shows what's to the right.
          self.handle({ type: dx < 0 ? "right" : "left" });
        }
      },
      { passive: true }
    );
    window.addEventListener("resize", function () {
      if (self.isOpen) self.render();
    });
  }

  // book: books.js bookFromMetadata(); mark: { v, p, rtl, shift } to open at; prefs: { mode, paper }.
  open(book, mark, prefs) {
    this.book = book;
    this.isOpen = true;
    const m = mark || {};
    this.v = Math.min(Math.max(0, m.v | 0), Math.max(0, book.volumes.length - 1));
    this.p = Math.max(0, m.p | 0);
    this.rtl = typeof m.rtl === "boolean" ? m.rtl : !!book.rtl;
    this.shift = !!m.shift;
    const pr = prefs || {};
    this.mode = MODES.indexOf(pr.mode) >= 0 ? pr.mode : "auto";
    this.paper = PAPERS.indexOf(pr.paper) >= 0 ? pr.paper : "day";
    this.controls = false;
    this.end = false;
    this.typed = "";
    this.el.hidden = false;
    this.el.innerHTML =
      '<div class="rd-room">' +
      '<div class="rd-lamp" aria-hidden="true"><i class="rd-shade"></i><i class="rd-glow"></i></div>' +
      '<div class="rd-stage"><div class="rd-pages"></div></div>' +
      '<div class="rd-head"><span class="rd-title"></span><span class="rd-badge"></span></div>' +
      '<div class="rd-folio"></div>' +
      '<div class="rd-progress"><i></i></div>' +
      '<div class="rd-hint">◀ ▶ turn · OK settings · BACK close</div>' +
      '<div class="rd-end" hidden></div>' +
      '<div class="rd-controls" hidden></div>' +
      '<div class="rd-osd" hidden></div>' +
      '<button type="button" class="rd-close" aria-label="Close the book">✕</button>' +
      "</div>";
    this.loadVolume(this.v, this.p);
  }

  close() {
    if (!this.isOpen) return;
    this.mark();
    this.isOpen = false;
    clearTimeout(this.hudTimer);
    clearTimeout(this.typedTimer);
    this.el.hidden = true;
    this.el.innerHTML = "";
    this.book = null;
    if (this.o.onClose) this.o.onClose();
  }

  // Open volume v at page p: show it right away, and fill in the page count when it arrives.
  loadVolume(v, p) {
    const self = this;
    const token = ++this.volToken;
    this.v = v;
    this.p = Math.max(0, p | 0);
    this.count = this.book.volumes.length <= 1 && this.book.pages > 0 ? this.book.pages : 0;
    this.labels = [];
    this.end = false;
    this.render();
    this.hud();
    if (!this.o.pages) return;
    Promise.resolve(this.o.pages(this.book, v))
      .then(function (info) {
        if (token !== self.volToken || !self.isOpen || !info || !(info.count > 0)) return;
        self.count = info.count;
        self.labels = info.labels || [];
        if (self.p >= self.count) self.p = viewStart(self.count - 1, self.two(), self.shift);
        self.render();
      })
      .catch(function () {
        /* no page list: the pages still turn, and the end shows when there are no more */
      });
  }

  stem() {
    const vol = this.book.volumes[this.v];
    return vol ? vol.stem : "";
  }

  two() {
    if (this.mode !== "auto") return false;
    const w = this.el.clientWidth || window.innerWidth;
    const h = this.el.clientHeight || window.innerHeight;
    return w / Math.max(1, h) >= 1.15;
  }

  view() {
    return viewPages(this.p, this.count, this.two(), this.shift);
  }

  // How wide a page image to ask for, for this screen.
  width() {
    const w = this.el.clientWidth || window.innerWidth || 1280;
    const h = this.el.clientHeight || window.innerHeight || 720;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let px;
    if (this.mode === "width") px = w * 0.92;
    else if (this.two()) px = Math.min(w * 0.46, h * 0.68);
    else px = Math.min(w * 0.92, h * 0.68);
    return pickWidth(px * dpr);
  }

  url(k) {
    return pageUrl(this.book.id, this.stem(), k, this.width(), this.book);
  }

  render(dir) {
    if (!this.isOpen) return;
    const self = this;
    const root = this.el.querySelector(".rd-room");
    const stage = this.el.querySelector(".rd-stage");
    const box = this.el.querySelector(".rd-pages");
    if (!root || !box) return;
    const two = this.two();
    const view = this.view();
    const order = this.rtl ? view.slice().reverse() : view;
    root.className = "rd-room paper-" + this.paper + " mode-" + this.mode + (two ? " two" : "") + (this.rtl ? " rtl" : "");
    box.className = "rd-pages" + (view.length === 2 ? " spread" : "") + (dir ? " turn-" + dir : "");
    let html = "";
    order.forEach(function (k, i) {
      const ribbon = i === order.length - 1 ? '<span class="rd-ribbon" aria-hidden="true"></span>' : "";
      html += '<figure class="rd-page" data-k="' + k + '"><span class="rd-sheet">' + ribbon + '<img alt="" src="' + esc(self.url(k)) + '"></span><figcaption>turning to page ' + esc(pageName(k)) + "…</figcaption></figure>";
    });
    box.innerHTML = html;
    Array.prototype.forEach.call(box.querySelectorAll(".rd-page"), function (fig) {
      const img = fig.querySelector("img");
      const k = Number(fig.getAttribute("data-k"));
      img.addEventListener("load", function () {
        fig.classList.add("ok");
      });
      img.addEventListener("error", function () {
        self.pageFailed(k, fig);
      });
    });
    if (this.mode === "width" && stage) stage.scrollTop = dir === "back" ? stage.scrollHeight : 0;
    this.paintHud();
    this.paintControls();
    this.preload();
  }

  // A page that won't load past the last known one is the end of the book.
  pageFailed(k, fig) {
    if (!this.isOpen) return;
    if (!this.count && k > 0) {
      this.count = k;
      const view = this.view();
      if (view[0] >= k) {
        this.p = viewStart(k - 1, this.two(), this.shift);
        this.render();
        this.showEnd();
      } else this.render();
      return;
    }
    fig.classList.add("bad");
    const cap = fig.querySelector("figcaption");
    if (cap) cap.textContent = "This page didn't load. OK ▸ Settings, or turn the page.";
  }

  preload() {
    const two = this.two();
    const pages = [];
    let n = nextView(this.p, this.count, two, this.shift);
    for (let i = 0; i < 2 && n >= 0; i++) {
      viewPages(n, this.count, two, this.shift).forEach(function (k) {
        pages.push(k);
      });
      n = nextView(n, this.count, two, this.shift);
    }
    const b = prevView(this.p, two, this.shift);
    if (b >= 0) pages.push(b);
    const self = this;
    pages.forEach(function (k) {
      const img = new Image();
      img.src = self.url(k);
    });
  }

  hud() {
    const root = this.el.querySelector(".rd-room");
    if (!root) return;
    root.classList.add("hud");
    clearTimeout(this.hudTimer);
    const self = this;
    this.hudTimer = setTimeout(function () {
      if (!self.controls && root.parentNode) root.classList.remove("hud");
    }, HUD_MS);
  }

  paintHud() {
    const b = this.book;
    const view = this.view();
    const vols = b.volumes.length;
    const where = view.map(pageName).join("–");
    const t = this.el.querySelector(".rd-title");
    if (t) t.textContent = b.title + (vols > 1 && b.volumes[this.v] ? " · " + b.volumes[this.v].title : "");
    const badge = this.el.querySelector(".rd-badge");
    if (badge) badge.textContent = this.rtl ? "右→左 MANGA ORDER" : "";
    const folio = this.el.querySelector(".rd-folio");
    if (folio) folio.textContent = (view.length > 1 ? "pp. " : "p. ") + where + (this.count ? " of " + this.count : "") + (vols > 1 ? " · vol. " + (this.v + 1) + " of " + vols : "");
    const bar = this.el.querySelector(".rd-progress i");
    if (bar) {
      const at = this.count ? Math.min(1, (view[view.length - 1] + 1) / this.count) : 0;
      bar.style.width = (at * 100).toFixed(1) + "%";
      bar.parentNode.classList.toggle("rtl", this.rtl);
    }
  }

  // ---------- turning ----------
  forward() {
    if (this.end) return this.endOk();
    const n = nextView(this.p, this.count, this.two(), this.shift);
    if (n < 0) return this.showEnd();
    this.p = n;
    this.turned("next");
  }

  back() {
    if (this.end) {
      this.hideEnd();
      return;
    }
    const b = prevView(this.p, this.two(), this.shift);
    if (b < 0) {
      this.hud();
      return;
    }
    this.p = b;
    this.turned("back");
  }

  jump(delta) {
    const two = this.two();
    let p = Math.max(0, this.p + delta);
    if (this.count) p = Math.min(this.count - 1, p);
    this.p = viewStart(p, two, this.shift);
    this.end = false;
    this.hideEnd();
    this.turned(delta > 0 ? "next" : "back");
  }

  turned(dir) {
    if (this.o.sound && this.o.sound()) rustle();
    this.render(dir);
    this.hud();
    this.mark();
  }

  mark() {
    if (this.book && this.o.onMark) this.o.onMark(this.book.id, { v: this.v, p: this.p, rtl: this.rtl, shift: this.shift });
  }

  // The end of a volume: on to the next, or the end of the book.
  showEnd() {
    this.end = true;
    const el = this.el.querySelector(".rd-end");
    if (!el) return;
    const more = this.v + 1 < this.book.volumes.length;
    el.innerHTML =
      '<div class="rd-end-box">' +
      '<div class="rd-end-title">' +
      (more ? "END OF VOLUME " + (this.v + 1) : "THE END") +
      "</div>" +
      '<div class="rd-end-sub">' +
      esc(more ? "Next: " + this.book.volumes[this.v + 1].title : this.book.title) +
      "</div>" +
      '<div class="rd-end-row">' +
      '<button type="button" class="rd-btn focus" data-end="ok">' +
      (more ? "▶ Volume " + (this.v + 2) : "Close the book") +
      "</button>" +
      '<button type="button" class="rd-btn" data-end="back">◀ Back a page</button>' +
      "</div>" +
      (more ? "" : '<div class="rd-end-hint">Return it in Menu ▸ 📚 Reading Room when you\'re done.</div>') +
      "</div>";
    el.hidden = false;
  }

  hideEnd() {
    this.end = false;
    const el = this.el.querySelector(".rd-end");
    if (el) {
      el.hidden = true;
      el.innerHTML = "";
    }
  }

  endOk() {
    if (this.v + 1 < this.book.volumes.length) {
      this.loadVolume(this.v + 1, 0);
      this.mark();
    } else this.close();
  }

  // ---------- settings ----------
  items() {
    const self = this;
    const vols = this.book.volumes.length;
    const list = [
      {
        label: "Pages",
        value: MODE_NAMES[this.mode],
        step: function (d) {
          self.mode = MODES[(MODES.indexOf(self.mode) + d + MODES.length) % MODES.length];
          self.p = viewStart(self.p, self.two(), self.shift);
          self.prefs();
        },
      },
      {
        label: "Reading",
        value: this.rtl ? "Right to left (manga)" : "Left to right",
        step: function () {
          self.rtl = !self.rtl;
          self.mark();
        },
      },
    ];
    if (this.two()) {
      list.push({
        label: "Pairs",
        value: this.shift ? "Shifted by one" : "Cover on its own",
        step: function () {
          self.shift = !self.shift;
          self.p = viewStart(self.p, true, self.shift);
          self.mark();
        },
      });
    }
    list.push({
      label: "Paper",
      value: PAPER_NAMES[this.paper],
      step: function (d) {
        self.paper = PAPERS[(PAPERS.indexOf(self.paper) + d + PAPERS.length) % PAPERS.length];
        self.prefs();
      },
    });
    if (vols > 1) {
      list.push({
        label: "Volume",
        value: this.v + 1 + " of " + vols + " · " + this.book.volumes[this.v].title,
        step: function (d) {
          const v = (self.v + d + vols) % vols;
          self.loadVolume(v, 0);
          self.mark();
        },
      });
    }
    list.push({
      label: "Go to page",
      value: "type the number",
      ok: function () {
        self.closeControls();
        self.osd("Go to page: type the number");
      },
    });
    list.push({
      label: "Close the book",
      value: "",
      ok: function () {
        self.close();
      },
    });
    return list;
  }

  prefs() {
    if (this.o.onPrefs) this.o.onPrefs({ mode: this.mode, paper: this.paper });
  }

  openControls() {
    this.controls = true;
    this.cfocus = 0;
    const root = this.el.querySelector(".rd-room");
    if (root) root.classList.add("hud");
    this.paintControls();
  }

  closeControls() {
    this.controls = false;
    this.paintControls();
    this.hud();
  }

  paintControls() {
    const el = this.el.querySelector(".rd-controls");
    if (!el) return;
    if (!this.controls) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    const f = this.cfocus;
    let html = '<div class="rd-c-title">📖 Reader</div>';
    this.items().forEach(function (it, i) {
      html +=
        '<div class="rd-c-item' +
        (i === f ? " focus" : "") +
        '" data-c="' +
        i +
        '"><span class="l">' +
        esc(it.label) +
        "</span>" +
        (it.value ? '<span class="v">' + (it.step ? "‹ " : "") + esc(it.value) + (it.step ? " ›" : "") + "</span>" : "") +
        "</div>";
    });
    html += '<div class="rd-c-hint">▲▼ choose · ◀▶ change · BACK done</div>';
    el.innerHTML = html;
    el.hidden = false;
  }

  controlAction(a) {
    const list = this.items();
    const it = list[this.cfocus];
    switch (a.type) {
      case "up":
        this.cfocus = (this.cfocus - 1 + list.length) % list.length;
        break;
      case "down":
        this.cfocus = (this.cfocus + 1) % list.length;
        break;
      case "left":
      case "right":
        if (it && it.step) {
          it.step(a.type === "left" ? -1 : 1);
          this.render();
        }
        break;
      case "ok":
        if (it && it.ok) {
          it.ok();
          return;
        }
        if (it && it.step) {
          it.step(1);
          this.render();
        }
        break;
      case "back":
      case "menu":
        this.closeControls();
        return;
      default:
        return;
    }
    if (this.isOpen) this.paintControls();
  }

  // ---------- typed page numbers ----------
  osd(text) {
    const el = this.el.querySelector(".rd-osd");
    if (!el) return;
    el.textContent = text;
    el.hidden = !text;
  }

  digit(d) {
    const self = this;
    this.typed = (this.typed + String(d)).slice(-4);
    this.osd("Go to page " + this.typed + "_");
    clearTimeout(this.typedTimer);
    this.typedTimer = setTimeout(function () {
      self.goTyped();
    }, 1400);
  }

  goTyped() {
    clearTimeout(this.typedTimer);
    const k = pageForNumber(this.typed, this.count);
    this.typed = "";
    this.osd("");
    if (k < 0) return;
    this.hideEnd();
    const before = this.p;
    this.p = viewStart(k, this.two(), this.shift);
    this.turned(this.p >= before ? "next" : "back");
  }

  // ---------- input ----------
  // Remote actions. Returns true when the reader used it (it uses everything while open).
  handle(a) {
    if (!this.isOpen) return false;
    const t = a.type;
    if (this.controls) {
      this.controlAction(a);
      return true;
    }
    if (t === "digit") {
      this.digit(a.digit);
      return true;
    }
    if (this.typed && t === "ok") {
      this.goTyped();
      return true;
    }
    if (this.typed && t === "back") {
      clearTimeout(this.typedTimer);
      this.typed = "";
      this.osd("");
      return true;
    }
    const fwd = this.rtl ? "left" : "right";
    const bwd = this.rtl ? "right" : "left";
    if (t === fwd) this.forward();
    else if (t === bwd) this.back();
    else if (t === "down") this.scrollOr(1);
    else if (t === "up") this.scrollOr(-1);
    else if (t === "chup") this.jump(10);
    else if (t === "chdown") this.jump(-10);
    else if (t === "ok" || t === "menu") {
      if (this.end) this.endOk();
      else this.openControls();
    } else if (t === "info") this.hud();
    else if (t === "back") {
      if (this.end) this.hideEnd();
      else this.close();
    }
    return true;
  }

  // ▲▼: in Fit width, scroll down the page before turning it.
  scrollOr(dir) {
    const stage = this.el.querySelector(".rd-stage");
    if (this.mode === "width" && stage && !this.end) {
      const room = stage.scrollHeight - stage.clientHeight;
      if ((dir > 0 && stage.scrollTop < room - 4) || (dir < 0 && stage.scrollTop > 4)) {
        stage.scrollTop = Math.max(0, Math.min(room, stage.scrollTop + dir * stage.clientHeight * 0.45));
        return;
      }
    }
    if (dir > 0) this.forward();
    else this.back();
  }

  click(e) {
    if (!this.isOpen) return;
    if (this.swiped) {
      this.swiped = false;
      return;
    }
    const tgt = e.target;
    const near = function (sel) {
      return tgt.closest ? tgt.closest(sel) : null;
    };
    if (near(".rd-close")) {
      this.close();
      return;
    }
    const end = near("[data-end]");
    if (end) {
      if (end.getAttribute("data-end") === "ok") this.endOk();
      else this.back();
      return;
    }
    const c = near("[data-c]");
    if (c) {
      this.cfocus = Number(c.getAttribute("data-c"));
      this.controlAction({ type: "ok" });
      return;
    }
    if (near(".rd-controls")) return;
    if (this.controls) {
      this.closeControls();
      return;
    }
    // The edges turn the page, the middle opens the settings.
    const w = this.el.clientWidth || window.innerWidth;
    const x = e.clientX;
    if (x < w * 0.3) this.handle({ type: "left" });
    else if (x > w * 0.7) this.handle({ type: "right" });
    else this.handle({ type: "ok" });
  }

  // For tests and the app's state.
  state() {
    if (!this.isOpen) return { open: false };
    return { open: true, id: this.book.id, v: this.v, p: this.p, view: this.view(), count: this.count, rtl: this.rtl, mode: this.mode, paper: this.paper, two: this.two(), controls: this.controls, end: this.end };
  }
}
