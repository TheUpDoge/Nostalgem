// A stand-in for PeerJS, so the phone-remote test needs no network. Pages in one browser context find each
// other through a BroadcastChannel instead of the PeerJS broker and WebRTC. Same API surface link.js uses:
// new Peer(id?, opts), peer.on(open|connection|error|disconnected), peer.connect(id, opts), reconnect(),
// destroy(); conn.on(open|data|close|error), conn.send(obj), conn.close(), conn.open.
// window.__fakeBroker.dropAll() cuts every link this page has, to test reconnecting.
(function () {
  if (typeof BroadcastChannel === "undefined") return;
  const bus = new BroadcastChannel("fake-peerjs");
  const local = {}; // peer id -> FakePeer on this page

  function emitter(obj) {
    obj._h = {};
    obj.on = function (ev, fn) {
      (obj._h[ev] = obj._h[ev] || []).push(fn);
      return obj;
    };
    obj._emit = function (ev, arg) {
      (obj._h[ev] || []).slice().forEach(function (fn) {
        fn(arg);
      });
    };
  }

  function Conn(peer, remote, id) {
    emitter(this);
    this.peer = peer;
    this.remote = remote;
    this.connectionId = id;
    this.open = false;
  }
  Conn.prototype.send = function (msg) {
    if (!this.open) throw new Error("not open");
    bus.postMessage({ k: "data", to: this.remote, from: this.peer.id, cid: this.connectionId, msg: JSON.parse(JSON.stringify(msg)) });
  };
  Conn.prototype.close = function () {
    if (!this.open) return;
    this.open = false;
    bus.postMessage({ k: "close", to: this.remote, from: this.peer.id, cid: this.connectionId });
    delete this.peer.conns[this.connectionId];
    this._emit("close");
  };
  Conn.prototype._closed = function () {
    if (!this.open) return;
    this.open = false;
    delete this.peer.conns[this.connectionId];
    this._emit("close");
  };

  function Peer(id) {
    emitter(this);
    this.id = typeof id === "string" ? id : "phone-" + Math.random().toString(36).slice(2, 10);
    this.conns = {};
    this.destroyed = false;
    this.disconnected = false;
    local[this.id] = this;
    const self = this;
    setTimeout(function () {
      if (!self.destroyed) self._emit("open", self.id);
    }, 30);
  }
  Peer.prototype.connect = function (to) {
    const cid = "c" + Math.random().toString(36).slice(2, 10);
    const conn = new Conn(this, to, cid);
    this.conns[cid] = conn;
    const self = this;
    bus.postMessage({ k: "connect", to: to, from: this.id, cid: cid });
    conn._timer = setTimeout(function () {
      if (!conn.open) {
        delete self.conns[cid];
        self._emit("error", { type: "peer-unavailable", message: "Could not connect to peer " + to });
      }
    }, 600);
    return conn;
  };
  Peer.prototype.reconnect = function () {
    this.disconnected = false;
  };
  Peer.prototype.destroy = function () {
    if (this.destroyed) return;
    this.destroyed = true;
    const self = this;
    Object.keys(this.conns).forEach(function (k) {
      self.conns[k].close();
    });
    delete local[this.id];
  };

  bus.onmessage = function (e) {
    const m = e.data;
    const peer = local[m.to];
    if (!peer || peer.destroyed) return;
    if (m.k === "connect") {
      const conn = new Conn(peer, m.from, m.cid);
      peer.conns[m.cid] = conn;
      conn.open = true;
      peer._emit("connection", conn);
      bus.postMessage({ k: "accept", to: m.from, from: peer.id, cid: m.cid });
      setTimeout(function () {
        conn._emit("open");
      }, 10);
    } else if (m.k === "accept") {
      const c = peer.conns[m.cid];
      if (c) {
        clearTimeout(c._timer);
        c.open = true;
        c._emit("open");
      }
    } else if (m.k === "data") {
      const c = peer.conns[m.cid];
      if (c && c.open) c._emit("data", m.msg);
    } else if (m.k === "close") {
      const c = peer.conns[m.cid];
      if (c) c._closed();
    }
  };

  window.NostalGemPeer = Peer;
  window.__fakeBroker = {
    dropAll: function () {
      Object.keys(local).forEach(function (id) {
        const p = local[id];
        Object.keys(p.conns).forEach(function (k) {
          p.conns[k].close();
        });
      });
    },
  };
})();
