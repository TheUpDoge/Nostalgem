// The start-up turn-on: skip, mute, a capped snow buffer, and it never holds the tuner.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TURN_ON_MS,
  SNOW_CAP_W,
  SNOW_CAP_H,
  SNOW_FRAMES,
  SNOW_MAX_DPR,
  turnOnDuration,
  prefersStill,
  introAudible,
  showBootSnow,
  turnOnAction,
  snowBufferSize,
  snowPixels,
  createTurnOn,
  playTurnOnSound,
} from "../web/js/intro.js";

function clock() {
  let now = 0;
  const timers = [];
  let seq = 0;
  return {
    now: () => now,
    schedule: (fn, ms) => {
      const id = ++seq;
      timers.push({ id, fn, at: now + ms });
      return id;
    },
    cancel: (id) => {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    advance: (ms) => {
      now += ms;
      const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at);
      for (const t of due) {
        const i = timers.indexOf(t);
        if (i < 0) continue;
        timers.splice(i, 1);
        t.fn();
      }
    },
    get nowMs() {
      return now;
    },
  };
}

test("the turn-on's noise follows mute and Channel static", () => {
  assert.equal(introAudible({ muted: false, staticFx: "sound" }), true);
  assert.equal(introAudible({ muted: true, staticFx: "sound" }), false);
  assert.equal(introAudible({ muted: false, staticFx: "silent" }), false);
  assert.equal(introAudible({ muted: false, staticFx: "off" }), false);
  assert.equal(introAudible(null), false);
  assert.equal(showBootSnow("sound"), true);
  assert.equal(showBootSnow("silent"), true);
  assert.equal(showBootSnow("off"), false);
});

test("reduced motion holds a still ident, and for less time", () => {
  assert.equal(prefersStill(() => ({ matches: true })), true);
  assert.equal(prefersStill(() => ({ matches: false })), false);
  assert.equal(prefersStill(() => { throw new Error("no matchMedia"); }), false);
  assert.ok(turnOnDuration(true) < turnOnDuration(false));
  assert.equal(turnOnDuration(false), TURN_ON_MS);
});

test("Back only skips; every other press skips and still happens", () => {
  assert.equal(turnOnAction(true, "back"), "skip");
  assert.equal(turnOnAction(true, "ok"), "both");
  assert.equal(turnOnAction(true, "mute"), "both");
  assert.equal(turnOnAction(true, "up"), "both");
  assert.equal(turnOnAction(false, "ok"), "run");
  assert.equal(turnOnAction(false, "back"), "run");
});

test("snow stays a postage stamp, even on a 4K TV with a high pixel ratio", () => {
  const big = snowBufferSize(3840, 2160, 3);
  assert.ok(big.w <= SNOW_CAP_W && big.h <= SNOW_CAP_H);
  assert.equal(big.dpr, SNOW_MAX_DPR);
  assert.equal(big.w * big.h <= SNOW_CAP_W * SNOW_CAP_H, true);
  const small = snowBufferSize(80, 45, 1);
  assert.deepEqual(small, { w: 80, h: 45, dpr: 1 });
  const fallback = snowBufferSize(0, -1, 0);
  assert.equal(fallback.w, SNOW_CAP_W);
  assert.equal(fallback.h, SNOW_CAP_H);
  assert.equal(SNOW_FRAMES.length, 3);
  assert.ok(SNOW_FRAMES[SNOW_FRAMES.length - 1] < 400);
  const px = snowPixels(4, 2, () => 0.5);
  assert.equal(px.length, 32);
  for (let i = 3; i < px.length; i += 4) assert.equal(px[i], 255);
});

test("no AudioContext means the turn-on stays silent", () => {
  assert.equal(playTurnOnSound(), null);
});

test("the overlay does not decide when to tune: the lineup does, and skip never waits out the clock", () => {
  const c = clock();
  let finished = 0;
  let waited = 0;
  let stopped = 0;
  const intro = createTurnOn({
    now: c.now,
    duration: 3400,
    schedule: c.schedule,
    cancel: c.cancel,
    audible: () => true,
    playSound: () => ({ stop() { stopped++; } }),
    onFinish: () => { finished++; },
    onWait: () => { waited++; },
  });
  // Lineup is in at 100ms. The tuner is the caller's job and can start now.
  // The overlay is still up: finishing early would cut the ident off.
  c.advance(100);
  intro.lineupReady();
  assert.equal(finished, 0);
  assert.equal(intro.active(), true);
  c.advance(3300);
  assert.equal(finished, 1);
  assert.equal(intro.active(), false);
  assert.equal(waited, 0);
  assert.equal(stopped, 1);
  intro.skip();
  assert.equal(finished, 1);
  assert.equal(stopped, 1);
});

test("skip before the lineup holds a still card and cuts the noise; the tuner is not involved", () => {
  const c = clock();
  let finished = 0;
  let waited = 0;
  let stopped = 0;
  const intro = createTurnOn({
    now: c.now,
    duration: 3400,
    schedule: c.schedule,
    cancel: c.cancel,
    audible: () => true,
    playSound: () => ({ stop() { stopped++; } }),
    onFinish: () => { finished++; },
    onWait: () => { waited++; },
  });
  let frames = 0;
  intro.arm(() => { frames++; }, 90);
  intro.skip();
  c.advance(500);
  assert.equal(frames, 0);
  assert.equal(stopped, 1);
  assert.equal(waited, 1);
  assert.equal(finished, 0);
  assert.equal(intro.active(), true);
  intro.lineupReady();
  assert.equal(finished, 1);
  assert.equal(intro.active(), false);
});

test("a muted set never starts the noise", () => {
  const c = clock();
  let played = 0;
  createTurnOn({
    now: c.now,
    duration: 800,
    schedule: c.schedule,
    cancel: c.cancel,
    audible: () => false,
    playSound: () => { played++; return { stop() {} }; },
    onFinish: () => {},
  });
  assert.equal(played, 0);
});

test("the boot path tunes as soon as the lineup is in, and does not sit on a timer first", () => {
  const src = readFileSync(new URL("../web/js/main.js", import.meta.url), "utf8");
  const boot = src.slice(src.indexOf("async function boot"), src.indexOf("boot();"));
  assert.equal(boot.includes("1300"), false);
  assert.ok(boot.indexOf("tuneTo(start)") > 0);
  assert.ok(boot.indexOf("tuneTo(start)") < boot.indexOf("lineupReady()"));
  const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
  assert.match(html, /class="boot-beam"/);
  assert.match(html, /class="boot-bars"/);
  assert.match(html, /id="boot-snow"[^>]*width="160"[^>]*height="90"/);
  assert.match(html, /ANY KEY OR TAP/);
  const css = readFileSync(new URL("../web/css/app.css", import.meta.url), "utf8");
  const section = css.slice(css.indexOf("/* ---------- boot ----------"), css.indexOf("/* ---------- What's new"));
  assert.doesNotMatch(section, /infinite/);
  assert.match(section, /prefers-reduced-motion/);
});
