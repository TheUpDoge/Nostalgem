import { test } from "node:test";
import assert from "node:assert/strict";
import { actionFor } from "../web/js/remote.js";

const type = (e) => {
  const a = actionFor(e);
  return a && (a.type === "digit" ? "digit:" + a.digit : a.type);
};

test("arrow keys and OK", () => {
  assert.equal(type({ key: "ArrowUp" }), "up");
  assert.equal(type({ key: "ArrowDown" }), "down");
  assert.equal(type({ key: "ArrowLeft" }), "left");
  assert.equal(type({ key: "ArrowRight" }), "right");
  assert.equal(type({ key: "Enter" }), "ok");
});

test("channel buttons, by name and by legacy TV key codes", () => {
  assert.equal(type({ key: "ChannelUp" }), "chup");
  assert.equal(type({ key: "PageDown" }), "chdown");
  assert.equal(type({ key: "Unidentified", keyCode: 427 }), "chup");
  assert.equal(type({ key: "Unidentified", keyCode: 428 }), "chdown");
});

test("Back on every TV platform", () => {
  assert.equal(type({ key: "Escape" }), "back");
  assert.equal(type({ key: "GoBack" }), "back");
  assert.equal(type({ key: "Unidentified", keyCode: 461 }), "back"); // LG webOS
  assert.equal(type({ key: "Unidentified", keyCode: 10009 }), "back"); // Samsung Tizen
});

test("number keys, including the keypad and old keyCode-only browsers", () => {
  assert.equal(type({ key: "7" }), "digit:7");
  assert.equal(type({ keyCode: 52 }), "digit:4");
  assert.equal(type({ keyCode: 99 }), "digit:3");
});

test("media and colored buttons", () => {
  assert.equal(type({ key: "MediaPlayPause" }), "playpause");
  assert.equal(type({ key: " " }), "playpause");
  assert.equal(type({ key: "ColorF0Red" }), "red");
  assert.equal(type({ key: "Unidentified", keyCode: 406 }), "blue");
  assert.equal(type({ key: "Guide" }), "guide");
  assert.equal(type({ key: "Info" }), "info");
});

test("browser shortcuts are left alone", () => {
  assert.equal(actionFor({ key: "r", ctrlKey: true }), null);
  assert.equal(actionFor({ key: "ArrowLeft", altKey: true }), null);
  assert.equal(actionFor({ key: "z" }), null);
});
