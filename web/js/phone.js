// NostalGem Remote: the phone side. Opens remote.html#CODE, finds the TV through the PeerJS broker and
// sends button presses straight to it over WebRTC, or through the relay (relay.js) when the two can't
// reach each other directly, and shows what the TV reports back.

import { cleanCode, peerIdFor, prettyCode, peerClass, peerOptions, linkReport, PROTOCOL } from "./link.js";
import { relayConnect, relaySupported } from "./relay.js";
import { escapeHtml as esc, fmtDuration, pad2 } from "./util.js";

const KEY = "nostalgem-remote:";
function load(k, d) {
  try {
    const v = localStorage.getItem(KEY + k);
    return v == null ? d : JSON.parse(v);
  } catch (e) {
    return d;
  }
}
function save(k, v) {
  try {
    localStorage.setItem(KEY + k, JSON.stringify(v));
  } catch (e) {
    /* private mode: works without */
  }
}

const $ = function (id) {
  return document.getElementById(id);
};

const IDEAS = ["lone ranger", "flash gordon", "john wayne", "kung fu", "the shadow", "jazz", "cartoons 1930s", "sci-fi serials"];

const r = {
  code: "",
  peer: null,
  conn: null, // the link carrying messages
  connKind: "",
  p2p: null, // the direct WebRTC attempt
  relay: null, // the relay attempt
  p2pFailed: false,
  relayFailed: false,
  p2pMsg: "",
  p2pWhy: "",
  relayWhy: "",
  notFound: false,
  status: "idle", // idle | connecting | connected | lost | notfound | unsupported
  tries: 0,
  retryTimer: 0,
  openTimer: 0,
  state: null,
  skew: 0,
  channels: [],
  tab: load("tab", "remote"),
  recent: load("recent", []),
  searching: false,
};

// ---------- haptics ----------
// Browsers refuse (and complain) before the first tap, e.g. when a saved pairing reconnects on its own.
function buzz(ms) {
  try {
    const ua = navigator.userActivation;
    if (ua && !ua.hasBeenActive) return;
    if (navigator.vibrate) navigator.vibrate(ms || 8);
  } catch (e) {
    /* not on this phone */
  }
}

// ---------- connection ----------
function setStatus(st, msg) {
  r.status = st;
  const words = {
    idle: "Not paired",
    connecting: "Connecting…",
    connected: "Connected",
    lost: "Reconnecting…",
    notfound: "TV not found",
    unsupported: "Not supported",
  };
  const pill = $("link");
  pill.setAttribute("data-status", st);
  pill.querySelector("span").textContent = r.code && st !== "idle" && st !== "connected" ? words[st] + " · " + prettyCode(r.code) : words[st];
  pill.title = r.code ? "Code " + prettyCode(r.code) + ". Tap to pair with a different TV." : "";
  document.body.classList.toggle("offline", st !== "connected");
  if (msg != null) $("pairMsg").textContent = msg;
  if (st === "connected") $("pairWhy").textContent = "";
  showViews();
}

function dropPeer() {
  clearTimeout(r.openTimer);
  [r.conn, r.p2p, r.relay].forEach(function (c) {
    if (c) {
      try {
        c.close();
      } catch (e) {
        /* fine */
      }
    }
  });
  r.conn = null;
  r.p2p = null;
  r.relay = null;
  r.p2pFailed = false;
  r.relayFailed = false;
  r.p2pMsg = "";
  r.p2pWhy = "";
  r.notFound = false;
  if (r.peer) {
    try {
      r.peer.destroy();
    } catch (e) {
      /* fine */
    }
  }
  r.peer = null;
}

function retry(why) {
  clearTimeout(r.retryTimer);
  const ms = Math.min(20000, 1500 * Math.pow(2, Math.min(4, r.tries)));
  r.tries++;
  r.retryTimer = setTimeout(function () {
    if (r.code) connect();
  }, ms);
  if (why) $("pairMsg").textContent = why;
}

