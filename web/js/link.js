// The phone remote's wiring, shared by the TV (index.html) and the phone (remote.html).
//
// The TV registers with the free PeerJS broker as "nostalgem-<CODE>"; the phone opens remote.html#CODE,
// asks the broker for that peer, and the two talk directly over a WebRTC data channel. The broker only
// introduces them; no button press or program title passes through it. Messages are small JSON objects:
//
//   phone → TV  { t: "key", type, digit }        the same actions remote.js makes from key presses
//               { t: "tune", slug }              tap a channel in the list
//               { t: "search", text, kind }      build a channel from an Archive search ("video" | "audio")
//               { t: "find", text }              find a show on the TV's channels (the TV lists them)
//               { t: "play", url }               Send to TV: a YouTube or archive.org link to play now (sendto.js)
//               { t: "seek", to } | { by }       on demand only: to a place in the program, or by some seconds
//               { t: "queue", go }               the next (1) or previous (-1) part of what was sent
//               { t: "hello", v }                sent once the channel opens
//   TV → phone  { t: "state", ... }              what's on, sent whenever it changes
//               { t: "channels", list }          the lineup with what's on each channel now
//               { t: "toast", text }             the TV's own pop-up messages, mirrored
//               { t: "sent", state, text, i, n } how a sent link went: looking | playing | failed | collection | ended
//
// When the two can't reach each other directly, the same messages go through a relay instead (relay.js):
// public message brokers, encrypted with a key made from the code. Both run at once; the phone keeps
// whichever opens first and moves to the direct link if that comes up later.

import { RelayHost, relaySupported, brokerName } from "./relay.js";
import { parseSent, sentUrl, SENT_MAX } from "./sendto.js";

export const PEER_PREFIX = "nostalgem-";
export const PROTOCOL = 1;
export const PAGES_BASE = "https://theupdoge.github.io/Nostalgem/";
export const PAGES_REMOTE = PAGES_BASE + "remote.html";

// No 0/O, 1/I/L or U/V lookalikes, so a code read off a TV across the room is typed right.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTWXYZ";
export const CODE_LENGTH = 6;

export function makeCode(rand) {
  const r = rand || Math.random;
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET.charAt(Math.floor(r() * ALPHABET.length) % ALPHABET.length);
  return out;
}

// Accepts what a person might type or a QR code might carry: "k7p-q2m", "#K7PQ2M", a whole URL.
export function cleanCode(text) {
  let t = String(text || "");
  const hash = t.lastIndexOf("#");
  if (hash >= 0) t = t.slice(hash + 1);
  t = t.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (t.length !== CODE_LENGTH) return "";
  for (let i = 0; i < t.length; i++) if (ALPHABET.indexOf(t.charAt(i)) < 0) return "";
  return t;
}

export function peerIdFor(code) {
  return PEER_PREFIX + code.toLowerCase();
}

// Shown as "K7P-Q2M" so it's easy to read aloud.
export function prettyCode(code) {
  return code.slice(0, 3) + "-" + code.slice(3);
}

