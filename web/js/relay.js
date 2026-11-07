// The relay: a second way for the phone remote to reach the TV, for networks where the two can't reach
// each other directly (router "AP isolation", guest Wi-Fi, a phone on mobile data, VPNs, a blocked
// pairing service). Both sides connect out to public MQTT message brokers over secure WebSockets and
// pass messages through them. The direct WebRTC link (link.js) still runs, and wins when it comes up.
//
// What goes through a broker is encrypted (AES-GCM) with a key made from the pairing code, under a topic
// name that's a hash of the code, so the brokers only see noise.
//
// The TV listens on every broker at once; the phone talks on every broker until the TV answers on one,
// then stays on that one. A broker that's down or blocked on either network just isn't used.
//
// Frames, inside the encryption:
//   phone → TV  { k: "join" | "msg" | "ping" | "bye", from, m? }
//   TV → phone  { k: "msg" | "pong" | "bye", to, m? }
//               { k: "tvup", to: "*" }  the TV just came on: phones that were paired rejoin at once

export const RELAY_BROKERS = ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt", "wss://test.mosquitto.org:8081/"];

const enc = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
const dec = typeof TextDecoder !== "undefined" ? new TextDecoder() : null;

export function relaySupported() {
  return !!(enc && dec && typeof WebSocket !== "undefined" && typeof crypto !== "undefined" && crypto.subtle && crypto.getRandomValues);
}

export function relayBrokers() {
  const w = typeof window !== "undefined" ? window : {};
  return w.NostalGemRelayBrokers || RELAY_BROKERS;
}

// ---------- MQTT 3.1.1, just what's needed: connect, subscribe, publish (QoS 0), ping ----------
function varint(n) {
  const out = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) b |= 128;
    out.push(b);
  } while (n > 0);
  return out;
}
function str(s) {
  const b = enc.encode(s);
  return [b.length >> 8, b.length & 255].concat(Array.from(b));
}
function packet(first, body) {
  return new Uint8Array([first].concat(varint(body.length), body));
}

export function mqttConnect(clientId, keepalive) {
  // "MQTT", level 4, clean session, keep-alive seconds, client id
  return packet(0x10, str("MQTT").concat([4, 2, keepalive >> 8, keepalive & 255], str(clientId)));
}
export function mqttSubscribe(id, topic) {
  return packet(0x82, [id >> 8, id & 255].concat(str(topic), [0]));
}
export function mqttPublish(topic, payload) {
  return packet(0x30, str(topic).concat(Array.from(payload)));
}
export const MQTT_PING = new Uint8Array([0xc0, 0]);

// Splits a byte stream into packets: { type, flags, body }. Returns { packets, rest }.
export function mqttParse(buf) {
  const packets = [];
  let i = 0;
  while (i < buf.length) {
    let len = 0;
    let mul = 1;
    let j = i + 1;
    let done = false;
    while (j < buf.length && j < i + 5) {
      const b = buf[j++];
      len += (b & 127) * mul;
      mul *= 128;
      if (!(b & 128)) {
        done = true;
        break;
      }
    }
    if (!done || j + len > buf.length) break;
    packets.push({ type: buf[i] >> 4, flags: buf[i] & 15, body: buf.subarray(j, j + len) });
    i = j + len;
  }
  return { packets: packets, rest: buf.subarray(i) };
}

// A PUBLISH packet's topic and payload (QoS 0 has no packet id; QoS 1/2 do).
export function mqttReadPublish(p) {
  const tlen = (p.body[0] << 8) | p.body[1];
  const topic = dec.decode(p.body.subarray(2, 2 + tlen));
  const qos = (p.flags >> 1) & 3;
  return { topic: topic, payload: p.body.subarray(2 + tlen + (qos ? 2 : 0)) };
}

// One broker connection that keeps itself up until stop(). onMessage(topic, bytes); onUp(up).
export class Broker {
  constructor(url, onMessage, onUp) {
    this.url = url;
    this.onMessage = onMessage;
    this.onUp = onUp;
    this.topics = [];
    this.ws = null;
    this.up = false;
    this.on = false;
    this.buf = new Uint8Array(0);
    this.retries = 0;
    this.timer = 0;
    this.pinger = 0;
    this.packetId = 1;
  }

  start() {
    if (this.on) return;
    this.on = true;
    this.open();
  }

