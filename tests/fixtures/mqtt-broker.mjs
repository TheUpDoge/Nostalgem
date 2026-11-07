// A tiny MQTT broker over WebSocket for tests: CONNECT, SUBSCRIBE, PUBLISH (QoS 0), PING. It passes each
// PUBLISH to the clients subscribed to that exact topic, and keeps every payload it saw in .seen so a
// test can check nothing readable went through it.
//
//   const b = await startBroker(); // b.url, b.seen, b.close()

import { createRequire } from "node:module";
import { mqttParse, mqttReadPublish } from "../../web/js/relay.js";

const require = createRequire(import.meta.url);
// ws comes with PeerJS's server, which the phone tests already install.
const { WebSocketServer } = createRequire(require.resolve("peer"))("ws");

export function startBroker() {
  return new Promise((ok) => {
    const wss = new WebSocketServer({ host: "127.0.0.1", port: 0, handleProtocols: (p) => (p.has("mqtt") ? "mqtt" : false) });
    const clients = new Set();
    const seen = [];
    wss.on("connection", (ws) => {
      const c = { ws, topics: new Set(), buf: new Uint8Array(0) };
      clients.add(c);
      ws.on("message", (data) => {
        const add = new Uint8Array(data);
        const all = new Uint8Array(c.buf.length + add.length);
        all.set(c.buf);
        all.set(add, c.buf.length);
        const parsed = mqttParse(all);
        c.buf = new Uint8Array(parsed.rest);
        for (const p of parsed.packets) {
          if (p.type === 1) ws.send(Buffer.from([0x20, 2, 0, 0])); // CONNACK, accepted
          else if (p.type === 8) {
            const tlen = (p.body[2] << 8) | p.body[3];
            c.topics.add(Buffer.from(p.body.subarray(4, 4 + tlen)).toString("utf8"));
            ws.send(Buffer.from([0x90, 3, p.body[0], p.body[1], 0])); // SUBACK
          } else if (p.type === 3) {
            const pub = mqttReadPublish(p);
            seen.push(Buffer.from(pub.payload));
            const header = [0x30];
            let n = p.body.length;
            do {
              let b = n % 128;
              n = Math.floor(n / 128);
              if (n > 0) b |= 128;
              header.push(b);
            } while (n > 0);
            const out = Buffer.concat([Buffer.from(header), Buffer.from(p.body)]);
            for (const o of clients) if (o !== c && o.topics.has(pub.topic) && o.ws.readyState === 1) o.ws.send(out);
          } else if (p.type === 12) ws.send(Buffer.from([0xd0, 0])); // PINGRESP
          else if (p.type === 14) ws.close();
        }
      });
      ws.on("close", () => clients.delete(c));
    });
    wss.on("listening", () => {
      ok({ url: "ws://127.0.0.1:" + wss.address().port + "/", seen, close: () => wss.close() });
    });
  });
}