// Two ways in, tried at once: straight to the TV over WebRTC (fast, same Wi-Fi), and through the relay
// (relay.js: works across any networks). The first one up carries the messages; if the direct link comes
// up after the relay, it takes over.
function connect() {
  clearTimeout(r.retryTimer);
  if (!r.code) return;
  dropPeer();
  const rtc = !(typeof RTCPeerConnection === "undefined" && !window.NostalGemPeer);
  if (!rtc && !relaySupported()) {
    setStatus("unsupported", "This browser can't connect to the TV. Try Chrome or Safari.");
    return;
  }
  setStatus(r.state ? "lost" : "connecting", "Step 1 of 3: reaching the pairing service…");
  $("pairMsg").textContent = "Connecting to your TV (" + prettyCode(r.code) + ")…";
  startRelay();
  if (!rtc) {
    r.p2pFailed = true;
    return;
  }
  peerClass("")
    .then(function (Peer) {
      const peer = new Peer(peerOptions());
      r.peer = peer;
      // The pairing service should answer in a second or two.
      clearTimeout(r.openTimer);
      r.openTimer = setTimeout(function () {
        if (peer === r.peer && !peer.open)
          p2pFail("Step 1 of 3 failed: this phone can't reach the pairing service (0.peerjs.com). Ad blockers, VPNs, Private DNS and some work or school Wi-Fi block it.");
      }, 12000);
      peer.on("open", function () {
        if (peer !== r.peer) return;
        clearTimeout(r.openTimer);
        if (!(r.conn && r.conn.open)) $("pairMsg").textContent = "Step 2 of 3: calling your TV (" + prettyCode(r.code) + ")…";
        openConn(peer);
      });
      peer.on("error", function (err) {
        if (peer !== r.peer) return;
        if (err && err.type === "peer-unavailable") {
          r.notFound = true;
          p2pFail("No TV is using code " + prettyCode(r.code) + " right now. Is NostalGem on, with the phone remote turned on?");
        } else p2pFail("Can't reach the pairing service.");
      });
      peer.on("disconnected", function () {
        // The broker dropped us; the data channel to the TV may well still be up.
        if (peer === r.peer && !peer.destroyed) {
          try {
            peer.reconnect();
          } catch (e) {
            /* the close handler retries */
          }
        }
      });
    })
    .catch(function () {
      p2pFail("Couldn't load the connection code. Check your internet connection.");
    });
}

function openConn(peer) {
  const conn = peer.connect(peerIdFor(r.code), { serialization: "json", reliable: true });
  r.p2p = conn;
  let failed = false;
  // Some networks never finish the WebRTC handshake; don't wait forever. The details line says how far
  // it got, for a screenshot.
  const fail = function () {
    if (failed || conn !== r.p2p || conn.open) return;
    failed = true;
    linkReport(conn).then(function (why) {
      if (conn !== r.p2p || conn.open) return;
      p2pFail(
        why.indexOf("answered") === 0
          ? "Step 3 of 3 failed: your TV answered, but the two couldn't reach each other directly. Guest Wi-Fi, VPNs and \"AP isolation\" on a router block it."
          : "Step 3 of 3 failed: the TV didn't answer. Is NostalGem still on, with the phone remote turned on?",
        why
      );
    });
  };
  clearTimeout(r.openTimer);
  r.openTimer = setTimeout(fail, 20000);
  conn.on("iceStateChanged", function (st) {
    if (conn !== r.p2p || conn.open) return;
    if (st === "checking" && !(r.conn && r.conn.open)) $("pairMsg").textContent = "Step 3 of 3: your TV answered. Finding a way through…";
    else if (st === "failed") fail();
  });
  conn.on("open", function () {
    if (conn !== r.p2p) return;
    clearTimeout(r.openTimer);
    adopt(conn, "direct");
  });
  conn.on("data", function (m) {
    if (conn === r.conn) receive(m);
  });
  const gone = function () {
    if (conn === r.conn) lostLink();
    else if (conn === r.p2p) {
      r.p2p = null;
      p2pFail("The direct link dropped.");
    }
  };
  conn.on("close", gone);
  conn.on("error", gone);
}

