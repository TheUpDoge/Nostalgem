// The relay's pieces that don't need a browser: MQTT packets, and the code-derived topic and key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mqttConnect, mqttSubscribe, mqttPublish, mqttParse, mqttReadPublish, relayKeys, seal, unseal, RELAY_BROKERS } from "../web/js/relay.js";

test("MQTT packets come apart the way they went together, even split across reads", () => {
  const payload = new Uint8Array(300).map((_, i) => i & 255); // a remaining length over 127 takes two bytes
  const bytes = new Uint8Array([...mqttConnect("ng123", 45), ...mqttSubscribe(7, "a/b"), ...mqttPublish("nostalgem/v1/x/tv", payload)]);
  const half = mqttParse(bytes.subarray(0, bytes.length - 10));
  assert.equal(half.packets.length, 2);
  const all = mqttParse(bytes);
  assert.deepEqual(
    all.packets.map((p) => p.type),
    [1, 8, 3]
  );
  assert.equal(all.rest.length, 0);
  const pub = mqttReadPublish(all.packets[2]);
  assert.equal(pub.topic, "nostalgem/v1/x/tv");
  assert.deepEqual(Array.from(pub.payload), Array.from(payload));
});

test("the same code gives the same hidden topic on both sides; another code doesn't", async () => {
  const a = await relayKeys("ABC234");
  const b = await relayKeys("ABC234");
  const c = await relayKeys("ABC235");
  assert.equal(a.topic, b.topic);
  assert.notEqual(a.topic, c.topic);
  assert.match(a.topic, /^nostalgem\/v1\/[0-9a-f]{32}$/);
  assert.ok(a.topic.indexOf("ABC234") < 0);
});

test("messages are sealed: readable only with the same code", async () => {
  const a = await relayKeys("ABC234");
  const b = await relayKeys("ABC234");
  const other = await relayKeys("ZZZ999");
  const box = await seal(a.key, { k: "msg", from: "p1", m: { t: "key", type: "chup" } });
  assert.ok(Buffer.from(box).toString("latin1").indexOf("chup") < 0);
  assert.deepEqual(await unseal(b.key, box), { k: "msg", from: "p1", m: { t: "key", type: "chup" } });
  assert.equal(await unseal(other.key, box), null);
  assert.equal(await unseal(a.key, new Uint8Array(40)), null);
  // Two seals of the same message differ (fresh nonce each time).
  const again = await seal(a.key, { k: "msg", from: "p1", m: { t: "key", type: "chup" } });
  assert.notDeepEqual(Array.from(again), Array.from(box));
});

test("the relay uses secure WebSockets to more than one broker", () => {
  assert.ok(RELAY_BROKERS.length >= 2);
  for (const u of RELAY_BROKERS) assert.match(u, /^wss:\/\//);
});