// Where the phone page lives. A TV app or a page on this computer can't be reached from a phone,
// so those point at the published copy; a page served over the network points at its own copy.
export function remoteUrl(code, loc, override) {
  let base = PAGES_REMOTE;
  if (override) base = override;
  else if (loc && /^https?:$/.test(loc.protocol) && !/^(localhost|127\.0\.0\.1|\[::1\]|appassets\.androidplatform\.net)$/.test(loc.hostname)) {
    base = loc.href.replace(/[#?].*$/, "").replace(/[^/]*$/, "") + "remote.html";
  }
  return base + "#" + code;
}

// Actions a phone may send. Anything else is dropped.
const KEYS = [
  "up", "down", "left", "right", "ok", "back", "chup", "chdown", "guide", "menu", "info",
  "playpause", "play", "pause", "live", "last", "mute", "cc", "fav", "red", "green", "yellow", "blue", "digit", "look",
];

// Checks a message from a phone and returns a clean copy, or null.
export function checkMessage(m) {
  if (!m || typeof m !== "object" || typeof m.t !== "string") return null;
  switch (m.t) {
    case "key":
      if (KEYS.indexOf(m.type) < 0) return null;
      if (m.type === "digit") {
        const d = Number(m.digit);
        return d >= 0 && d <= 9 && Math.floor(d) === d ? { t: "key", type: "digit", digit: d } : null;
      }
      return { t: "key", type: m.type };
    case "tune":
      return typeof m.slug === "string" && m.slug.length < 200 ? { t: "tune", slug: m.slug } : null;
    case "search": {
      const text = typeof m.text === "string" ? m.text.replace(/\s+/g, " ").trim().slice(0, 120) : "";
      if (text.length < 2) return null;
      return { t: "search", text: text, kind: m.kind === "audio" ? "audio" : "video" };
    }
    case "find": {
      const text = typeof m.text === "string" ? m.text.replace(/\s+/g, " ").trim().slice(0, 80) : "";
      return text.length < 2 ? null : { t: "find", text: text };
    }
    case "play": {
      // Send to TV: only a link the TV knows how to play, and in its tidy form.
      const p = typeof m.url === "string" && m.url.length <= SENT_MAX ? parseSent(m.url) : null;
      return p ? { t: "play", url: sentUrl(p) } : null;
    }
    case "seek":
      if (typeof m.by === "number" && isFinite(m.by) && m.by !== 0 && Math.abs(m.by) <= 3600) return { t: "seek", by: Math.round(m.by) };
      if (typeof m.to === "number" && isFinite(m.to) && m.to >= 0 && m.to <= 86400 && m.by == null) return { t: "seek", to: Math.round(m.to) };
      return null;
    case "queue":
      return m.go === 1 || m.go === -1 ? { t: "queue", go: m.go } : null;
    case "hello":
      return { t: "hello", v: Number(m.v) || 0 };
    default:
      return null;
  }
}

// Loads a classic script once (the vendored PeerJS and QR code generator).
const loading = {};
export function loadScript(src) {
  if (!loading[src]) {
    loading[src] = new Promise(function (ok, fail) {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = function () {
        ok();
      };
      s.onerror = function () {
        delete loading[src];
        fail(new Error("couldn't load " + src));
      };
      document.head.appendChild(s);
    });
  }
  return loading[src];
}

// The Peer class: PeerJS, or a stand-in a test put on window.
export function peerClass(vendorBase) {
  if (window.NostalGemPeer) return Promise.resolve(window.NostalGemPeer);
  if (window.Peer) return Promise.resolve(window.Peer);
  return loadScript(vendorBase + "vendor/peerjs.min.js").then(function () {
    if (!window.Peer) throw new Error("PeerJS didn't start");
    return window.Peer;
  });
}

// PeerJS settings: its public broker by default. A test (or a self-hosted broker) can set
// window.NostalGemPeerOptions, e.g. { host, port, path, secure }.
export function peerOptions() {
  return Object.assign({ debug: 0 }, window.NostalGemPeerOptions || {});
}

// ---------- getting through a home network ----------
// A browser hides its own address from WebRTC behind a random name like "1f0c….local", which the
// other device must look up with multicast DNS. Lots of home Wi-Fi drops those lookups, and an Android
// app doesn't hear them at all unless it asks, so a phone on the same Wi-Fi as the TV can't find it.
// The TV app knows its real address, so the TV sends each hidden address twice: as the browser wrote
// it, and with the real address in its place. The phone can then reach the TV directly, and the TV
// learns the phone's address from the phone's first packet.

export function isIPv4(s) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(s || ""));
  return !!m && m.slice(1).every(function (n) {
    return Number(n) <= 255;
  });
}