function startRelay() {
  if (!relaySupported()) {
    r.relayFailed = true;
    return;
  }
  const c = relayConnect({ code: r.code });
  r.relay = c;
  let why = "";
  c.on("open", function () {
    if (c === r.relay) adopt(c, "relay");
  });
  c.on("data", function (m) {
    if (c === r.conn) receive(m);
  });
  c.on("error", function (e) {
    why = (e && e.message) || "";
  });
  c.on("close", function () {
    if (c === r.conn) {
      lostLink();
      return;
    }
    if (c !== r.relay) return;
    r.relay = null;
    r.relayFailed = true;
    r.relayWhy = why;
    giveUpIfBothFailed();
  });
}

// The link that carries messages from now on. The direct one is preferred: it replaces the relay.
function adopt(conn, kind) {
  if (r.conn === conn) return;
  const was = r.conn && r.conn.open ? r.conn : null;
  if (was && r.connKind === "direct") {
    // Already direct: the relay isn't needed.
    if (conn === r.relay) r.relay = null;
    try {
      conn.close();
    } catch (e) {
      /* fine */
    }
    return;
  }
  r.conn = conn;
  r.connKind = kind;
  if (was) {
    if (was === r.relay) r.relay = null;
    try {
      was.close();
    } catch (e) {
      /* fine */
    }
  }
  clearTimeout(r.openTimer);
  clearTimeout(r.retryTimer);
  r.tries = 0;
  save("code", r.code);
  if (window.location.hash.slice(1) !== r.code) history.replaceState(null, "", "#" + r.code);
  try {
    conn.send({ t: "hello", v: PROTOCOL });
  } catch (e) {
    /* the close handler deals with it */
  }
  $("pairWhy").textContent = "";
  setStatus("connected", "");
  if (kind === "relay") $("link").querySelector("span").textContent = "Connected · via relay";
  if (!was) {
    buzz(20);
    if (kind === "relay") toast("📶 Linked through the relay");
  }
}

function p2pFail(msg, details) {
  r.p2pFailed = true;
  r.p2pMsg = msg;
  if (details) r.p2pWhy = details;
  if (r.conn && r.conn.open) return; // the relay is carrying it
  if (!r.relayFailed) {
    $("pairMsg").textContent = "The direct link didn't work. Trying the relay…";
    return;
  }
  giveUpIfBothFailed();
}

function giveUpIfBothFailed() {
  if ((r.conn && r.conn.open) || !r.p2pFailed || !r.relayFailed) return;
  const relayWords =
    r.relayWhy === "no tv"
      ? " The relay didn't hear from a TV with that code either."
      : r.relayWhy === "no broker"
        ? " The relay couldn't be reached from this network either."
        : "";
  setStatus(r.notFound && r.relayWhy === "no tv" ? "notfound" : "lost");
  $("pairWhy").textContent = r.p2pWhy ? "Details: " + r.p2pWhy + (r.relayWhy ? " · relay: " + r.relayWhy : "") : r.relayWhy ? "Details: relay: " + r.relayWhy : "";
  retry((r.p2pMsg || "Couldn't reach the TV.") + relayWords + " Trying again…");
}

function lostLink() {
  r.conn = null;
  setStatus("lost");
  retry();
}

function send(msg) {
  if (r.conn && r.conn.open) {
    try {
      r.conn.send(msg);
      return true;
    } catch (e) {
      /* falls through */
    }
  }
  toast(r.code ? "Not connected to the TV yet" : "Pair with your TV first");
  buzz([30, 40, 30]);
  if (r.code && r.status !== "connecting") connect();
  return false;
}

function pair(code) {
  r.code = code;
  r.state = null;
  r.tries = 0;
  connect();
}

