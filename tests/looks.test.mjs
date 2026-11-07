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
