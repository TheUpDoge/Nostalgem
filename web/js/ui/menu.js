// A side menu driven by the D-pad. Pages are { title, sub, items() } and items are
// { label, value, cycle, ok, left, right, head, swatch }. Values and items are recomputed on every draw,
// so a page always shows the current state.

import { escapeHtml as esc } from "../util.js";
import { hintsHtml } from "./views.js";

function resolve(v) {
  return typeof v === "function" ? v() : v;
}

export class Menu {
  constructor(root, onClose) {
    this.root = root;
    this.onClose = onClose || function () {};
    this.stack = [];
    this.isOpen = false;
    const self = this;
    root.addEventListener("click", function (e) {
      const el = e.target.closest ? e.target.closest("[data-i]") : null;
      if (!el) return;
      self.top().focus = Number(el.getAttribute("data-i"));
      self.handle({ type: "ok" });
    });
  }

  top() {
    return this.stack[this.stack.length - 1];
  }

  items() {
    const t = this.top();
    return t ? resolve(t.page.items) || [] : [];
  }

  open(page) {
    this.stack = [];
    this.isOpen = true;
    this.root.hidden = false;
    this.push(page);
  }

  push(page) {
    this.stack.push({ page: page, focus: -1 });
    this.top().focus = this.nextFocusable(-1, 1);
    this.render();
  }

  pop() {
    if (this.stack.length > 1) {
      this.stack.pop();
      this.render();
    } else this.close();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.hidden = true;
    this.root.innerHTML = "";
    this.stack = [];
    this.onClose();
  }

  nextFocusable(from, dir) {
    const list = this.items();
    for (let i = from + dir; i >= 0 && i < list.length; i += dir) if (!list[i].head) return i;
    return from < 0 ? 0 : from;
  }

  handle(a) {
    const t = this.top();
    if (!t) return false;
    const list = this.items();
    const item = list[t.focus];
    let result;
    switch (a.type) {
      case "up":
        t.focus = this.nextFocusable(t.focus, -1);
        break;
      case "down":
        t.focus = this.nextFocusable(t.focus, 1);
        break;
      case "chup":
        for (let k = 0; k < 6; k++) t.focus = this.nextFocusable(t.focus, -1);
        break;
      case "chdown":
        for (let k = 0; k < 6; k++) t.focus = this.nextFocusable(t.focus, 1);
        break;
      case "left":
        if (item && item.left) result = item.left();
        else {
          this.pop();
          return true;
        }
        break;
      case "right":
        if (item && item.right) result = item.right();
        else if (item && item.ok && item.sub) result = item.ok();
        break;
      case "ok":
        if (item && item.ok) result = item.ok();
        else if (item && item.right) result = item.right();
        break;
      default:
        return false;
    }
    if (result === "close") {
      this.close();
      return true;
    }
    if (this.isOpen) {
      const len = this.items().length;
      if (t.focus >= len) t.focus = this.nextFocusable(len, -1);
      this.render();
    }
    return true;
  }

  render() {
    const t = this.top();
    if (!t) return;
    const list = this.items();
    let html = "";
    list.forEach(function (it, i) {
      if (it.head) {
        html += '<div class="m-item head">' + esc(resolve(it.label)) + "</div>";
        return;
      }
      const v = resolve(it.value);
      html +=
        '<div class="m-item' +
        (i === t.focus ? " focus" : "") +
        (it.cycle ? " cycle" : "") +
        '" data-i="' +
        i +
        '"><span class="l">' +
        (it.swatch ? '<i class="sw" style="--sw:' + esc(it.swatch) + '"></i>' : "") +
        esc(resolve(it.label)) +
        "</span>" +
        (v != null && v !== "" ? '<span class="v">' + esc(v) + "</span>" : it.sub ? '<span class="v">›</span>' : "") +
        "</div>";
    });
    this.root.innerHTML =
      '<div class="m-title">' +
      esc(resolve(t.page.title)) +
      "</div>" +
      '<div class="m-sub">' +
      esc(resolve(t.page.sub) || "") +
      "</div>" +
      '<div class="m-list"><div class="m-scroll">' +
      html +
      "</div></div>" +
      '<div class="m-foot">' +
      hintsHtml([
        ["▲▼", "Move"],
        ["◀▶", "Change"],
        ["OK", "Select"],
        ["Back", this.stack.length > 1 ? "Up" : "Close"],
      ]) +
      "</div>";
    // Scroll so the focused row stays in view.
    const listEl = this.root.querySelector(".m-list");
    const scroller = this.root.querySelector(".m-scroll");
    const focusEl = this.root.querySelector(".m-item.focus");
    if (listEl && scroller && focusEl) {
      const h = listEl.clientHeight;
      const y = focusEl.offsetTop + focusEl.offsetHeight / 2;
      const max = Math.max(0, scroller.offsetHeight - h);
      const shift = Math.max(0, Math.min(max, y - h / 2));
      scroller.style.transform = "translateY(" + -shift + "px)";
    }
  }
}