// ---------- from the TV ----------
function receive(m) {
  if (!m || typeof m !== "object") return;
  if (m.t === "state") {
    if (m.clock) r.skew = m.clock - Date.now();
    r.state = m;
    renderNow();
    renderButtons();
    renderChannels();
    renderSearchStatus();
  } else if (m.t === "channels" && Array.isArray(m.list)) {
    r.channels = m.list;
    renderChannels();
  } else if (m.t === "toast" && typeof m.text === "string") {
    toast(m.text);
  }
}

// ---------- drawing ----------
function showViews() {
  const paired = r.status === "connected" || (r.state && r.status === "lost");
  $("pair").hidden = !!paired;
  $("tabs").hidden = !paired;
  ["remote", "channels", "search"].forEach(function (t) {
    $(t).hidden = !paired || r.tab !== t;
  });
  Array.prototype.forEach.call(document.querySelectorAll("#tabs [data-tab]"), function (b) {
    b.classList.toggle("on", b.getAttribute("data-tab") === r.tab);
  });
}

function setTab(t) {
  r.tab = t;
  save("tab", t);
  showViews();
  window.scrollTo(0, 0);
  if (t === "channels") scrollToCurrent();
}

function renderNow() {
  const st = r.state;
  const el = $("now");
  if (!st || !st.ch) return;
  const ch = st.ch;
  el.style.setProperty("--ch", ch.color || "#ff2a6d");
  el.querySelector(".now-icon").textContent = ch.icon || "📺";
  el.querySelector(".now-num").textContent = "CH " + (ch.label || pad2(ch.number));
  el.querySelector(".now-name").textContent = ch.name;
  let badge = "LIVE";
  if (st.app === "off") badge = "OFF";
  else if (st.paused) badge = "PAUSED";
  else if (st.shifted) badge = "REPLAY";
  else if (st.mode === "standby") badge = "NO SIGNAL";
  else if (st.mode === "gap") badge = "BREAK";
  const b = el.querySelector(".now-badge");
  b.textContent = badge;
  b.className = "now-badge " + badge.toLowerCase().replace(/\s+/g, "-");
  const it = st.now;
  el.querySelector(".now-title").textContent = it ? it.t + (it.y && it.t.indexOf(String(it.y)) < 0 ? " (" + it.y + ")" : "") : ch.tagline || "";
  el.querySelector(".now-next").textContent = st.next ? "Up next: " + st.next : "";
  tickProgress();
}

function tickProgress() {
  const st = r.state;
  const el = $("now");
  if (!st || !st.now) {
    el.querySelector(".now-bar i").style.width = "0";
    el.querySelector(".now-at").textContent = "";
    el.querySelector(".now-left").textContent = "";
    return;
  }
  const it = st.now;
  let at = it.pos >= 0 ? it.pos : (Date.now() + r.skew - it.start) / 1000;
  at = Math.max(0, Math.min(it.d, at));
  el.querySelector(".now-bar i").style.width = (it.d ? (100 * at) / it.d : 0).toFixed(2) + "%";
  el.querySelector(".now-at").textContent = fmtDuration(at);
  el.querySelector(".now-left").textContent = "−" + fmtDuration(it.d - at);
}

function renderButtons() {
  const st = r.state;
  if (!st) return;
  $("playBtn").textContent = st.paused ? "▶" : "❚❚";
  $("playBtn").classList.toggle("lit", !!st.paused);
  $("liveBtn").classList.toggle("lit", !!st.shifted);
  $("liveBtn").disabled = !st.shifted;
  $("muteBtn").textContent = st.muted ? "🔇" : "🔊";
  $("muteBtn").classList.toggle("lit", !!st.muted);
  $("ccBtn").textContent = "CC " + (st.cc || "Off");
  $("ccBtn").classList.toggle("lit", st.cc && st.cc !== "Off");
  $("favBtn").textContent = st.fav ? "★ Fav" : "☆ Fav";
  $("favBtn").classList.toggle("lit", !!st.fav);
}

