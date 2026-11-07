// An on-screen number pad for remotes without number buttons (TCL's Google TV remote has none): the arrows
// move around a 3×4 keypad, OK presses a key. Typed digits work the same as on a remote with numbers:
// 1–2 digits for a channel, one or two more for a sub-channel (5 0 1 is CH 50-1, 1 5 2 is CH 15-2).

import { escapeHtml as esc } from "../util.js";

export const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "go"];
const COLS = 3;

// The key focus lands on after an arrow press, staying inside the pad.
export function padMove(focus, dir) {
  const row = Math.floor(focus / COLS);
  const col = focus % COLS;
  const rows = PAD_KEYS.length / COLS;
  if (dir === "up") return Math.max(0, row - 1) * COLS + col;
  if (dir === "down") return Math.min(rows - 1, row + 1) * COLS + col;
  if (dir === "left") return row * COLS + Math.max(0, col - 1);
  if (dir === "right") return row * COLS + Math.min(COLS - 1, col + 1);
  return focus;
}

// "15" → "15-", "152" → "15-2", "5010" → "50-10"; "" → "– –".
export function padLabel(typed) {
  if (!typed) return "– –";
  if (typed.length === 1) return typed;
  if (typed.length === 2) return typed;
  return typed.slice(0, 2) + "-" + typed.slice(2);
}

export class Numpad {
  // el: the #numpad element. opts.describe(typed) → { text, done }: what that number tunes to, and whether
  // no longer number could follow (focus then jumps to GO). opts.go(typed) tunes; opts.onClose().
  constructor(el, opts) {
    this.el = el;
    this.opts = opts || {};
    this.isOpen = false;
    this.typed = "";
    this.focus = 0;
  }

  open() {
    this.isOpen = true;
    this.typed = "";
    this.focus = 0;
    this.el.hidden = false;
    this.render();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.hidden = true;
    if (this.opts.onClose) this.opts.onClose();
  }

  press(key) {
    if (key === "del") this.typed = this.typed.slice(0, -1);
    else if (key === "go") {
      const typed = this.typed;
      this.close();
      if (typed && this.opts.go) this.opts.go(typed);
      return;
    } else if (this.typed.length < 4) {
      this.typed += key;
      const d = this.opts.describe ? this.opts.describe(this.typed) : null;
      if ((d && d.done) || this.typed.length === 4) this.focus = PAD_KEYS.indexOf("go");
    }
    this.render();
  }

  // Remote actions. Returns true when the pad used it.
  handle(a) {
    if (!this.isOpen) return false;
    const t = a.type;
    if (t === "back") this.close();
    else if (t === "up" || t === "down" || t === "left" || t === "right") {
      this.focus = padMove(this.focus, t);
      this.render();
    } else if (t === "ok") this.press(PAD_KEYS[this.focus]);
    else if (t === "digit") this.press(String(a.digit));
    else if (t === "chup" || t === "chdown" || t === "menu" || t === "guide") this.close();
    return true;
  }

  click(i) {
    if (i < 0 || i >= PAD_KEYS.length) return;
    this.focus = i;
    this.press(PAD_KEYS[i]);
  }

  render() {
    const d = this.opts.describe && this.typed ? this.opts.describe(this.typed) : null;
    const self = this;
    let keys = "";
    PAD_KEYS.forEach(function (k, i) {
      const label = k === "del" ? "⌫" : k === "go" ? "GO ▶" : k;
      keys +=
        '<button type="button" class="np-key' +
        (k === "go" ? " np-go" : k === "del" ? " np-del" : "") +
        (i === self.focus ? " focus" : "") +
        '" data-i="' +
        i +
        '">' +
        label +
        "</button>";
    });
    this.el.innerHTML =
      '<div class="np-box" role="dialog" aria-label="Number pad">' +
      '<div class="np-title">CHANNEL NUMBER</div>' +
      '<div class="np-num">' +
      esc(padLabel(this.typed)) +
      "</div>" +
      '<div class="np-name">' +
      esc(d ? d.text : "Type a number, then GO") +
      "</div>" +
      '<div class="np-keys">' +
      keys +
      "</div>" +
      '<div class="np-hint">▲▼◀▶ move · OK press · BACK close</div>' +
      "</div>";
  }
}
