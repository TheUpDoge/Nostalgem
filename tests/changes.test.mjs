// What's new: a welcome on a first start, the changes since last time after an update, nothing otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHANGES, compareVersions, whatsNew, changesHtml, WELCOME_HTML } from "../web/js/changes.js";

const VERSION = /const VERSION = "([\d.]+)"/.exec(readFileSync(new URL("../web/js/main.js", import.meta.url), "utf8"))[1];

test("versions compare by number", () => {
  assert.equal(compareVersions("1.10.0", "1.9.2"), 1);
  assert.equal(compareVersions("1.9.0", "1.9"), 0);
  assert.equal(compareVersions("1.8.9", "1.9.0"), -1);
  assert.equal(compareVersions("", "0.0.1"), -1);
});

test("the app's version has its own entry, newest first", () => {
  assert.equal(CHANGES[0].v, VERSION);
  for (let i = 1; i < CHANGES.length; i++) assert.equal(compareVersions(CHANGES[i - 1].v, CHANGES[i].v), 1, CHANGES[i].v);
  for (const c of CHANGES) assert.ok(c.title && c.items.length, c.v);
});

test("a first start gets a welcome; an update, what changed since; the same version, nothing", () => {
  assert.equal(whatsNew("", VERSION, false).kind, "welcome");
  const up = whatsNew("1.6.0", "1.9.0", true);
  assert.equal(up.kind, "update");
  assert.deepEqual(up.entries.map((c) => c.v), ["1.9.0", "1.8.0", "1.7.0"]);
  // Someone from before this page existed: their changes since 1.5.0, not a welcome.
  assert.deepEqual(whatsNew("", "1.9.0", true).entries.map((c) => c.v), ["1.9.0", "1.8.0", "1.7.0", "1.6.0"]);
  assert.equal(whatsNew("1.9.0", "1.9.0", true).kind, "");
  assert.equal(whatsNew("999.0.0", "1.9.0", true).kind, "");
  // A version not released yet isn't listed.
  assert.deepEqual(whatsNew("1.7.0", "1.8.0", true).entries.map((c) => c.v), ["1.8.0"]);
});

test("the pages are plain markup", () => {
  const html = changesHtml(CHANGES);
  assert.match(html, /v1\.9\.0/);
  assert.doesNotMatch(html + WELCOME_HTML, /<script|\son[a-z]+=/i);
  assert.match(changesHtml([{ v: "1", title: "<b>", items: ["a & b"] }]), /&lt;b&gt;.*a &amp; b/);
});

test("a version with nothing new to tell shows no page", async () => {
  const { whatsNew } = await import("../web/js/changes.js");
  const log = [
    { v: "2.0.0", title: "Two", items: ["x"] },
    { v: "1.0.0", title: "One", items: ["y"] },
  ];
  assert.equal(whatsNew("2.0.0", "2.0.1", true, log).kind, "");
  assert.deepEqual(whatsNew("1.0.0", "2.0.1", true, log).entries.map((c) => c.v), ["2.0.0"]);
});