// A PeerJS "CANDIDATE" message carrying a hidden (.local) UDP address → a copy for each real address.
export function lanCopies(msg, ips) {
  if (!msg || msg.type !== "CANDIDATE" || !msg.payload || !ips || !ips.length) return [];
  const p = msg.payload;
  const c = p.candidate || {};
  // candidate:<foundation> <component> <transport> <priority> <address> <port> typ host …
  const parts = String(c.candidate || "").split(" ");
  if (parts.length < 8 || !/\.local$/i.test(parts[4]) || parts[2].toLowerCase() !== "udp") return [];
  return ips.filter(isIPv4).map(function (ip) {
    const copy = parts.slice();
    copy[4] = ip;
    return {
      type: msg.type,
      dst: msg.dst,
      payload: {
        type: p.type,
        connectionId: p.connectionId,
        candidate: { candidate: copy.join(" "), sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex, usernameFragment: c.usernameFragment },
      },
    };
  });
}

// Makes a PeerJS peer send those copies along with every hidden address it signals.
export function sendLanCopies(peer, ips) {
  const sock = peer && peer.socket;
  if (!sock || typeof sock.send !== "function" || sock.ngLan) return false;
  const send = sock.send;
  sock.ngLan = true;
  sock.send = function (msg) {
    send.call(sock, msg);
    lanCopies(msg, ips()).forEach(function (m) {
      send.call(sock, m);
    });
  };
  return true;
}

// How far a WebRTC handshake got, in a few words for the "couldn't link up" messages, e.g.
// "answered · ICE failed · here: 2 local, 1 public · there: 2 hidden, 1 public · 0 of 4 routes worked".
const KIND = { host: "local", srflx: "public", prflx: "learned", relay: "relay" };
export function linkReport(conn) {
  const pc = conn && conn.peerConnection;
  if (!pc) return Promise.resolve("no answer yet");
  const head = (pc.remoteDescription ? "answered" : "no answer") + " · ICE " + pc.iceConnectionState;
  if (typeof pc.getStats !== "function") return Promise.resolve(head);
  return pc.getStats().then(
    function (stats) {
      const here = {};
      const there = {};
      let pairs = 0;
      let worked = 0;
      stats.forEach(function (s) {
        if (s.type === "local-candidate" || s.type === "remote-candidate") {
          const addr = String(s.address || s.ip || "");
          const kind = s.candidateType === "host" && /\.local$/i.test(addr) ? "hidden" : KIND[s.candidateType] || s.candidateType;
          const side = s.type === "local-candidate" ? here : there;
          side[kind] = (side[kind] || 0) + 1;
        } else if (s.type === "candidate-pair") {
          pairs++;
          if (s.state === "succeeded") worked++;
        }
      });
      const list = function (o) {
        const k = Object.keys(o);
        return k.length
          ? k
              .map(function (x) {
                return o[x] + " " + x;
              })
              .join(", ")
          : "none";
      };
      return head + " · here: " + list(here) + " · there: " + list(there) + " · " + worked + " of " + pairs + " routes worked";
    },
    function () {
      return head;
    }
  );
}

// Draws a QR code as an SVG string: dark squares on a white quiet zone, which every phone camera reads.
export function qrSvg(text) {
  const qr = window.qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const q = 4;
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += "M" + (c + q) + " " + (r + q) + "h1v1h-1z";
  }
  const size = n + q * 2;
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + " " + size + '" shape-rendering="crispEdges" role="img" aria-label="QR code">' +
    '<rect width="' + size + '" height="' + size + '" fill="#fff"/><path d="' + d + '" fill="#0d0221"/></svg>'
  );
}

