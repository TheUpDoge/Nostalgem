// The TV guide: channels down the side, time across the top, the focused program described above.
// ▲▼ moves between channels, ◀▶ moves through time, OK tunes in.

import { programsBetween } from "../schedule.js";
import { thumbUrl } from "../archive.js";
import { isYouTube, videoIdOf, ytThumb } from "../youtube.js";
import { escapeHtml as esc, fmtClock, pad2, clamp } from "../util.js";
import { programMeta, hintsHtml, LOGO } from "./views.js";

const HALF_HOUR = 30 * 60 * 1000;
const MAX_AHEAD = 24 * 3600 * 1000;

function floor30(ms) {
  return Math.floor(ms / HALF_HOUR) * HALF_HOUR;
}

// Programs under 12 minutes (ads, cartoons, newsreels, classroom films) would be slivers. Consecutive short ones that start
// in the same half hour share one cell. Blocks follow the clock, so they don't move as the guide scrolls.
const SHORT = 12 * 60 * 1000;
export function guideCells(tl, fromMs, toMs) {
  const cells = [];
  programsBetween(tl, fromMs, toMs, 400).forEach(function (p) {
    const short = p.slotEndMs - p.startMs < SHORT;
    const last = cells[cells.length - 1];
    if (short && last && last.short && floor30(last.startMs) === floor30(p.startMs)) {
      last.progs.push(p);
      last.slotEndMs = p.slotEndMs;
    } else cells.push({ short: short, startMs: p.startMs, slotEndMs: p.slotEndMs, progs: [p] });
  });
  return cells;
}

// deps: { channels(), timeline(ch), tunedSlug(), isFav(slug), about(id), clock24(), onTune(ch, prog) }
export class Guide {
  constructor(root, deps) {
    this.root = root;
    this.deps = deps;
    this.isOpen = false;
    this.row = 0;
    this.top = 0;
    this.rowsVisible = 5;
    this.focusTime = 0;
    this.winStart = 0;
    const self = this;
    root.addEventListener("click", function (e) {
      const cell = e.target.closest ? e.target.closest("[data-row]") : null;
      if (!cell) return;
      self.row = Number(cell.getAttribute("data-row"));
      if (cell.hasAttribute("data-t")) self.focusTime = Number(cell.getAttribute("data-t"));
      self.render();
      self.select();
    });
  }

  winLen() {
    return window.innerWidth < window.innerHeight ? HALF_HOUR * 2 : HALF_HOUR * 4;
  }

  open(row) {
    const now = Date.now();
    this.isOpen = true;
    this.root.hidden = false;
    this.winStart = floor30(now);
    this.focusTime = now;
    this.row = clamp(row || 0, 0, Math.max(0, this.deps.channels().length - 1));
    this.top = Math.max(0, this.row - 1);
    this.render();
  }

  close() {
    this.isOpen = false;
    this.root.hidden = true;
    this.root.innerHTML = "";
  }

  focused() {
    const ch = this.deps.channels()[this.row];
    if (!ch) return null;
    const tl = this.deps.timeline(ch);
    const p = programsBetween(tl, this.focusTime, this.focusTime + 1, 1)[0];
    return p ? { ch: ch, prog: p } : { ch: ch, prog: null };
  }

  // The guide cell (one program, or a block of shorts) under the focus.
  focusedCell() {
    const ch = this.deps.channels()[this.row];
    if (!ch) return null;
    const cells = guideCells(this.deps.timeline(ch), this.focusTime - HALF_HOUR, this.focusTime + HALF_HOUR);
    for (let i = 0; i < cells.length; i++) if (cells[i].startMs <= this.focusTime && this.focusTime < cells[i].slotEndMs) return cells[i];
    return null;
  }

  fitWindow() {
    const f = this.focused();
    const now = Date.now();
    const len = this.winLen();
    if (!f || !f.prog) return;
    const p = f.prog;
    if (p.startMs >= this.winStart + len - HALF_HOUR / 3) this.winStart = floor30(p.startMs) - HALF_HOUR;
    if (p.slotEndMs <= this.winStart + 60000 || this.focusTime < this.winStart) this.winStart = Math.max(floor30(now), floor30(this.focusTime));
    this.winStart = Math.max(floor30(now), this.winStart);
  }

  handle(a) {
    const n = this.deps.channels().length;
    const now = Date.now();
    const f = this.focusedCell();
    switch (a.type) {
      case "up":
        this.row = Math.max(0, this.row - 1);
        break;
      case "down":
        this.row = Math.min(n - 1, this.row + 1);
        break;
      case "chup":
        this.row = Math.max(0, this.row - this.rowsVisible);
        break;
      case "chdown":
        this.row = Math.min(n - 1, this.row + this.rowsVisible);
        break;
      case "left":
        if (f) this.focusTime = Math.max(now, f.startMs - 1);
        break;
      case "right":
        if (f && f.slotEndMs + 1 < now + MAX_AHEAD) this.focusTime = f.slotEndMs + 1;
        break;
      case "ok":
        this.select();
        return true;
      default:
        return false;
    }
    // Keep the focus inside a program that's still airing (or later), and inside the window.
    if (this.focusTime < now) this.focusTime = now;
    this.fitWindow();
    this.render();
    return true;
  }

  select() {
    const f = this.focused();
    if (f) this.deps.onTune(f.ch, f.prog);
  }

