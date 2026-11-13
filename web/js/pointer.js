// The phone's Mouse page on the TV: a pointer the phone's trackpad moves, a tap that clicks, two-finger
// scrolling, keyboard keys and typed text (phone.js sends them; link.js checks them).
//
// Two ways to carry them out:
//   In the TV app (it says "pointer"): the app draws the pointer over whatever is on the screen — NostalGem,
//   the YouTube player, a link-out station's site like 777's arcade — and presses there for real
//   (MainActivity.kt). main.js only passes the phone's messages on.
//   Anywhere else (a browser, or an older TV app): this page draws the pointer and clicks, scrolls and
//   types on its own screen. It can't reach into another site (a link-out opens in its own tab) or into the
//   YouTube player: a browser doesn't let one page press buttons in another.

const HIDE_AFTER = 4000; // ms without a move: the pointer fades out, like a mouse's
const REPEAT_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Backspace", "Delete"];
const HOLD_LIMIT = 8000; // a held key the phone never let go of (a lost message) lets go by itself

function fire(el, type, init, Kind) {
  let ev = null;
  try {
    ev = new Kind(type, init);
  } catch (e) {
    ev = new MouseEvent(type, init); // no PointerEvent in this browser
  }
  return el.dispatchEvent(ev);
}

// Does this element take typing?
export function editable(el) {
  if (!el || !el.tagName || el.disabled || el.readOnly) return false;
  const t = el.tagName.toLowerCase();
  if (t === "textarea") return true;
  if (t === "input") return /^(text|search|url|email|tel|password|number|)$/i.test(el.type || "");
  return !!el.isContentEditable;
}

// The nearest element under (and including) el that can scroll that way.
function scroller(el, vertical) {
  for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
    const cs = window.getComputedStyle(e);
    const o = vertical ? cs.overflowY : cs.overflowX;
    const room = vertical ? e.scrollHeight > e.clientHeight + 1 : e.scrollWidth > e.clientWidth + 1;
    if (room && /(auto|scroll)/.test(o)) return e;
  }
  return null;
}

