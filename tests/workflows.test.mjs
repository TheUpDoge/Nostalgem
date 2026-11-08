// The GitHub workflows' YAML: a plain (unquoted) value with ": " or " #" in it doesn't parse, and a workflow
// that doesn't parse never runs — no tests, no deploy (1.9.0's web workflow, for one).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", ".github", "workflows");

test("workflow names and run lines are plain values YAML can read", async () => {
  const files = (await readdir(dir)).filter((f) => /\.ya?ml$/.test(f));
  assert.ok(files.length > 0);
  for (const f of files) {
    const lines = (await readFile(join(dir, f), "utf8")).split("\n");
    lines.forEach((line, i) => {
      const m = /^\s*(?:- )?(name|run|description): (.+)$/.exec(line);
      if (!m) return;
      const v = m[2].trim();
      if (/^["'|>]/.test(v)) return; // quoted or a block
      assert.ok(!/: /.test(v) && !/ #/.test(v), `${f}:${i + 1}: "${v}" needs quotes (or rewording) to be valid YAML`);
    });
  }
});
