// A side menu driven by the D-pad. Pages are { title, sub, items() } and items are
// { label, value, cycle, ok, left, right, head, swatch }. Values and items are recomputed on every draw,
// so a page always shows the current state.

import { escapeHtml as esc } from "../util.js";
import { hintsHtml } from "./views.js";
import { dragSteps } from "./drag.js";

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
    // On a touch screen, dragging the list moves along it.
    this.drag = dragSteps(root, {
      stepY: function () {
        const item = root.querySelector(".m-item:not(.head)");
        return item ? item.offsetHeight : 40;
      },
      onStep: function (dir) {
        if (self.isOpen) self.handle({ type: dir });
      },
    });
    root.addEventListener("click", function (e) {
      if (self.drag.dragged()) return;
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
    this.root.classList.remove("menu-wide", "place-club", "place-room");
    this.root.innerHTML = "";
    this.el = null;
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

  // Redraws in place: the menu refreshes every couple of seconds to keep its values current, so only
  // the parts that changed are touched and the list keeps its scroll position (rebuilding it made the
  // list snap to the top and slide back, a visible jolt).
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
    const foot = hintsHtml([
      ["▲▼", "Move"],
      ["◀▶", "Change"],
      ["OK", "Select"],
      ["Back", this.stack.length > 1 ? "Up" : "Close"],
    ]);
    let el = this.el;
    if (!el || !this.root.contains(el.scroll)) {
      this.root.innerHTML =
        '<div class="m-title"></div><div class="m-sub"></div>' +
        '<div class="m-banner" hidden></div>' +
        '<div class="m-list"><div class="m-scroll"></div></div><div class="m-foot"></div>';
      el = this.el = {
        title: this.root.querySelector(".m-title"),
        sub: this.root.querySelector(".m-sub"),
        banner: this.root.querySelector(".m-banner"),
        list: this.root.querySelector(".m-list"),
        scroll: this.root.querySelector(".m-scroll"),
        foot: this.root.querySelector(".m-foot"),
        html: null,
        bannerHtml: null,
        foot0: null,
        page: null,
        shift: -1,
      };
    }
    const title = resolve(t.page.title);
    const sub = resolve(t.page.sub) || "";
    const banner = resolve(t.page.banner) || "";
    this.root.classList.toggle("menu-wide", !!t.page.wide);
    this.root.classList.toggle("place-club", t.page.place === "club");
    this.root.classList.toggle("place-room", t.page.place === "room");
    if (el.title.textContent !== title) el.title.textContent = title;
    if (el.sub.textContent !== sub) el.sub.textContent = sub;
    if (el.bannerHtml !== banner) {
      el.banner.innerHTML = banner;
      el.banner.hidden = !banner;
      el.bannerHtml = banner;
    }
    if (el.html !== html) {
      el.scroll.innerHTML = html;
      el.html = html;
    }
    if (el.foot0 !== foot) {
      el.foot.innerHTML = foot;
      el.foot0 = foot;
    }
    // Scroll so the focused row stays in view. A new page jumps straight there; moving within a page glides.
    const focusEl = el.scroll.querySelector(".m-item.focus");
    const h = el.list.clientHeight;
    let shift = 0;
    if (focusEl) {
      const y = focusEl.offsetTop + focusEl.offsetHeight / 2;
      const max = Math.max(0, el.scroll.offsetHeight - h);
      shift = Math.round(Math.max(0, Math.min(max, y - h / 2)));
    }
    const newPage = el.page !== t;
    el.page = t;
    if (shift !== el.shift || newPage) {
      if (newPage) el.scroll.style.transition = "none";
      el.scroll.style.transform = "translateY(" + -shift + "px)";
      if (newPage) {
        void el.scroll.offsetHeight; // apply the jump before turning the glide back on
        el.scroll.style.transition = "";
      }
      el.shift = shift;
    }
  }
}
