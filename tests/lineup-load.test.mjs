// How the set picks its lineup: the TV app prefers the published (daily) lineup, then the copy it saved
// last time, then the one inside the APK, always the newest usable one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadLineup, newest, usable, LINEUP_FORMAT } from "../web/js/lineup.js";

const L = (built, extra) => ({ built, channels: [{ slug: "a", items: [] }], ...extra });
const BUNDLED = "data/lineup.json";
const LIVE = "https://example.org/data/lineup.json";

function world({ web, bundled, saved }) {
  const asked = [];
  const stored = { value: saved };
  return {
    asked,
    stored,
    fetchJson: async (url) => {
      asked.push(url);
      const v = url.startsWith(LIVE) ? web : url === BUNDLED ? bundled : undefined;
      if (v instanceof Error) throw v;
      if (v === undefined) throw new Error("404");
      return v;
    },
    store: {
      get: async () => stored.value || null,
      put: async (url, l) => {
        assert.equal(url, LIVE);
        stored.value = l;
      },
    },
  };
}
const run = (w, live = LIVE) => loadLineup({ bundled: BUNDLED, live, fetchJson: w.fetchJson, store: w.store });

test("a lineup is usable when it has channels and a format this app understands", () => {
  assert.ok(usable(L("2026-11-01T00:00:00Z")));
  assert.ok(usable(L("2026-11-01T00:00:00Z", { format: LINEUP_FORMAT })));
  assert.ok(!usable(L("2026-11-01T00:00:00Z", { format: LINEUP_FORMAT + 1 })), "a newer format needs a newer app");
  assert.ok(!usable({ built: "x", channels: [] }));
  assert.ok(!usable(null));
  assert.ok(!usable("<html>"));
  assert.equal(newest([null, L("2026-01-01T00:00:00Z"), L("2026-02-01T00:00:00Z")]).built, "2026-02-01T00:00:00Z");
  const a = L("2026-01-01T00:00:00Z");
  assert.equal(newest([a, L("2026-01-01T00:00:00Z")]), a, "a tie goes to the first");
});

test("the website: just the bundled lineup, nothing saved", async () => {
  const w = world({ web: L("2026-11-06T09:00:00Z"), bundled: L("2026-11-01T00:00:00Z") });
  const got = await run(w, "");
  assert.equal(got.source, "bundled");
  assert.ok(!w.asked.some((u) => u.startsWith(LIVE)));
});

test("the TV app takes the published lineup and saves a copy", async () => {
  const web = L("2026-11-06T09:00:00Z");
  const w = world({ web, bundled: L("2026-11-01T00:00:00Z") });
  const got = await run(w);
  assert.equal(got.source, "web");
  assert.equal(got.lineup, web);
  assert.equal(w.stored.value, web);
  assert.match(w.asked.find((u) => u.startsWith(LIVE)), /\?h=\d+$/, "an hourly cache-buster");
});

test("offline: the saved copy if it's newer than the APK's, else the APK's", async () => {
  const saved = L("2026-11-05T09:00:00Z");
  let got = await run(world({ web: new Error("offline"), bundled: L("2026-11-01T00:00:00Z"), saved }));
  assert.equal(got.source, "saved");
  assert.equal(got.lineup, saved);
  got = await run(world({ web: new Error("offline"), bundled: L("2026-11-07T00:00:00Z"), saved }));
  assert.equal(got.source, "bundled", "a freshly installed app has a newer lineup than an old saved copy");
  got = await run(world({ web: new Error("offline"), bundled: L("2026-11-01T00:00:00Z") }));
  assert.equal(got.source, "bundled");
});

test("a published lineup this app can't read is skipped and not saved", async () => {
  const saved = L("2026-11-05T09:00:00Z");
  const w = world({ web: L("2026-12-01T00:00:00Z", { format: LINEUP_FORMAT + 1 }), bundled: L("2026-11-01T00:00:00Z"), saved });
  const got = await run(w);
  assert.equal(got.source, "saved");
  assert.equal(w.stored.value, saved);
});

test("nothing at all: null, so the boot screen keeps retrying", async () => {
  assert.equal(await run(world({ web: new Error("x"), bundled: new Error("x") })), null);
});
