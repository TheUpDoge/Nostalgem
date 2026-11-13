// The loading card stays up until the picture is really playing, within a minimum and a hard cap.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LOAD_CARD_HOLD, LOAD_CARD_GRACE, pictureReady, loadCardDecision } from "../web/js/loadhold.js";

const MIN = 1500;
const shown = 10000;

test("a picture is ready from a frame, advancing time, or buffered data, and playing alone is not", () => {
  assert.equal(pictureReady({ playing: true, signals: true, readyState: 2, currentTime: 1, lastTime: 1 }), false);
  assert.equal(pictureReady({ playing: false, signals: true, readyState: 4, frame: true }), false);
  assert.equal(pictureReady({ playing: true, signals: true, frame: true }), true);
  assert.equal(pictureReady({ playing: true, signals: true, currentTime: 1.2, lastTime: 1 }), true);
  assert.equal(pictureReady({ playing: true, signals: true, readyState: 3 }), true);
  assert.equal(pictureReady({ playing: true, signals: false }), true, "no signals: the old playing check");
});

test("early-ready still waits out the minimum", () => {
  const d = loadCardDecision(shown, shown, 0, true, MIN);
  assert.equal(d.hide, false);
  assert.equal(d.readyAt, shown);
  const later = loadCardDecision(shown + MIN - 1, shown, d.readyAt, true, MIN);
  assert.equal(later.hide, false);
  const due = loadCardDecision(shown + MIN, shown, d.readyAt, true, MIN);
  assert.equal(due.hide, true);
});

test("a picture that becomes ready later waits out the grace, not just the minimum", () => {
  const at = shown + 3000;
  const waiting = loadCardDecision(at, shown, 0, true, MIN);
  assert.equal(waiting.readyAt, at);
  assert.equal(waiting.hide, false);
  const before = loadCardDecision(at + LOAD_CARD_GRACE - 1, shown, at, true, MIN);
  assert.equal(before.hide, false);
  const after = loadCardDecision(at + LOAD_CARD_GRACE, shown, at, true, MIN);
  assert.equal(after.hide, true);
});

test("never-ready holds, then the hard maximum clears the card", () => {
  assert.ok(LOAD_CARD_HOLD >= 8000 && LOAD_CARD_HOLD <= 10000);
  const mid = loadCardDecision(shown + LOAD_CARD_HOLD - 1, shown, 0, false, MIN);
  assert.equal(mid.hide, false);
  assert.equal(mid.readyAt, 0);
  const cap = loadCardDecision(shown + LOAD_CARD_HOLD, shown, 0, false, MIN);
  assert.equal(cap.hide, true);
});