  stop() {
    this.on = false;
    clearTimeout(this.timer);
    clearInterval(this.pinger);
    this.setUp(false);
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      try {
        if (ws.readyState === 1) ws.send(new Uint8Array([0xe0, 0]));
        ws.close();
      } catch (e) {
        /* already closed */
      }
    }
  }

  setUp(up) {
    if (this.up === up) return;
    this.up = up;
    if (this.onUp) this.onUp(up);
  }

  subscribe(topic) {
    if (this.topics.indexOf(topic) < 0) this.topics.push(topic);
    if (this.up) this.send(mqttSubscribe(this.packetId++ & 0xffff || 1, topic));
  }

  publish(topic, bytes) {
    if (!this.up) return false;
    return this.send(mqttPublish(topic, bytes));
  }

  send(bytes) {
    try {
      this.ws.send(bytes);
      return true;
    } catch (e) {
      return false;
    }
  }

  open() {
    const self = this;
    if (!self.on) return;
    let ws;
    try {
      ws = new WebSocket(self.url, "mqtt");
    } catch (e) {
      self.again();
      return;
    }
    self.ws = ws;
    self.buf = new Uint8Array(0);
    ws.binaryType = "arraybuffer";
    const giveUp = setTimeout(function () {
      if (ws === self.ws && !self.up) {
        try {
          ws.close();
        } catch (e) {
          /* fine */
        }
      }
    }, 10000);
    ws.onopen = function () {
      if (ws !== self.ws) return;
      const id = "ng" + Math.random().toString(36).slice(2, 12);
      self.send(mqttConnect(id, 45));
    };
    ws.onmessage = function (e) {
      if (ws !== self.ws || !(e.data instanceof ArrayBuffer)) return;
      const add = new Uint8Array(e.data);
      const all = new Uint8Array(self.buf.length + add.length);
      all.set(self.buf);
      all.set(add, self.buf.length);
      const parsed = mqttParse(all);
      self.buf = new Uint8Array(parsed.rest);
      parsed.packets.forEach(function (p) {
        if (p.type === 2) {
          // CONNACK
          if (p.body[1] !== 0) {
            ws.close();
            return;
          }
          clearTimeout(giveUp);
          self.retries = 0;
          self.setUp(true);
          self.topics.forEach(function (t) {
            self.send(mqttSubscribe(self.packetId++ & 0xffff || 1, t));
          });
          clearInterval(self.pinger);
          self.pinger = setInterval(function () {
            if (ws === self.ws && self.up) self.send(MQTT_PING);
          }, 30000);
        } else if (p.type === 3) {
          const pub = mqttReadPublish(p);
          if (self.onMessage) self.onMessage(pub.topic, pub.payload);
        }
      });
    };
    ws.onclose = function () {
      clearTimeout(giveUp);
      if (ws !== self.ws) return;
      clearInterval(self.pinger);
      self.setUp(false);
      self.again();
    };
    ws.onerror = function () {
      /* onclose follows */
    };
  }

  again() {
    const self = this;
    if (!self.on) return;
    clearTimeout(self.timer);
    const ms = Math.min(60000, 2000 * Math.pow(2, Math.min(5, self.retries++)));
    self.timer = setTimeout(function () {
      self.open();
    }, ms);
  }
}

// ---------- the key and the topic, from the pairing code ----------
function hex(buf) {
  return Array.from(new Uint8Array(buf))
    .map(function (b) {
      return (b < 16 ? "0" : "") + b.toString(16);
    })
    .join("");
}

export function relayKeys(code) {
  const subtle = crypto.subtle;
  const topic = subtle.digest("SHA-256", enc.encode("nostalgem-relay-topic:" + code)).then(function (h) {
    return "nostalgem/v1/" + hex(h).slice(0, 32);
  });
  const key = subtle
    .importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveKey"])
    .then(function (base) {
      return subtle.deriveKey(
        { name: "PBKDF2", salt: enc.encode("nostalgem-relay-v1"), iterations: 20000, hash: "SHA-256" },
        base,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
    });
  return Promise.all([topic, key]).then(function (v) {
    return { topic: v[0], key: v[1] };
  });
}

export function seal(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, enc.encode(JSON.stringify(obj))).then(function (ct) {
    const out = new Uint8Array(12 + ct.byteLength);
    out.set(iv);
    out.set(new Uint8Array(ct), 12);
    return out;
  });
}