let chKey = "";
function renderChannels() {
  const cur = r.state && r.state.ch ? r.state.ch.slug : "";
  const key = cur + "|" + JSON.stringify(r.channels);
  if (key === chKey) return;
  chKey = key;
  $("chList").innerHTML = r.channels
    .map(function (c) {
      return (
        '<li><button type="button" data-slug="' +
        esc(c.slug) +
        '" class="' +
        (c.slug === cur ? "cur" : "") +
        '" style="--ch:' +
        esc(c.color || "#ff2a6d") +
        '"><span class="ci">' +
        esc(c.icon || "📺") +
        '</span><span class="cn">' +
        esc(c.label || pad2(c.number)) +
        '</span><span class="ct"><b>' +
        esc(c.name) +
        (c.fav ? " ★" : "") +
        "</b><small>" +
        esc(c.now || "") +
        "</small></span></button></li>"
      );
    })
    .join("");
}

function scrollToCurrent() {
  const el = document.querySelector("#chList .cur");
  if (el && el.scrollIntoView) el.scrollIntoView({ block: "center" });
}

function renderSearchStatus() {
  const d = r.state && r.state.dialog;
  const msg = $("searchMsg");
  if (d && /^Building /.test(d.title)) {
    msg.textContent = d.title + (d.status ? ": " + d.status : "…");
    r.searching = true;
  } else if (r.searching) {
    r.searching = false;
    msg.textContent = r.state && r.state.ch ? "Now on CH " + (r.state.ch.label || pad2(r.state.ch.number)) + " " + r.state.ch.name : "";
  }
}

function renderIdeas() {
  const list = r.recent.concat(
    IDEAS.filter(function (i) {
      return r.recent.indexOf(i) < 0;
    })
  );
  $("ideas").innerHTML = list
    .slice(0, 10)
    .map(function (t) {
      return '<button type="button" class="idea" data-idea="' + esc(t) + '">' + esc(t) + "</button>";
    })
    .join("");
}

let toastTimer = 0;
function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    t.hidden = true;
  }, 2600);
}

// ---------- input ----------
function press(btn) {
  const k = btn.getAttribute("data-key");
  const d = btn.getAttribute("data-digit");
  btn.classList.add("hit");
  setTimeout(function () {
    btn.classList.remove("hit");
  }, 140);
  buzz(k === "ok" ? 14 : 8);
  if (d != null) send({ t: "key", type: "digit", digit: Number(d) });
  else if (k) send({ t: "key", type: k });
}

// Holding an arrow or CH button repeats it, like a real remote.
let holdTimer = 0;
let holdBtn = null;
function stopHold() {
  clearTimeout(holdTimer);
  holdBtn = null;
}
document.addEventListener("pointerdown", function (e) {
  const btn = e.target.closest && e.target.closest("[data-repeat]");
  if (!btn || btn.disabled) return;
  e.preventDefault();
  holdBtn = btn;
  press(btn);
  const again = function (ms) {
    holdTimer = setTimeout(function () {
      if (holdBtn !== btn) return;
      press(btn);
      again(140);
    }, ms);
  };
  again(450);
});
["pointerup", "pointercancel", "blur"].forEach(function (t) {
  (t === "blur" ? window : document).addEventListener(t, stopHold);
});

