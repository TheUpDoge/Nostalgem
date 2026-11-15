// Picture filters: every look has a name and a way to draw it, on Archive programs and on YouTube.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LOOKS, ASCII_BANDS, asciiMask, lookById, lookCss, lookYtCss, looksSvg, mixable, nextLook } from "../web/js/looks.js";
import { fitRect } from "../web/js/fxcanvas.js";
import { AMBIENCES, ambienceName, clickTrain } from "../web/js/ambience.js";

test("every look has a unique id, a name and a group", () => {
  const ids = new Set();
  for (const l of LOOKS) {
    assert.ok(l.id && !ids.has(l.id), l.id);
    ids.add(l.id);
    assert.ok(l.name && l.group, l.id);
  }
  assert.equal(LOOKS[0].id, "off");
  for (const want of ["bw", "pop-red", "pop-blue", "pop-green", "pop-yellow", "pop-purple", "tint-blue", "tint-green", "tint-yellow", "tint-purple", "ascii", "vhs", "gameboy"]) {
    assert.ok(ids.has(want), want);
  }
});

test("every SVG look has its filter, and a CSS-only version for YouTube", () => {
  const svg = looksSvg({ height: 1080 });
  for (const l of LOOKS) {
    if (l.id === "off") {
      assert.equal(lookCss(l), "");
      continue;
    }
    if (l.canvas) {
      // Drawn on a canvas: no CSS filter on the picture, a CSS version for YouTube.
      assert.equal(lookCss(l), "", l.id);
      assert.ok(l.yt && !/url\(/.test(l.yt), "YouTube version for " + l.id);
    } else if (l.svg) {
      assert.ok(svg.includes('id="ng-look-' + l.id + '"'), "filter for " + l.id);
      assert.equal(lookCss(l), "url(#ng-look-" + l.id + ")");
      assert.ok(l.yt && !/url\(/.test(l.yt), "YouTube version for " + l.id);
    } else {
      assert.ok(l.css, l.id);
    }
    // YouTube can only take CSS filter functions.
    assert.ok(!/url\(/.test(lookYtCss(l)), l.id);
  }
});

test("the canvas looks have their color steps in the SVG, and ASCII a band per brightness", () => {
  const svg = looksSvg({ height: 720 });
  for (let k = 1; k <= ASCII_BANDS; k++) assert.ok(svg.includes('id="ng-band-' + k + '"'), "band " + k);
  assert.ok(svg.includes('id="ng-pal-gameboy"') && svg.includes('id="ng-pal-8bit"'));
  // The slow SVG pixelation is gone for good.
  assert.doesNotMatch(svg, /feMorphology|feImage/);
  for (const id of ["pixel", "8bit", "gameboy", "ascii", "ascii-color", "ascii-matrix"]) assert.ok(lookById(id).canvas, id);
  assert.ok(lookById("ascii-matrix").rain);
  const m = asciiMask(720);
  assert.match(m.url, /^url\("data:image\/svg\+xml,/);
  assert.match(m.size, /^\d+px \d+px$/);
});

test("Mix with: only color looks go on top", () => {
  assert.ok(mixable(lookById("vapor")) && mixable(lookById("pop-red")) && mixable(lookById("bw")));
  assert.ok(!mixable(lookById("off")) && !mixable(lookById("ascii")) && !mixable(lookById("vhs")));
});

test("the canvas fits the video the way the Picture setting says", () => {
  assert.deepEqual(fitRect(1600, 900, 160, 90, "contain"), [0, 0, 160, 90]);
  assert.deepEqual(fitRect(640, 480, 160, 90, "contain"), [20, 0, 120, 90]);
  assert.deepEqual(fitRect(640, 480, 160, 90, "cover"), [0, -15, 160, 120]);
  assert.deepEqual(fitRect(640, 480, 160, 90, "fill"), [0, 0, 160, 90]);
});

test("the SVG is plain markup with no scripts", () => {
  const svg = looksSvg({ height: 720 });
  assert.doesNotMatch(svg, /<script|\son[a-z]+=/i);
});

test("V steps through the looks and wraps around", () => {
  assert.equal(nextLook("off", 1).id, LOOKS[1].id);
  assert.equal(nextLook("off", -1).id, LOOKS[LOOKS.length - 1].id);
  assert.equal(nextLook(LOOKS[LOOKS.length - 1].id, 1).id, "off");
  assert.equal(lookById("nope").id, "off");
});

test("ambience: lo-fi crackle is sparse clicks, and every mode has a name", () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out = clickTrain(48000, 48000, 10, rand);
  const loud = out.filter((v) => Math.abs(v) > 0.05).length;
  assert.ok(loud > 0 && loud < 48000 * 0.05, "clicks, not noise (" + loud + ")");
  assert.ok(out.every((v) => Math.abs(v) <= 2));
  assert.deepEqual(AMBIENCES[0], ["off", "Off"]);
  assert.equal(ambienceName("lofi"), "Lo-fi vinyl");
});

// Two Sin City looks together keep both colors: one filter for the pair, not one after the other.
import { comboCss, popColor } from "../web/js/looks.js";
import { tooSlow } from "../web/js/framewatch.js";

test("two Sin City looks share one filter that keeps both colors", () => {
  assert.equal(popColor(lookById("pop-red")), "red");
  assert.equal(popColor(lookById("bw")), "");
  assert.equal(comboCss(lookById("pop-blue"), lookById("pop-red")), "url(#ng-look-pop-red-blue)");
  assert.equal(comboCss(lookById("pop-red"), lookById("pop-blue")), "url(#ng-look-pop-red-blue)");
  assert.equal(comboCss(lookById("pop-red"), null), "url(#ng-look-pop-red)");
  assert.equal(comboCss(lookById("bw"), lookById("pop-red")), "grayscale(1) contrast(1.15) url(#ng-look-pop-red)");
  const svg = looksSvg({ height: 720 });
  const pops = ["red", "blue", "green", "yellow", "purple", "cyan"];
  for (const a of pops) for (const b of pops) {
    if (a === b) continue;
    const id = /url\(#([\w-]+)\)/.exec(comboCss(lookById("pop-" + a), lookById("pop-" + b)))[1];
    assert.ok(svg.includes('id="' + id + '"'), "the SVG has " + id);
  }
  // The pair filter keeps two colors over the noir: two masks each, merged on top.
  const pair = svg.slice(svg.indexOf('id="ng-look-pop-red-blue"'));
  assert.equal((pair.slice(0, pair.indexOf("</filter>")).match(/<feMergeNode/g) || []).length, 3);
});

test("Colorized looks for black-and-white films", () => {
  for (const id of ["colorize", "colorize-80s", "twostrip"]) {
    const l = lookById(id);
    assert.equal(l.id, id);
    assert.equal(l.group, "Classic");
    assert.ok(looksSvg({ height: 720 }).includes('id="ng-look-' + id + '"'), id);
  }
});

test("a filter is too slow for this TV only after a couple of slow measurements in a row", () => {
  assert.equal(tooSlow([]), false);
  assert.equal(tooSlow([5]), false); // the warm-up doesn't count
  assert.equal(tooSlow([5, 12]), false);
  assert.equal(tooSlow([5, 12, 15]), true);
  assert.equal(tooSlow([60, 59, 58, 61]), false);
  assert.equal(tooSlow([60, 12, 58, 14]), false); // one slow moment isn't the filter
  assert.equal(tooSlow([60, 59, 18, 11]), true);
});

test("the stations' looks are in the filter list for every channel", async () => {
  const { LOOKS, nextLook } = await import("../web/js/looks.js");
  const ids = LOOKS.map((l) => l.id);
  assert.ok(ids.includes("ascii-666") && ids.includes("glass"));
  // Cycling through the filters reaches them.
  let id = "off";
  const seen = new Set();
  for (let i = 0; i < LOOKS.length; i++) seen.add((id = nextLook(id, 1).id));
  assert.ok(seen.has("ascii-666") && seen.has("glass"));
});

test("stained glass: irregular panes that cover the picture without gaps or overlaps", async () => {
  const { glassPanes } = await import("../web/js/fxcanvas.js");
  const W = 480;
  const H = 270;
  const panes = glassPanes(26, 15, W, H, 111);
  assert.equal(panes.length, 26 * 15);
  const area = (pts) => {
    let a = 0;
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k];
      const q = pts[(k + 1) % pts.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a) / 2;
  };
  const total = panes.reduce((t, p) => t + area(p.pts), 0);
  assert.ok(Math.abs(total - W * H) < 1, "panes cover the picture exactly: " + total);
  const sides = new Set(panes.map((p) => p.pts.length));
  assert.ok(sides.size > 2, "panes of different shapes");
  // Every pane's box is inside the picture, and the same window every time.
  assert.ok(panes.every((p) => p.x >= -0.01 && p.y >= -0.01 && p.x + p.w <= W + 0.01 && p.y + p.h <= H + 0.01));
  assert.deepEqual(glassPanes(26, 15, W, H, 111)[100].pts, panes[100].pts);
});

// Sin City's color windows (Task 14): muted colors are kept, neighbours stay out, near-misses fade.
import { popStrength, POP_WINDOWS } from "../web/js/looks.js";

test("Sin City yellow keeps real-world yellows and leaves orange and green out", () => {
  const keep = { "pure yellow": [1, 1, 0], "taxi": [0.95, 0.75, 0.1], "road sign": [0.98, 0.82, 0.05], "muted film yellow": [0.6, 0.55, 0.3], "faded print": [0.72, 0.64, 0.38], "mustard": [0.45, 0.38, 0.12] };
  for (const [what, rgb] of Object.entries(keep)) assert.ok(popStrength("yellow", rgb) >= 0.7, what + " is kept: " + popStrength("yellow", rgb));
  assert.ok(popStrength("yellow", [0.82, 0.66, 0.4]) > 0.1, "sand in late light keeps some yellow");
  for (const [what, rgb] of Object.entries({ orange: [1, 0.5, 0], "deep orange": [0.85, 0.4, 0.1], lime: [0.5, 1, 0], green: [0, 1, 0], red: [1, 0, 0], gray: [0.5, 0.5, 0.5], white: [1, 1, 1], skin: [0.85, 0.65, 0.55] })) {
    assert.equal(popStrength("yellow", rgb), 0, what + " is not yellow");
  }
});

test("every Sin City color keeps its own hue, muted too, and not the others'", () => {
  const PURE = { red: [1, 0, 0], yellow: [1, 1, 0], green: [0, 1, 0], cyan: [0, 1, 1], blue: [0, 0, 1], purple: [0.6, 0.15, 0.85] };
  const MUTED = { red: [0.6, 0.3, 0.25], yellow: [0.6, 0.55, 0.3], green: [0.3, 0.5, 0.3], cyan: [0.1, 0.5, 0.5], blue: [0.25, 0.35, 0.55], purple: [0.45, 0.3, 0.55] };
  for (const c of Object.keys(POP_WINDOWS)) {
    assert.ok(popStrength(c, PURE[c]) > 0.95, c + " keeps pure " + c);
    assert.ok(popStrength(c, MUTED[c]) >= 0.5, c + " keeps muted " + c + ": " + popStrength(c, MUTED[c]));
    for (const other of Object.keys(PURE)) if (other !== c) assert.equal(popStrength(c, PURE[other]), 0, c + " leaves " + other + " gray");
    for (const g of [[0, 0, 0], [0.3, 0.3, 0.3], [0.7, 0.7, 0.7], [1, 1, 1], [0.52, 0.5, 0.49]]) assert.equal(popStrength(c, g), 0, c + " leaves gray gray");
  }
});

test("a Sin City color fades toward its window's edges instead of dropping off", () => {
  const hue = (h, chroma) => {
    const x = (((h % 360) + 360) % 360) / 60;
    const f = x - Math.floor(x);
    const c = [[1, f, 0], [1 - f, 1, 0], [0, 1, f], [0, 1 - f, 1], [f, 0, 1], [1, 0, 1 - f]][Math.floor(x) % 6];
    return c.map((k) => 0.8 - chroma + chroma * k);
  };
  for (const [c, w] of Object.entries(POP_WINDOWS)) {
    // A muted color, stepped from the middle out to each edge: it only ever gets weaker, passing through
    // values in between (no step from all to nothing).
    for (const edge of [w[0], w[2]]) {
      let last = popStrength(c, hue(w[1], 0.3));
      let between = 0;
      for (let i = 1; i <= 20; i++) {
        const v = popStrength(c, hue(w[1] + ((edge - w[1]) * i) / 20, 0.3));
        assert.ok(v <= last + 1e-9, c + " gets weaker toward " + edge);
        if (v > 0.05 && v < 0.95) between++;
        last = v;
      }
      assert.ok(between >= 3, c + " fades toward " + edge + " over several steps (" + between + ")");
      assert.equal(last, 0, c + " is gone at its edge " + edge);
    }
  }
});