// Typed text into a text field, at the caret.
export function typeInto(el, s) {
  if (el.isContentEditable) {
    try {
      document.execCommand("insertText", false, s);
    } catch (e) {
      /* nothing to type into */
    }
    return;
  }
  const start = typeof el.selectionStart === "number" ? el.selectionStart : el.value.length;
  const end = typeof el.selectionEnd === "number" ? el.selectionEnd : el.value.length;
  const max = el.maxLength > 0 ? el.maxLength : Infinity;
  const room = Math.max(0, max - (el.value.length - (end - start)));
  const add = s.slice(0, room);
  el.value = el.value.slice(0, start) + add + el.value.slice(end);
  const at = start + add.length;
  try {
    el.setSelectionRange(at, at);
  } catch (e) {
    /* a number field has no caret */
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

// The editing keys in a text field: ⌫, Delete, ◀ ▶, Home, End. Returns true when it was one of those.
export function editKey(el, key) {
  if (el.isContentEditable) return false;
  const v = el.value;
  let start = typeof el.selectionStart === "number" ? el.selectionStart : v.length;
  let end = typeof el.selectionEnd === "number" ? el.selectionEnd : v.length;
  let changed = false;
  if (key === "Backspace") {
    if (start === end && start > 0) start--;
    el.value = v.slice(0, start) + v.slice(end);
    end = start;
    changed = true;
  } else if (key === "Delete") {
    if (start === end && end < v.length) end++;
    el.value = v.slice(0, start) + v.slice(end);
    end = start;
    changed = true;
  } else if (key === "ArrowLeft") start = end = Math.max(0, start === end ? start - 1 : start);
  else if (key === "ArrowRight") start = end = Math.min(v.length, start === end ? end + 1 : end);
  else if (key === "Home") start = end = 0;
  else if (key === "End") start = end = v.length;
  else return false;
  try {
    el.setSelectionRange(start, end);
  } catch (e) {
    /* no caret */
  }
  if (changed) el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

// The pointer this page draws for itself (not in the TV app).
// opts: { say(text) for things it can't do, steps(n) for scrolling over the guide or a menu (n rows; true
// when they took it), now() }
export class PagePointer {
  constructor(el, opts) {
    this.el = el;
    this.o = opts || {};
    this.x = -1;
    this.y = -1;
    this.placed = false; // it starts in the middle, the first time it's wanted
    this.down = null; // the element a held button went down on
    this.hideTimer = 0;
    this.held = {}; // key -> { timer, every, until }
    this.scrollRest = 0;
    this.clicks = 0;
    this.lastHit = "";
  }

  size() {
    return { w: window.innerWidth || 1, h: window.innerHeight || 1 };
  }

  show() {
    const sz = this.size();
    if (!this.placed) {
      this.placed = true;
      this.x = sz.w / 2;
      this.y = sz.h / 2;
    }
    this.x = Math.max(0, Math.min(sz.w - 1, this.x));
    this.y = Math.max(0, Math.min(sz.h - 1, this.y));
    this.el.style.transform = "translate(" + Math.round(this.x) + "px," + Math.round(this.y) + "px)";
    this.el.hidden = false;
    this.el.classList.remove("faded");
    clearTimeout(this.hideTimer);
    const self = this;
    this.hideTimer = setTimeout(function () {
      self.el.classList.add("faded");
    }, HIDE_AFTER);
  }

  hide() {
    clearTimeout(this.hideTimer);
    this.el.classList.add("faded");
  }

  visible() {
    return !this.el.hidden && !this.el.classList.contains("faded");
  }

  // The element under the pointer (the pointer itself lets clicks through).
  hit() {
    return document.elementFromPoint(this.x, this.y);
  }

  mouse(extra) {
    return Object.assign({ bubbles: true, cancelable: true, view: window, clientX: this.x, clientY: this.y, screenX: this.x, screenY: this.y, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons: 0 }, extra || {});
  }

  move(dx, dy) {
    const sz = this.size();
    if (!this.placed) this.show();
    this.x += dx * sz.w;
    this.y += dy * sz.w;
    this.show();
    if (this.down) {
      const el = this.hit() || this.down;
      fire(el, "pointermove", this.mouse({ buttons: 1 }), window.PointerEvent || MouseEvent);
      fire(el, "mousemove", this.mouse({ buttons: 1 }), MouseEvent);
    }
  }

  // Another site's frame (the YouTube player): a page can't press anything in it.
  blocked(el) {
    if (el && el.tagName === "IFRAME") {
      if (this.o.say) this.o.say("The phone's pointer can't press inside the YouTube player in a browser. In the NostalGem TV app it can.");
      return true;
    }
    return false;
  }

  click() {
    this.show();
    const el = this.hit();
    if (!el || this.blocked(el)) return false;
    this.clicks++;
    this.lastHit = el.id || el.className || el.tagName;
    const P = window.PointerEvent || MouseEvent;
    fire(el, "pointerdown", this.mouse({ buttons: 1 }), P);
    fire(el, "mousedown", this.mouse({ buttons: 1 }), MouseEvent);
    const target = el.closest ? el.closest("input,textarea,select,button,a,[tabindex],[contenteditable]") : null;
    if (target && typeof target.focus === "function") target.focus();
    fire(el, "pointerup", this.mouse(), P);
    fire(el, "mouseup", this.mouse(), MouseEvent);
    fire(el, "click", this.mouse({ detail: 1 }), MouseEvent);
    return true;
  }

  // Hold the button down (a drag), or let go.
  press(down) {
    this.show();
    const P = window.PointerEvent || MouseEvent;
    if (down) {
      const el = this.hit();
      if (!el || this.blocked(el)) return;
      this.down = el;
      fire(el, "pointerdown", this.mouse({ buttons: 1 }), P);
      fire(el, "mousedown", this.mouse({ buttons: 1 }), MouseEvent);
    } else if (this.down) {
      const el = this.hit() || this.down;
      this.down = null;
      fire(el, "pointerup", this.mouse(), P);
      fire(el, "mouseup", this.mouse(), MouseEvent);
    }
  }

  // Two fingers on the phone. Over the guide or a menu, a row at a time (opts.steps); elsewhere the wheel,
  // then whatever under the pointer scrolls.
  scroll(dx, dy) {
    this.show();
    const sz = this.size();
    const px = dy * sz.w;
    this.scrollRest += px;
    const row = sz.h / 14;
    if (this.o.steps && Math.abs(this.scrollRest) >= row) {
      const n = Math.trunc(this.scrollRest / row);
      if (this.o.steps(n)) {
        this.scrollRest -= n * row;
        return;
      }
    }
    if (!this.o.steps || Math.abs(this.scrollRest) >= row) this.scrollRest = 0;
    const el = this.hit();
    if (!el || this.blocked(el)) return;
    const wheel = fire(el, "wheel", Object.assign(this.mouse(), { deltaX: dx * sz.w, deltaY: px, deltaMode: 0 }), window.WheelEvent || MouseEvent);
    if (!wheel) return; // the page took it
    const v = scroller(el, true);
    if (v && px) v.scrollTop += px;
    const h = scroller(el, false);
    if (h && dx) h.scrollLeft += dx * sz.w;
  }

  // A key: down true holds it (arrows and ⌫ repeat, like a keyboard's), false lets go, null presses it.
  key(key, down) {
    const self = this;
    if (down === false) return this.release(key);
    if (down === true && this.held[key]) {
      this.held[key].until = Date.now() + HOLD_LIMIT; // still held
      return;
    }
    this.stroke(key, false);
    if (down === null) {
      this.up(key);
      return;
    }
    const h = { timer: 0, every: 0, until: Date.now() + HOLD_LIMIT };
    this.held[key] = h;
    if (REPEAT_KEYS.indexOf(key) >= 0) {
      h.timer = setTimeout(function () {
        h.every = setInterval(function () {
          if (Date.now() > h.until) return self.release(key);
          self.stroke(key, true);
        }, 80);
      }, 400);
    } else {
      h.timer = setTimeout(function check() {
        if (Date.now() > h.until) self.release(key);
        else h.timer = setTimeout(check, 1000);
      }, 1000);
    }
  }

  release(key) {
    const h = this.held[key];
    if (!h) return;
    clearTimeout(h.timer);
    clearInterval(h.every);
    delete this.held[key];
    this.up(key);
  }

  releaseAll() {
    Object.keys(this.held).forEach(this.release, this);
  }

  // One keydown: into a text field when one has focus, else to the page as a keyboard's.
  stroke(key, repeat) {
    const el = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
    if (editable(el)) {
      if (editKey(el, key)) return;
      if (key === " ") return typeInto(el, " ");
    }
    fire(el, "keydown", { key: key, bubbles: true, cancelable: true, repeat: !!repeat, keyCode: KEYCODES[key] || 0 }, KeyboardEvent);
  }

  up(key) {
    const el = document.activeElement || document.body;
    fire(el, "keyup", { key: key, bubbles: true, cancelable: true, keyCode: KEYCODES[key] || 0 }, KeyboardEvent);
  }

  // Typed text: into the text field with focus; with none, each letter as a key press (the page's own
  // shortcuts, like G for the guide).
  text(s) {
    const el = document.activeElement;
    if (editable(el)) return typeInto(el, s);
    for (let i = 0; i < s.length; i++) {
      this.stroke(s.charAt(i), false);
      this.up(s.charAt(i));
    }
  }

  state() {
    return { x: Math.round(this.x), y: Math.round(this.y), visible: this.visible(), clicks: this.clicks, hit: this.lastHit, held: Object.keys(this.held), down: !!this.down };
  }
}

const KEYCODES = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Enter: 13, Escape: 27, " ": 32, Tab: 9, Backspace: 8, Delete: 46, Home: 36, End: 35, PageUp: 33, PageDown: 34 };

// What the TV app takes for each phone message: the same message, as text. (MainActivity.kt.)
export function appMessage(m) {
  return JSON.stringify(m);
}
