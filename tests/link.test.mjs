import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCode, cleanCode, peerIdFor, prettyCode, remoteUrl, checkMessage, CODE_LENGTH, PAGES_REMOTE } from "../web/js/link.js";

test("pairing codes are six easy-to-read characters", () => {
  for (let i = 0; i < 200; i++) {
    const c = makeCode();
    assert.equal(c.length, CODE_LENGTH);
    assert.match(c, /^[2-9A-HJKMNP-TW-Z]+$/);
    assert.equal(cleanCode(c), c);
  }
  assert.equal(makeCode(() => 0), "222222");
  assert.equal(makeCode(() => 0.9999999), "ZZZZZZ");
});

test("codes are read from what a person types or a link carries", () => {
  assert.equal(cleanCode("k7p-q2m"), "K7PQ2M");
  assert.equal(cleanCode(" K7P Q2M "), "K7PQ2M");
  assert.equal(cleanCode("#K7PQ2M"), "K7PQ2M");
  assert.equal(cleanCode("https://theupdoge.github.io/Nostalgem/remote.html#K7PQ2M"), "K7PQ2M");
  assert.equal(cleanCode("K7PQ2"), "", "too short");
  assert.equal(cleanCode("K7PQ2O"), "", "O isn't used (looks like 0)");
  assert.equal(cleanCode(""), "");
  assert.equal(cleanCode(null), "");
});

test("peer ids and display", () => {
  assert.equal(peerIdFor("K7PQ2M"), "nostalgem-k7pq2m");
  assert.equal(prettyCode("K7PQ2M"), "K7P-Q2M");
});

test("the QR link points somewhere a phone can reach", () => {
  const at = (href) => {
    const u = new URL(href);
    return { href: u.href, protocol: u.protocol, hostname: u.hostname };
  };
  assert.equal(remoteUrl("K7PQ2M", at("https://appassets.androidplatform.net/assets/www/index.html?tv=android")), PAGES_REMOTE + "#K7PQ2M");
  assert.equal(remoteUrl("K7PQ2M", at("http://localhost:8080/")), PAGES_REMOTE + "#K7PQ2M");
  assert.equal(remoteUrl("K7PQ2M", at("http://127.0.0.1:8080/index.html")), PAGES_REMOTE + "#K7PQ2M");
  assert.equal(remoteUrl("K7PQ2M", at("file:///sdcard/index.html")), PAGES_REMOTE + "#K7PQ2M");
  assert.equal(remoteUrl("K7PQ2M", at("https://theupdoge.github.io/Nostalgem/?ch=3")), "https://theupdoge.github.io/Nostalgem/remote.html#K7PQ2M");
  assert.equal(remoteUrl("K7PQ2M", at("http://192.168.1.20:8080/index.html#x")), "http://192.168.1.20:8080/remote.html#K7PQ2M");
  assert.equal(remoteUrl("K7PQ2M", null, "https://example.org/r.html"), "https://example.org/r.html#K7PQ2M");
});

test("messages from a phone are checked", () => {
  assert.deepEqual(checkMessage({ t: "key", type: "chup" }), { t: "key", type: "chup" });
  assert.deepEqual(checkMessage({ t: "key", type: "digit", digit: 7 }), { t: "key", type: "digit", digit: 7 });
  assert.equal(checkMessage({ t: "key", type: "digit", digit: 12 }), null);
  assert.equal(checkMessage({ t: "key", type: "digit", digit: 1.5 }), null);
  assert.equal(checkMessage({ t: "key", type: "reboot" }), null);
  assert.equal(checkMessage({ t: "key", type: "__proto__" }), null);
  assert.deepEqual(checkMessage({ t: "tune", slug: "high-noon" }), { t: "tune", slug: "high-noon" });
  assert.equal(checkMessage({ t: "tune", slug: 5 }), null);
  assert.deepEqual(checkMessage({ t: "search", text: "  lone   ranger ", kind: "audio" }), { t: "search", text: "lone ranger", kind: "audio" });
  assert.deepEqual(checkMessage({ t: "search", text: "jazz", kind: "anything" }), { t: "search", text: "jazz", kind: "video" });
  assert.equal(checkMessage({ t: "search", text: "a" }), null);
  assert.equal(checkMessage({ t: "search", text: "x".repeat(500) }).text.length, 120);
  assert.equal(checkMessage({ t: "eval", code: "1" }), null);
  assert.equal(checkMessage("chup"), null);
  assert.equal(checkMessage(null), null);
});