  render() {
    if (!this.isOpen) return;
    const d = this.deps;
    const channels = d.channels();
    const now = Date.now();
    const len = this.winLen();
    const winEnd = this.winStart + len;
    const h24 = d.clock24();

    if (this.row < this.top) this.top = this.row;
    if (this.row >= this.top + this.rowsVisible) this.top = this.row - this.rowsVisible + 1;
    this.top = clamp(this.top, 0, Math.max(0, channels.length - this.rowsVisible));

    const f = this.focused();
    let detail = "";
    if (f && f.prog) {
      const it = f.prog.item;
      const onNow = f.prog.startMs <= now && now < f.prog.slotEndMs;
      const when = onNow
        ? "<b>ON NOW</b> · " + Math.max(1, Math.ceil((f.prog.endMs - now) / 60000)) + " min left"
        : fmtClock(new Date(f.prog.startMs), h24) + " – " + fmtClock(new Date(f.prog.endMs), h24);
      const cell = this.focusedCell();
      const more = cell && cell.progs.length > 1 ? " · one of " + cell.progs.length + " shorts this half hour" : "";
      detail =
        '<div class="g-thumb" style="background-image:url(\'' +
        esc(isYouTube(it) ? ytThumb(videoIdOf(it)) : thumbUrl(it.id)) +
        "')\"></div>" +
        '<div class="g-info"><div class="g-title">' +
        esc(it.t) +
        '</div><div class="g-meta">CH ' +
        pad2(f.ch.number) +
        " " +
        esc(f.ch.name) +
        " · " +
        when +
        " · " +
        esc(programMeta(it) + more) +
        '</div><div class="g-desc">' +
        esc(d.about(it.id) || f.ch.tagline || "") +
        "</div></div>";
    }

    let slots = "";
    for (let t = this.winStart; t < winEnd; t += HALF_HOUR) {
      slots += '<span style="left:' + (((t - this.winStart) / len) * 100).toFixed(3) + '%">' + esc(fmtClock(new Date(t), h24)) + "</span>";
    }

    let rows = "";
    const tuned = d.tunedSlug();
    for (let r = this.top; r < Math.min(channels.length, this.top + this.rowsVisible); r++) {
      const ch = channels[r];
      const list = guideCells(d.timeline(ch), this.winStart, winEnd);
      let cells = "";
      list.forEach(function (c) {
        const a = Math.max(c.startMs, this.winStart);
        const b = Math.min(c.slotEndMs, winEnd);
        if (b <= a) return;
        const isFocus = r === this.row && c.startMs <= this.focusTime && this.focusTime < c.slotEndMs;
        const isNow = c.startMs <= now && now < c.slotEndMs;
        const t = Math.max(c.startMs + 1, now);
        const p = c.progs[0];
        const sub = c.progs.length > 1 ? "+ " + (c.progs.length - 1) + " more" : p.item.e || (p.item.y ? String(p.item.y) : "");
        cells +=
          '<div class="g-cell' +
          (isFocus ? " focus" : "") +
          (isNow ? " now" : "") +
          '" data-row="' +
          r +
          '" data-t="' +
          t +
          '" style="left:' +
          (((a - this.winStart) / len) * 100).toFixed(3) +
          "%;width:calc(" +
          (((b - a) / len) * 100).toFixed(3) +
          '% - 0.25rem)"><div class="t">' +
          (c.startMs < this.winStart ? "◂ " : "") +
          esc(c.progs.length > 1 && p.item.e ? p.item.e : p.item.t) +
          '</div><div class="s">' +
          esc(sub) +
          "</div></div>";
      }, this);
      rows +=
        '<div class="g-row' +
        (ch.slug === tuned ? " tuned" : "") +
        '"><div class="g-ch" data-row="' +
        r +
        '" style="--ch:' +
        esc(ch.color) +
        '"><span class="n">' +
        pad2(ch.number) +
        '</span><span class="nm">' +
        esc(ch.name) +
        "</span>" +
        (d.isFav(ch.slug) ? '<span class="star">★</span>' : "") +
        '</div><div class="g-progs">' +
        cells +
        "</div></div>";
    }

    const nowPct = ((now - this.winStart) / len) * 100;
    this.root.innerHTML =
      '<div class="g-head"><div style="display:flex;align-items:flex-end">' + LOGO + '<div class="label">TV GUIDE</div></div>' +
      '<div class="g-clock">' +
      esc(fmtClock(new Date(now), h24)) +
      "</div></div>" +
      '<div class="g-detail">' +
      detail +
      "</div>" +
      '<div class="g-grid"><div class="g-times"><div class="g-ch"></div><div class="g-slots">' +
      slots +
      "</div></div>" +
      '<div class="g-rows">' +
      rows +
      "</div>" +
      (nowPct >= 0 && nowPct <= 100 ? '<div class="g-nowline" style="left:calc(13.3rem + (100% - 13.3rem) * ' + (nowPct / 100).toFixed(4) + ')"></div>' : "") +
      "</div>" +
      '<div class="g-foot">' +
      hintsHtml([
        ["▲▼", "Channels"],
        ["◀▶", "Time"],
        ["OK", "Watch"],
        ["CH±", "Page"],
        ["Back", "Close"],
      ]) +
      "</div>";

    // How many rows fit depends on the screen; measure once and redraw if it changed.
    const rowsEl = this.root.querySelector(".g-rows");
    const rowEl = this.root.querySelector(".g-row");
    if (rowsEl && rowEl && rowEl.offsetHeight) {
      const fit = Math.max(3, Math.floor((rowsEl.clientHeight + 4) / (rowEl.offsetHeight + 4)));
      if (fit !== this.rowsVisible) {
        this.rowsVisible = fit;
        this.render();
      }
    }
  }
}
