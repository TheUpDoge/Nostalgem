import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCode, cleanCode, peerIdFor, prettyCode, remoteUrl, checkMessage, isIPv4, lanCopies, sendLanCopies, linkReport, CODE_LENGTH, PAGES_REMOTE } from "../web/js/link.js";

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

test("real addresses for the TV's hidden ones", () => {
  assert.ok(isIPv4("192.168.1.23"));
  assert.ok(!isIPv4("192.168.1.256"));
  assert.ok(!isIPv4("fe80::1"));
  assert.ok(!isIPv4("1f0c.local"));
  const cand = (text) => ({
    type: "CANDIDATE",
    dst: "phone-1",
    payload: { type: "data", connectionId: "dc_1", candidate: { candidate: text, sdpMid: "0", sdpMLineIndex: 0, usernameFragment: "abcd" } },
  });
  const hidden = cand("candidate:1467250027 1 udp 2122260223 4b2a6f7e-1c3d-4e5f-8a9b-0c1d2e3f4a5b.local 54321 typ host generation 0 ufrag abcd network-id 1");
  const copies = lanCopies(hidden, ["192.168.1.23", "not an ip", "10.0.0.5"]);
  assert.equal(copies.length, 2);
  assert.equal(copies[0].payload.candidate.candidate, "candidate:1467250027 1 udp 2122260223 192.168.1.23 54321 typ host generation 0 ufrag abcd network-id 1");
  assert.equal(copies[1].payload.candidate.candidate.split(" ")[4], "10.0.0.5");
  assert.deepEqual(
    { dst: copies[0].dst, type: copies[0].type, conn: copies[0].payload.connectionId, mid: copies[0].payload.candidate.sdpMid, idx: copies[0].payload.candidate.sdpMLineIndex, ufrag: copies[0].payload.candidate.usernameFragment },
    { dst: "phone-1", type: "CANDIDATE", conn: "dc_1", mid: "0", idx: 0, ufrag: "abcd" }
  );
  // Only hidden UDP addresses, only candidates, only when the app gave an address.
  assert.deepEqual(lanCopies(cand("candidate:1 1 udp 2122260223 192.168.1.9 54321 typ host generation 0"), ["192.168.1.23"]), []);
  assert.deepEqual(lanCopies(cand("candidate:2 1 tcp 1518280447 4b2a.local 9 typ host tcptype active"), ["192.168.1.23"]), []);
  assert.deepEqual(lanCopies(cand("candidate:3 1 udp 1686052607 203.0.113.7 61000 typ srflx raddr 0.0.0.0 rport 0"), ["192.168.1.23"]), []);
  assert.deepEqual(lanCopies(hidden, []), []);
  assert.deepEqual(lanCopies({ type: "ANSWER", payload: {} }, ["192.168.1.23"]), []);
});

test("the TV's peer sends the copies right after each hidden address", () => {
  const sent = [];
  const peer = { socket: { send: (m) => sent.push(m) } };
  let ips = [];
  assert.ok(sendLanCopies(peer, () => ips));
  assert.ok(!sendLanCopies(peer, () => ips), "wraps only once");
  const hidden = { type: "CANDIDATE", dst: "p", payload: { candidate: { candidate: "candidate:1 1 udp 2122260223 ab12.local 5000 typ host" } } };
  peer.socket.send(hidden);
  assert.equal(sent.length, 1, "no address from the app yet: just the original");
  ips = ["192.168.0.40"];
  peer.socket.send({ type: "HEARTBEAT" });
  peer.socket.send(hidden);
  assert.equal(sent.length, 4);
  assert.equal(sent[2], hidden);
  assert.match(sent[3].payload.candidate.candidate, / 192\.168\.0\.40 5000 typ host$/);
  assert.ok(!sendLanCopies({}, () => ips), "a stand-in peer without a socket is left alone");
});

test("a failed link says how far the handshake got", async () => {
  assert.equal(await linkReport(null), "no answer yet");
  const stats = new Map([
    ["L1", { type: "local-candidate", candidateType: "host", address: "9f1e.local" }],
    ["L2", { type: "local-candidate", candidateType: "srflx", address: "203.0.113.7" }],
    ["R1", { type: "remote-candidate", candidateType: "host", address: "4b2a.local" }],
    ["R2", { type: "remote-candidate", candidateType: "host", address: "192.168.1.23" }],
    ["R3", { type: "remote-candidate", candidateType: "relay", address: "198.51.100.2" }],
    ["P1", { type: "candidate-pair", state: "failed" }],
    ["P2", { type: "candidate-pair", state: "failed" }],
  ]);
  const conn = { peerConnection: { remoteDescription: { type: "answer" }, iceConnectionState: "failed", getStats: () => Promise.resolve(stats) } };
  assert.equal(await linkReport(conn), "answered · ICE failed · here: 1 hidden, 1 public · there: 1 hidden, 1 local, 1 relay · 0 of 2 routes worked");
  const silent = { peerConnection: { remoteDescription: null, iceConnectionState: "new", getStats: () => Promise.reject(new Error("closed")) } };
  assert.equal(await linkReport(silent), "no answer · ICE new");
});
