// Gamepad support: the button mapping and the press/repeat logic, on fake pads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { actionForButton, newPadState, padStep } from "../web/js/gamepad.js";

function snap(pressed, axes) {
  var buttons = [];
  for (var i = 0; i < 16; i++) buttons.push(pressed.indexOf(i) >= 0);
  return { buttons: buttons, axes: axes || [0, 0] };
}

test("button mapping", () => {
  assert.equal(actionForButton(0), "ok");
  assert.equal(actionForButton(1), "back");
  assert.equal(actionForButton(2), "playpause");
  assert.equal(actionForButton(8), "back");
  assert.equal(actionForButton(9), "menu");
  assert.equal(actionForButton(12), "up");
  assert.equal(actionForButton(13), "down");
  assert.equal(actionForButton(14), "left");
  assert.equal(actionForButton(15), "right");
  assert.equal(actionForButton(3), null);
  assert.equal(actionForButton(4), null);
});

test("face buttons fire once per press", () => {
  var state = newPadState();
  assert.deepEqual(padStep(state, snap([0]), 1000), ["ok"]);
  assert.deepEqual(padStep(state, snap([0]), 1100), []);
  assert.deepEqual(padStep(state, snap([]), 1200), []);
  assert.deepEqual(padStep(state, snap([0]), 1300), ["ok"]);
  assert.deepEqual(padStep(state, snap([1, 2, 9]), 1400), ["back", "playpause", "menu"]);
});

test("a held D-pad direction repeats, a held face button does not", () => {
  var state = newPadState();
  assert.deepEqual(padStep(state, snap([12]), 1000), ["up"]);
  assert.deepEqual(padStep(state, snap([12]), 1200), []);
  assert.deepEqual(padStep(state, snap([12]), 1499), []);
  assert.deepEqual(padStep(state, snap([12]), 1500), ["up"]);
  assert.deepEqual(padStep(state, snap([12]), 1850), ["up"]);
  assert.deepEqual(padStep(state, snap([]), 1900), []);
  assert.deepEqual(padStep(state, snap([13]), 2000), ["down"]);
  // Left and right fire once; holding them never re-opens the guide or the menu.
  assert.deepEqual(padStep(state, snap([14]), 2100), ["left"]);
  assert.deepEqual(padStep(state, snap([14]), 3000), []);
});

test("the left stick drives channels, with a dead zone", () => {
  var state = newPadState();
  assert.deepEqual(padStep(state, snap([], [0, -0.8]), 1000), ["up"]);
  assert.deepEqual(padStep(state, snap([], [0, 0.8]), 1100), ["down"]);
  assert.deepEqual(padStep(state, snap([], [0, -0.3]), 1200), []);
  assert.deepEqual(padStep(state, snap([], [0.8, 0]), 1300), ["right"]);
});

test("no pad, no actions", () => {
  var state = newPadState();
  assert.deepEqual(padStep(state, null, 1000), []);
  assert.deepEqual(padStep(state, { buttons: [], axes: [] }, 1100), []);
});