// null for anything that isn't ours (wrong key, garbage, someone else's topic collision).
export function unseal(key, bytes) {
  if (!bytes || bytes.length < 29) return Promise.resolve(null);
  return crypto.subtle
    .decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12))
    .then(function (pt) {
      const o = JSON.parse(dec.decode(pt));
      return o && typeof o === "object" ? o : null;
    })
    .catch(function () {
      return null;
    });
}

// ---------- a connection object shaped like PeerJS's DataConnection ----------
// open, send(msg), close(), on("open" | "data" | "close" | "error", fn); kind: "relay".
export class RelayConn {
  constructor(peer, sendFrame, closeFn) {
    this.peer = peer;
    this.kind = "relay";
    this.open = false;
    this.handlers = {};
    this.sendFrame = sendFrame;
    this.closeFn = closeFn;
    this.closed = false;
  }
  on(ev, fn) {
    (this.handlers[ev] = this.handlers[ev] || []).push(fn);
  }
  emit(ev, arg) {
    (this.handlers[ev] || []).slice().forEach(function (fn) {
      try {
        fn(arg);
      } catch (e) {
        /* one bad handler mustn't stop the rest */
      }
    });
  }
  send(msg) {
    if (!this.open) throw new Error("not open");
    this.sendFrame(msg);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    const was = this.open;
    this.open = false;
    if (this.closeFn) this.closeFn(was);
    this.emit("close");
  }
}

// ---------- the TV side ----------
// opts: { code, brokers, onConn(conn), onReady(ready) }. Each phone that turns up is handed to onConn as a
// RelayConn that's already open, the way TvLink.accept takes PeerJS connections.
export class RelayHost {
  constructor(opts) {
    this.o = opts;
    this.brokers = [];
    this.phones = {}; // id -> { conn, broker, seen }
    this.keys = null;
    this.on = false;
    this.sweeper = 0;
    this.ready = false;
  }

  start() {
    const self = this;
    if (self.on || !relaySupported()) return;
    self.on = true;
    relayKeys(self.o.code).then(function (k) {
      if (!self.on) return;
      self.keys = k;
      (self.o.brokers || relayBrokers()).forEach(function (url) {
        const b = new Broker(
          url,
          function (topic, bytes) {
            if (topic === k.topic + "/tv") self.frame(b, bytes);
          },
          function (up) {
            self.readyChanged();
            if (up)
              seal(k.key, { k: "tvup", to: "*" }).then(function (bytes) {
                b.publish(k.topic + "/ph", bytes);
              });
          }
        );
        b.subscribe(k.topic + "/tv");
        self.brokers.push(b);
        b.start();
      });
      self.sweeper = setInterval(function () {
        self.sweep();
      }, 15000);
    });
  }

  stop() {
    this.on = false;
    clearInterval(this.sweeper);
    const phones = this.phones;
    this.phones = {};
    Object.keys(phones).forEach(function (id) {
      phones[id].conn.close();
    });
    this.brokers.forEach(function (b) {
      b.stop();
    });
    this.brokers = [];
    this.readyChanged();
  }

  readyChanged() {
    const ready =
      this.on &&
      this.brokers.some(function (b) {
        return b.up;
      });
    if (ready === this.ready) return;
    this.ready = ready;
    if (this.o.onReady) this.o.onReady(ready);
  }

  toPhone(broker, id, frame) {
    const self = this;
    if (!self.keys) return;
    frame.to = id;
    seal(self.keys.key, frame).then(function (bytes) {
      broker.publish(self.keys.topic + "/ph", bytes);
    });
  }

  frame(broker, bytes) {
    const self = this;
    unseal(self.keys.key, bytes).then(function (f) {
      if (!f || !self.on || typeof f.from !== "string" || f.from.length > 40) return;
      const id = f.from;
      let p = self.phones[id];
      if (f.k === "bye") {
        if (p) {
          delete self.phones[id];
          p.conn.close();
        }
        return;
      }
      if (!p) {
        const conn = new RelayConn(
          id,
          function (msg) {
            const cur = self.phones[id];
            if (cur) self.toPhone(cur.broker, id, { k: "msg", m: msg });
          },
          function (wasOpen) {
            const cur = self.phones[id];
            if (cur && cur.conn === conn) {
              delete self.phones[id];
              if (wasOpen) self.toPhone(cur.broker, id, { k: "bye" });
            }
          }
        );
        p = self.phones[id] = { conn: conn, broker: broker, seen: Date.now() };
        conn.open = true;
        if (self.o.onConn) self.o.onConn(conn);
      }
      p.broker = broker; // the phone may have moved to another broker after a reconnect
      p.seen = Date.now();
      if (f.k === "ping" || f.k === "join") self.toPhone(broker, id, { k: "pong" });
      if (f.k === "msg" && f.m) p.conn.emit("data", f.m);
    });
  }

