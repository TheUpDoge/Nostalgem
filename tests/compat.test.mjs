// TV browsers lag behind desktop ones (a 2019 TV may have Chromium 69-ish), so the app sticks to ES2018:
// no optional chaining (?.), no ?? and no class fields. This parses every file as ES2018 to keep it that way.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "acorn";

const web = fileURLToPath(new URL("../web/", import.meta.url));
function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".js") ? [p] : [];
  });
}

for (const file of files(join(web, "js")).concat([join(web, "sw.js")])) {
  test("ES2018: " + file.slice(web.length), () => {
    const src = readFileSync(file, "utf8");
    assert.doesNotThrow(() => parse(src, { ecmaVersion: 2018, sourceType: file.endsWith("sw.js") ? "script" : "module" }));
  });
}