// ---------- the TV's side ----------
// opts: { code, vendorBase, onMessage(msg, conn), onPhones(count), onStatus(status), onCalling(what, why),
//         snapshot(), channels(), lan() → this TV's real addresses, when the TV app can tell }
// status: "off" | "starting" | "ready" | "retrying" | "taken" | "unsupported"
export class TvLink {
  constructor(opts) {
    this.o = opts;
    this.code = opts.code;
    this.peer = null;
    this.conns = [];
    this.status = "off";
    this.peerStatus = "off";
    this.relay = null;
    this.relayReady = false;
    this.on = false;
    this.retryTimer = 0;
    this.retries = 0;
    this.lastState = "";
    this.lastChannels = "";
    this.channelsAt = 0;
  }

  // The status phones care about: ready if either way in (the pairing service or a relay) is up.
  setStatus(s) {
    this.peerStatus = s;
    const st = this.on && this.relayReady ? "ready" : s;
    if (this.status === st) return;
    this.status = st;
    if (this.o.onStatus) this.o.onStatus(st);
  }

  start() {
    if (this.on) return;
    this.on = true;
    this.startRelay();
    this.connect();
  }

  startRelay() {
    const self = this;
    if (self.o.relay === false || self.relay || !relaySupported()) return;
    self.relay = new RelayHost({
      code: self.code,
      onConn: function (conn) {
        self.accept(conn);
      },
      onReady: function (ready) {
        self.relayReady = ready;
        self.setStatus(self.peerStatus);
      },
    });
    self.relay.start();
  }

  stop() {
    this.on = false;
    clearTimeout(this.retryTimer);
    this.conns.slice().forEach(function (c) {
      try {
        c.close();
      } catch (e) {
        /* already gone */
      }
    });
    this.conns = [];
    this.destroyPeer();
    if (this.relay) this.relay.stop();
    this.relay = null;
    this.relayReady = false;
    this.setStatus("off");
    this.phonesChanged();
  }

  // Each way a phone can reach this TV, for the pairing screen: the pairing service (a direct link) and
  // each relay server. [{ name, ok }]
  paths() {
    const out = [{ name: "Direct", ok: this.peerStatus === "ready" }];
    (this.relay ? this.relay.brokers : []).forEach(function (b) {
      out.push({ name: brokerName(b.url), ok: !!b.up });
    });
    return out;
  }

  // A new code locks out every phone paired with the old one.
  newCode(code) {
    const was = this.on;
    this.stop();
    this.code = code;
    if (was) this.start();
  }

  destroyPeer() {
    const p = this.peer;
    this.peer = null;
    if (p) {
      try {
        p.destroy();
      } catch (e) {
        /* fine */
      }
    }
  }

  connect() {
    const self = this;
    if (!self.on) return;
    if (typeof RTCPeerConnection === "undefined" && !window.NostalGemPeer) {
      self.setStatus("unsupported");
      return;
    }
    self.setStatus(self.retries ? "retrying" : "starting");
    peerClass(self.o.vendorBase || "")
      .then(function (Peer) {
        if (!self.on) return;
        self.destroyPeer();
        const peer = new Peer(peerIdFor(self.code), peerOptions());
        self.peer = peer;
        if (self.o.lan) sendLanCopies(peer, self.o.lan);
        peer.on("open", function () {
          if (peer !== self.peer) return;
          self.retries = 0;
          self.setStatus("ready");
        });
        peer.on("connection", function (conn) {
          self.accept(conn);
        });
        // Lost the broker but not the phones: ask it to take us back under the same name.
        peer.on("disconnected", function () {
          if (peer !== self.peer || !self.on) return;
          self.setStatus("retrying");
          self.later(function () {
            if (peer === self.peer && !peer.destroyed) {
              try {
                peer.reconnect();
              } catch (e) {
                self.connect();
              }
            }
          });
        });
        peer.on("error", function (err) {
          if (peer !== self.peer) return;
          const type = err && err.type;
          if (type === "peer-unavailable") return; // about a phone, not us
          if (type === "unavailable-id") {
            // The broker still remembers our last visit, or another TV has this code. Wait, then try once more.
            if (self.retries > 2) {
              self.setStatus("taken");
              return;
            }
          }
          if (type === "browser-incompatible") {
            self.setStatus("unsupported");
            return;
          }
          self.setStatus("retrying");
          self.later(function () {
            self.connect();
          });
        });
      })
      .catch(function () {
        self.setStatus("retrying");
        self.later(function () {
          self.connect();
        });
      });
  }

