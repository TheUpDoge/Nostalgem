// A centered dialog with an optional text field and buttons, all reachable with the D-pad.
// spec: { title, html, input: { placeholder, value }, buttons: [{ label, action(dialog) }], onClose }

import { escapeHtml as esc } from "../util.js";

export class Dialog {
  constructor(root) {
    this.root = root;
    this.isOpen = false;
    this.spec = null;
    this.focus = 0;
    this.busy = false;
    const self = this;
    root.addEventListener("click", function (e) {
      const b = e.target.closest ? e.target.closest("[data-b]") : null;
      if (!b) return;
      self.focus = Number(b.getAttribute("data-f"));
      self.press();
    });
  }

  open(spec) {
    this.spec = spec;
    this.isOpen = true;
    this.busy = false;
    this.focus = 0;
    this.root.hidden = false;
    const s = spec;
    let html = '<div class="d-box" role="dialog" aria-label="' + esc(s.title) + '"><div class="d-title">' + esc(s.title) + "</div>";
    if (s.html) html += '<div class="d-text">' + s.html + "</div>";
    if (s.input) {
      html +=
        '<div class="d-field" data-f="0"><input type="text" autocomplete="off" spellcheck="false" enterkeyhint="go" placeholder="' +
        esc(s.input.placeholder || "") +
        '" value="' +
        esc(s.input.value || "") +
        '"></div>';
    }
    if (s.textarea) {
      html +=
        '<div class="d-field" data-f="0"><textarea rows="' +
        (s.textarea.rows || 8) +
        '" autocomplete="off" spellcheck="false" placeholder="' +
        esc(s.textarea.placeholder || "") +
        '">' +
        esc(s.textarea.value || "") +
        "</textarea></div>";
    }
    html += '<div class="d-row">';
    const base = s.input || s.textarea ? 1 : 0;
    (s.buttons || []).forEach(function (b, i) {
      html += '<button type="button" class="d-btn" data-b="' + i + '" data-f="' + (base + i) + '">' + esc(b.label) + "</button>";
    });
    html += '</div><div class="d-status" aria-live="polite"></div></div>';
    this.root.innerHTML = html;
    this.paint();
  }

  focusables() {
    return Array.prototype.slice.call(this.root.querySelectorAll("[data-f]"));
  }

  input() {
    return this.root.querySelector("input");
  }

  value() {
    const t = this.root.querySelector("textarea");
    if (t) return t.value.trim();
    const i = this.input();
    return i ? i.value.trim() : "";
  }

  status(text) {
    const s = this.root.querySelector(".d-status");
    if (s) s.textContent = text || "";
  }

  paint() {
    const list = this.focusables();
    const f = this.focus;
    list.forEach(function (el, i) {
      el.classList.toggle("focus", i === f);
    });
    const field = this.root.querySelector("input, textarea");
    if (field) {
      if (list[f] && list[f].classList.contains("d-field")) field.focus();
      else field.blur();
    }
  }

  press() {
    if (this.busy) return;
    const list = this.focusables();
    const el = list[this.focus];
    if (!el) return;
    if (el.classList.contains("d-field")) {
      this.focus = Math.min(list.length - 1, this.focus + 1); // OK in the field: on to the first button
      this.paint();
      return;
    }
    const b = this.spec.buttons[Number(el.getAttribute("data-b"))];
    if (b && b.action) b.action(this);
  }

  handle(a) {
    const n = this.focusables().length;
    switch (a.type) {
      case "up":
      case "left":
        this.focus = Math.max(0, this.focus - 1);
        break;
      case "down":
      case "right":
        this.focus = Math.min(n - 1, this.focus + 1);
        break;
      case "ok":
        this.press();
        return true;
      default:
        return false;
    }
    this.paint();
    return true;
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.hidden = true;
    this.root.innerHTML = "";
    const done = this.spec && this.spec.onClose;
    this.spec = null;
    if (done) done();
  }
}