document.addEventListener("click", function (e) {
  const t = e.target.closest ? e.target : null;
  if (!t) return;
  const rep = t.closest("[data-repeat]");
  if (rep) {
    if (e.detail === 0) press(rep); // keyboard; touches were handled on pointerdown
    return;
  }
  const btn = t.closest("[data-key],[data-digit]");
  if (btn) {
    press(btn);
    return;
  }
  const tab = t.closest("[data-tab]");
  if (tab) {
    buzz(6);
    setTab(tab.getAttribute("data-tab"));
    return;
  }
  const ch = t.closest("[data-slug]");
  if (ch) {
    buzz(12);
    if (send({ t: "tune", slug: ch.getAttribute("data-slug") })) toast("Tuning…");
    return;
  }
  const idea = t.closest("[data-idea]");
  if (idea) {
    $("searchInput").value = idea.getAttribute("data-idea");
    $("searchInput").focus();
    return;
  }
  if (t.closest("#padBtn")) {
    const pad = $("pad");
    pad.hidden = !pad.hidden;
    $("padBtn").setAttribute("aria-expanded", String(!pad.hidden));
    $("padBtn").classList.toggle("lit", !pad.hidden);
    buzz(6);
    return;
  }
  if (t.closest("#link")) {
    // Tap the status pill to pair with a different TV.
    if (r.status !== "connected" || window.confirm("Pair with a different TV?")) {
      dropPeer();
      clearTimeout(r.retryTimer);
      r.code = "";
      r.state = null;
      save("code", "");
      history.replaceState(null, "", window.location.pathname);
      setStatus("idle", "");
      $("codeInput").focus();
    }
  }
});

$("pairForm").addEventListener("submit", function (e) {
  e.preventDefault();
  const code = cleanCode($("codeInput").value);
  if (!code) {
    $("pairMsg").textContent = "Codes are six letters and numbers, like K7P-Q2M.";
    buzz([30, 40, 30]);
    return;
  }
  $("codeInput").blur();
  pair(code);
});

// Enter on the keyboard finds a show; the channel buttons build a new channel instead.
let searchKind = "find";
$("searchForm").addEventListener("click", function (e) {
  const b = e.target.closest && e.target.closest("[data-kind]");
  if (b) searchKind = b.getAttribute("data-kind");
});
$("searchForm").addEventListener("submit", function (e) {
  e.preventDefault();
  const text = $("searchInput").value.replace(/\s+/g, " ").trim();
  const kind = (e.submitter && e.submitter.getAttribute("data-kind")) || searchKind;
  searchKind = "find";
  if (text.length < 2) {
    $("searchMsg").textContent = "Type a few words first, like: hopalong cassidy";
    return;
  }
  if (kind === "find") {
    if (!send({ t: "find", text: text })) return;
    buzz(16);
    $("searchInput").blur();
    $("searchMsg").textContent = "Look at the TV: pick one with ▲▼ and OK to watch it from the start.";
    setTab("remote");
    return;
  }
  if (!send({ t: "search", text: text, kind: kind })) return;
  buzz(16);
  $("searchInput").blur();
  $("searchMsg").textContent = "Sent to the TV. Building your " + (kind === "audio" ? "radio" : "TV") + " channel…";
  r.searching = true;
  r.recent = [text.toLowerCase()]
    .concat(
      r.recent.filter(function (x) {
        return x !== text.toLowerCase();
      })
    )
    .slice(0, 5);
  save("recent", r.recent);
  renderIdeas();
});

// Back on screen after the phone slept: reconnect at once instead of waiting out a retry.
document.addEventListener("visibilitychange", function () {
  if (!document.hidden && r.code && !(r.conn && r.conn.open)) {
    r.tries = 0;
    connect();
  }
});
window.addEventListener("online", function () {
  if (r.code && !(r.conn && r.conn.open)) connect();
});
window.addEventListener("hashchange", function () {
  const code = cleanCode(window.location.hash);
  if (code && code !== r.code) pair(code);
});

// ---------- start ----------
setInterval(tickProgress, 1000);
renderIdeas();
const start = cleanCode(window.location.hash) || cleanCode(load("code", ""));
setStatus("idle");
if (start) {
  $("codeInput").value = prettyCode(start);
  pair(start);
}
if ("serviceWorker" in navigator && window.location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(function () {
    /* works without it */
  });
}

// For tests.
window.NGRemote = {
  state: function () {
    return { status: r.status, code: r.code, tv: r.state, channels: r.channels.length, tab: r.tab };
  },
};
