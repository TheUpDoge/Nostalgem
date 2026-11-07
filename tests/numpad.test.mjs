// The on-screen number pad: arrows stay inside the 3×4 keypad, and typed numbers read like channels.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PAD_KEYS, padMove, padLabel } from "../web/js/ui/numpad.js";

test("the keypad is 1–9, then ⌫ 0 GO", () => {
  assert.deepEqual(PAD_KEYS, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "go"]);
});

test("arrows move around the keypad and stop at its edges", () => {
  assert.equal(padMove(0, "down"), 3);
  assert.equal(padMove(0, "right"), 1);
  assert.equal(padMove(0, "up"), 0);
  assert.equal(padMove(0, "left"), 0);
  assert.equal(padMove(4, "down"), 7);
  assert.equal(padMove(10, "down"), 10);
  assert.equal(padMove(10, "right"), 11);
  assert.equal(padMove(11, "right"), 11);
});

test("typed numbers read like channel numbers", () => {
  assert.equal(padLabel(""), "– –");
  assert.equal(padLabel("4"), "4");
  assert.equal(padLabel("15"), "15");
  assert.equal(padLabel("152"), "15-2");
  assert.equal(padLabel("6010"), "60-10");
});