  // A phone that's gone quiet for a minute (it pings every 20 s) is gone.
  sweep() {
    const self = this;
    const now = Date.now();
    Object.keys(self.phones).forEach(function (id) {
      const p = self.phones[id];
      if (now - p.seen > 60000) {
        delete self.phones[id];
        p.conn.close();
      }
    });
  }
}

// ---------- the phone side ----------
// Returns a RelayConn that opens once the TV answers on one of the brokers. If no TV answers within
// opts.timeout (20 s), it emits "error" and closes.
export function relayConnect(opts) {
  const id = "p" + Math.random().toString(36).slice(2, 12);
  let keys = null;
  let brokers = [];
  let chosen = null;
  let pinger = 0;
  let joiner = 0;
  let watchdog = 0;
  let heard = 0;
  let conn = null;

  const frame = function (b, f) {
    return seal(keys.key, Object.assign({ from: id }, f)).then(function (bytes) {
      b.publish(keys.topic + "/tv", bytes);
    });
  };
  const shutdown = function () {
    clearInterval(pinger);
    clearInterval(joiner);
    clearTimeout(watchdog);
    brokers.forEach(function (b) {
      b.stop();
    });
    brokers = [];
  };

  conn = new RelayConn(
    "tv",
    function (msg) {
      if (chosen) frame(chosen, { k: "msg", m: msg });
    },
    function (wasOpen) {
      if (wasOpen && chosen) {
        const b = chosen;
        frame(b, { k: "bye" }).then(function () {
          b.stop();
        });
        brokers = brokers.filter(function (x) {
          return x !== b;
        });
      }
      shutdown();
    }
  );

  const fail = function (why) {
    if (conn.closed) return;
    conn.emit("error", { type: "relay", message: why });
    conn.close();
  };

  if (!relaySupported()) {
    setTimeout(function () {
      fail("unsupported");
    }, 0);
    return conn;
  }

  const urls = opts.brokers || relayBrokers();
  if (!urls.length) {
    setTimeout(function () {
      fail("no broker");
    }, 0);
    return conn;
  }
  relayKeys(opts.code).then(function (k) {
    if (conn.closed) return;
    keys = k;
    urls.forEach(function (url) {
      const b = new Broker(
        url,
        function (topic, bytes) {
          if (topic !== k.topic + "/ph" || conn.closed) return;
          unseal(k.key, bytes).then(function (f) {
            if (!f || conn.closed) return;
            if (f.to === "*") {
              // The TV (re)started: say hello on this broker so it takes us back without waiting.
              if (f.k === "tvup" && (!chosen || b === chosen)) frame(b, { k: "join" });
              return;
            }
            if (f.to !== id) return;
            if (chosen && b !== chosen) return;
            heard = Date.now();
            if (!chosen) {
              chosen = b;
              clearInterval(joiner);
              brokers.forEach(function (x) {
                if (x !== b) x.stop();
              });
              brokers = [b];
              conn.open = true;
              conn.emit("open");
            }
            if (f.k === "msg" && f.m) conn.emit("data", f.m);
            else if (f.k === "bye") fail("tv left");
          });
        },
        function (up) {
          if (up && !chosen) frame(b, { k: "join" });
        }
      );
      b.subscribe(k.topic + "/ph");
      brokers.push(b);
      b.start();
    });
    // Keep knocking until the TV answers (it may have been off, or still joining a broker).
    joiner = setInterval(function () {
      brokers.forEach(function (b) {
        if (b.up && !chosen) frame(b, { k: "join" });
      });
    }, 3000);
    pinger = setInterval(function () {
      if (!chosen) return;
      if (Date.now() - heard > 55000) fail("tv quiet");
      else frame(chosen, { k: "ping" });
    }, 20000);
    watchdog = setTimeout(function () {
      if (!chosen) fail(brokers.some(function (b) {
        return b.up;
      }) ? "no tv" : "no broker");
    }, opts.timeout || 20000);
  });
  return conn;
}
