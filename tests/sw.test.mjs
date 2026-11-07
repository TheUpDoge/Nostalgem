// The service worker keeps a copy of the app for a flaky connection. An ES module missing from that copy
// stops the whole app from starting offline, so every script and data file the TV loads must be listed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const web = fileURLToPath(new URL("../web/", import.meta.url));
const sw = readFileSync(join(web, "sw.js"), "utf8");
const shell = JSON.parse(sw.slice(sw.indexOf("[", sw.indexOf("const SHELL")), sw.indexOf("];", sw.indexOf("const SHELL")) + 1).replace(/,\s*\]$/, "]"));

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

test("every app script is in the offline copy", () => {
  const missing = files(join(web, "js"))
    .filter((p) => p.endsWith(".js"))
    .map((p) => p.slice(web.length).replace(/\\/g, "/"))
    .filter((p) => shell.indexOf(p) < 0);
  assert.deepEqual(missing, []);
});

test("the data files the TV loads are in the offline copy", () => {
  for (const f of ["data/lineup.json", "data/bumpers.json"]) assert.ok(shell.indexOf(f) >= 0, f);
});

test("the offline copy's version matches the app's", () => {
  const app = /const VERSION = "([^"]+)"/.exec(readFileSync(join(web, "js/main.js"), "utf8"))[1];
  assert.match(sw, new RegExp('const VERSION = "ng-' + app.replace(/\./g, "\\.") + '"'));
});