  // Back off 3 s, 6 s, 12 s … up to a minute.
  later(fn) {
    const self = this;
    clearTimeout(self.retryTimer);
    const ms = Math.min(60000, 3000 * Math.pow(2, Math.min(5, self.retries)));
    self.retries++;
    self.retryTimer = setTimeout(function () {
      if (self.on) fn();
    }, ms);
  }

  accept(conn) {
    const self = this;
    if (self.conns.length >= 6) {
      // Plenty of remotes already; drop the oldest.
      try {
        self.conns[0].close();
      } catch (e) {
        /* fine */
      }
      self.conns.shift();
    }
    self.conns.push(conn);
    if (!conn.open && self.o.onCalling) self.o.onCalling("calling");
    let failed = false;
    const fail = function () {
      if (failed || conn.open) return;
      failed = true;
      clearTimeout(timer);
      linkReport(conn).then(function (why) {
        if (!conn.open && self.o.onCalling) self.o.onCalling("failed", why);
      });
    };
    const timer = setTimeout(fail, 20000);
    // ICE gives up by itself on a network with no way through; say so then rather than at the timeout.
    if (conn.on)
      conn.on("iceStateChanged", function (st) {
        if (st === "failed") fail();
      });
    const ready = function () {
      clearTimeout(timer);
      if (self.o.onCalling) self.o.onCalling("");
      self.phonesChanged();
      self.sendTo(conn, Object.assign({ t: "state", clock: Date.now() }, self.o.snapshot()));
      self.sendTo(conn, { t: "channels", list: self.o.channels() });
    };
    if (conn.open) ready();
    else conn.on("open", ready);
    conn.on("data", function (raw) {
      let m = raw;
      if (typeof raw === "string") {
        try {
          m = JSON.parse(raw);
        } catch (e) {
          return;
        }
      }
      const msg = checkMessage(m);
      if (msg && self.o.onMessage) self.o.onMessage(msg, conn);
    });
    const gone = function () {
      const i = self.conns.indexOf(conn);
      if (i >= 0) {
        self.conns.splice(i, 1);
        self.phonesChanged();
      }
    };
    conn.on("close", gone);
    conn.on("error", gone);
  }

  phonesChanged() {
    if (this.o.onPhones) this.o.onPhones(this.phones());
  }

  phones() {
    return this.conns.filter(function (c) {
      return c.open;
    }).length;
  }

  sendTo(conn, msg) {
    try {
      if (conn.open) conn.send(msg);
    } catch (e) {
      /* the phone went away; its close event tidies up */
    }
  }

  send(msg) {
    const self = this;
    self.conns.forEach(function (c) {
      self.sendTo(c, msg);
    });
  }

  // Called twice a second. Sends what changed; the phone animates the progress bar itself.
  tick(now) {
    if (!this.phones()) return;
    const snap = JSON.stringify(this.o.snapshot());
    if (snap !== this.lastState) {
      this.lastState = snap;
      this.send(Object.assign({ t: "state", clock: now }, JSON.parse(snap)));
    }
    if (now - this.channelsAt > 15000) {
      this.channelsAt = now;
      const list = JSON.stringify(this.o.channels());
      if (list !== this.lastChannels) {
        this.lastChannels = list;
        this.send({ t: "channels", list: JSON.parse(list) });
      }
    }
  }

  // The lineup changed (a channel added, removed, hidden): send it now.
  channelsChanged() {
    this.channelsAt = 0;
    this.lastChannels = "";
  }
}
