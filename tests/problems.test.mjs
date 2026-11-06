import { test } from "node:test";
import assert from "node:assert/strict";
import { failureInfo, standbyText } from "../web/js/problems.js";

test("one video that can't play here is skipped; the service is fine", () => {
  for (const code of [2, 100, 101, 150]) {
    const f = failureInfo({ youtube: true, code, reason: "error" });
    assert.equal(f.kind, "item", "YouTube error " + code);
    assert.equal(f.service, "youtube");
    assert.ok(f.text && f.short);
  }
  assert.match(failureInfo({ youtube: true, code: 150 }).text, /not in this country/);
  assert.equal(failureInfo({ youtube: false, code: 3 }).kind, "item", "a damaged Archive file");
  assert.equal(failureInfo({ youtube: true, reason: "ended" }).kind, "item", "a live broadcast that ended");
});

test("YouTube not loading, or refusing the page, is about the service, not the program", () => {
  for (const code of [0, 152, 153]) {
    const f = failureInfo({ youtube: true, code, reason: "error" });
    assert.equal(f.kind, "service", "YouTube error " + code);
    assert.equal(f.service, "youtube");
  }
  assert.match(failureInfo({ youtube: true, code: 0 }).text, /blocker/);
});

test("timeouts, stalls and files that won't load could be either", () => {
  assert.equal(failureInfo({ youtube: false, reason: "timeout" }).kind, "unsure");
  assert.match(failureInfo({ youtube: false, reason: "timeout" }).text, /Internet Archive/);
  assert.match(failureInfo({ youtube: true, reason: "timeout" }).text, /YouTube/);
  assert.equal(failureInfo({ youtube: false, reason: "stall" }).kind, "unsure");
  assert.equal(failureInfo({ youtube: false, code: 4, reason: "error" }).kind, "unsure");
  assert.equal(failureInfo({ youtube: false, code: 2, reason: "error" }).kind, "unsure");
  assert.equal(failureInfo({ youtube: true, code: 5 }).kind, "unsure");
  const odd = failureInfo({ youtube: true, code: 999 });
  assert.equal(odd.kind, "unsure");
  assert.match(odd.text, /error 999/);
});

test("technical difficulties name what isn't answering", () => {
  assert.match(standbyText("offline"), /offline/);
  assert.match(standbyText("youtube"), /YouTube/);
  assert.match(standbyText("archive"), /Internet Archive/);
  assert.equal(standbyText("youtube", "YouTube's player didn't load."), "YouTube's player didn't load.");
  assert.match(standbyText("offline", "ignored"), /offline/);
});
