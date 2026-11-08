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

// A remote with no number buttons: a number typed into Search tunes the channel instead of building one.
import { numberText } from "../web/js/util.js";

test("a channel number typed as words reads as remote digits", () => {
  assert.equal(numberText("777"), "777");
  assert.equal(numberText(" 420 "), "420");
  assert.equal(numberText("15-2"), "152");
  assert.equal(numberText("50 10"), "5010");
  assert.equal(numberText("CH 50"), "50");
  assert.equal(numberText("channel 15.2"), "152");
  assert.equal(numberText("1984"), "1984"); // a number, but no channel has it: the search still runs
  assert.equal(numberText("lone ranger"), "");
  assert.equal(numberText("chopper 7"), "");
  assert.equal(numberText("12345"), "");
  assert.equal(numberText(""), "");
});
