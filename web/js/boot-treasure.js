// Alternate boot: a chest is dug up, the lid opens, and coins and gems settle into "NostalGem".
//
// The CRT title card stays the default. Turn this on with ?boot=treasure, or set BOOT_STYLE to
// "treasure" (keep the matching string in index.html; a test fails if they drift). ?boot=crt forces
// the title card. Look only, on the same skip, mute, reduced-motion and tuner timing as intro.js.
// The scene is authored to finish inside TURN_ON_MS (5s). The coin, dirt and spark count is fixed.
// Motion is CSS transform and opacity, started once; nothing keeps painting after the card leaves.

export var BOOT_STYLE = "";

// Cap letters, a round brilliant for the "o", a faceted pink gem for the "e", coin letters for the rest.
// Coin centers are percentages of the letter box. Cap boxes are the full em; lowercase glyphs sit low.
var LETTERS = [
  {
    ch: "N",
    kind: "cap",
    w: "5.5em",
    coins: [
      [20, 16],
      [20, 46],
      [20, 76],
      [80, 16],
      [80, 46],
      [80, 76],
      [40, 36],
      [62, 62],
    ],
  },
  { ch: "o", kind: "diamond", w: "4.8em" },
  {
    ch: "s",
    kind: "low",
    w: "3.6em",
    coins: [
      [58, 52],
      [30, 64],
      [70, 74],
      [32, 86],
      [62, 94],
    ],
  },
  {
    ch: "t",
    kind: "low",
    w: "3.3em",
    coins: [
      [50, 30],
      [24, 46],
      [76, 46],
      [50, 66],
      [50, 88],
    ],
  },
  {
    ch: "a",
    kind: "low",
    w: "3.8em",
    coins: [
      [50, 54],
      [24, 66],
      [76, 66],
      [22, 84],
      [78, 86],
      [50, 94],
    ],
  },
  {
    ch: "l",
    kind: "asc",
    w: "2.4em",
    coins: [
      [50, 28],
      [50, 50],
      [50, 72],
      [50, 92],
    ],
  },
  {
    ch: "G",
    kind: "cap",
    w: "5.6em",
    coins: [
      [40, 24],
      [18, 42],
      [16, 68],
      [42, 88],
      [74, 74],
      [82, 48],
      [64, 30],
    ],
  },
  { ch: "e", kind: "gem", w: "3.9em" },
  {
    ch: "m",
    kind: "low",
    w: "5.4em",
    coins: [
      [16, 58],
      [16, 82],
      [50, 64],
      [50, 90],
      [84, 58],
      [84, 82],
    ],
  },
];

var DIRT = [
  ["-9rem", "-6rem", "-28deg", "0.08s", "#e7c89a", "1.7rem", "0.95rem"],
  ["8.4rem", "-5.2rem", "22deg", "0.1s", "#c4a574", "1.45rem", "0.85rem"],
  ["-4.2rem", "-8.5rem", "-14deg", "0.16s", "#f6ead0", "0.9rem", "0.55rem"],
  ["5.4rem", "-9rem", "36deg", "0.14s", "#edd7b0", "1rem", "0.6rem"],
  ["-13rem", "-2.4rem", "-48deg", "0.2s", "#8d6240", "1.8rem", "1rem"],
  ["12rem", "-2rem", "46deg", "0.18s", "#a67c52", "1.7rem", "0.95rem"],
  ["-1.6rem", "-10rem", "12deg", "0.24s", "#fff6e4", "0.7rem", "0.45rem"],
  ["2.4rem", "-11rem", "-20deg", "0.26s", "#f3e6cc", "0.65rem", "0.42rem"],
  ["-7rem", "-4.2rem", "10deg", "0.12s", "#d7b88a", "1.2rem", "0.7rem"],
  ["6.6rem", "-3.6rem", "-16deg", "0.15s", "#c9a06a", "1.25rem", "0.72rem"],
];

var SPARKS = [
  ["-5.2rem", "-7.2rem", "1.22s", "gold", "70deg"],
  ["4.6rem", "-8.4rem", "1.3s", "magenta", "-50deg"],
  ["-1.6rem", "-11rem", "1.38s", "cyan", "36deg"],
  ["7.2rem", "-5.4rem", "1.26s", "violet", "110deg"],
  ["-8rem", "-4.2rem", "1.44s", "gold", "-24deg"],
  ["1.2rem", "-9.2rem", "1.5s", "magenta", "18deg"],
];

var SPINS = [150, -170, 200, -120, 90, -210, 130, 180, -80, 160];

export function treasureWanted(query) {
  var q = String(query || "").toLowerCase();
  if (q === "treasure") return true;
  if (q === "crt" || q === "default" || q === "off") return false;
  return String(BOOT_STYLE || "").toLowerCase() === "treasure";
}

// Screen delta from a settled piece back to the chest mouth, in the word's local px.
// A scaled word (narrow portrait) shrinks child transforms, so divide the visual delta by that scale.
export function spillVector(coin, mouth, scale) {
  var s = scale > 0 ? scale : 1;
  var mx = mouth.x + mouth.w / 2;
  var my = mouth.y + mouth.h / 2;
  var cx = coin.x + coin.w / 2;
  var cy = coin.y + coin.h / 2;
  return { x: (mx - cx) / s, y: (my - cy) / s };
}

export function scaleFromMatrix(transform) {
  if (!transform || transform === "none") return 1;
  var m = /matrix\(\s*([-0-9.eE+]+)/.exec(transform);
  if (!m) return 1;
  var a = parseFloat(m[1]);
  if (!(a > 0)) return 1;
  return a;
}

function delayOf(letterIndex, coinIndex) {
  return (1.18 + letterIndex * 0.06 + coinIndex * 0.03).toFixed(2) + "s";
}

function mintOf(letterIndex) {
  return (1.72 + letterIndex * 0.06).toFixed(2) + "s";
}

function diamondSvg() {
  return (
    '<svg class="tg-dia" viewBox="0 0 100 100" aria-hidden="true">' +
    "<defs>" +
    '<radialGradient id="tg-dia-body" cx="40%" cy="36%" r="68%">' +
    '<stop offset="0" stop-color="#ffffff"/>' +
    '<stop offset="0.42" stop-color="#e7fbff"/>' +
    '<stop offset="0.7" stop-color="#9aefff"/>' +
    '<stop offset="0.86" stop-color="#d2b4ff"/>' +
    '<stop offset="1" stop-color="#6d5cff"/>' +
    "</radialGradient>" +
    "</defs>" +
    '<circle cx="50" cy="50" r="47" fill="url(#tg-dia-body)"/>' +
    '<polygon points="50,50 50,6 70,16" fill="rgba(255,255,255,0.62)"/>' +
    '<polygon points="50,50 70,16 84,34" fill="rgba(5,217,232,0.32)"/>' +
    '<polygon points="50,50 84,34 94,50" fill="rgba(255,255,255,0.4)"/>' +
    '<polygon points="50,50 94,50 84,66" fill="rgba(185,103,255,0.38)"/>' +
    '<polygon points="50,50 84,66 70,84" fill="rgba(255,255,255,0.3)"/>' +
    '<polygon points="50,50 70,84 50,94" fill="rgba(5,217,232,0.34)"/>' +
    '<polygon points="50,50 50,94 30,84" fill="rgba(255,255,255,0.36)"/>' +
    '<polygon points="50,50 30,84 16,66" fill="rgba(185,103,255,0.34)"/>' +
    '<polygon points="50,50 16,66 6,50" fill="rgba(255,255,255,0.42)"/>' +
    '<polygon points="50,50 6,50 16,34" fill="rgba(5,217,232,0.28)"/>' +
    '<polygon points="50,50 16,34 30,16" fill="rgba(255,255,255,0.5)"/>' +
    '<polygon points="50,50 30,16 50,6" fill="rgba(185,103,255,0.26)"/>' +
    '<polygon points="50,34 64,42 64,58 50,66 36,58 36,42" fill="rgba(255,255,255,0.88)" stroke="rgba(255,255,255,0.95)" stroke-width="0.7"/>' +
    '<circle cx="50" cy="50" r="46.5" fill="none" stroke="#f0c14a" stroke-width="2.4"/>' +
    '<circle cx="50" cy="50" r="43.2" fill="none" stroke="rgba(255,248,220,0.85)" stroke-width="0.7"/>' +
    "</svg>"
  );
}

function coinHtml(letter, letterIndex) {
  var kind = letter.kind;
  var size = kind === "cap" ? "1.12em" : "0.98em";
  var html = "";
  var i;
  for (i = 0; i < letter.coins.length; i++) {
    var spin = SPINS[(letterIndex + i) % SPINS.length];
    html +=
      '<i class="tg-coin" style="left:' +
      letter.coins[i][0] +
      "%;top:" +
      letter.coins[i][1] +
      "%;--s:" +
      size +
      ";--delay:" +
      delayOf(letterIndex, i) +
      ";--spin:" +
      spin +
      'deg"></i>';
  }
  return html;
}

export function treasureMarkup() {
  var letters = "";
  var i;
  for (i = 0; i < LETTERS.length; i++) {
    var L = LETTERS[i];
    var body;
    if (L.kind === "diamond") {
      body = '<span class="tg-stone" style="--delay:' + delayOf(i, 0) + ';--spin:28deg">' + diamondSvg() + "</span>";
    } else if (L.kind === "gem") {
      body =
        '<span class="tg-gem-letter" style="--delay:' +
        delayOf(i, 0) +
        ';--spin:-22deg">' +
        L.ch +
        "</span>";
    } else {
      var tone = L.kind === "cap" ? "tg-fill tg-fill-cap" : "tg-fill tg-fill-low";
      body = '<span class="' + tone + '" style="--mint:' + mintOf(i) + '">' + L.ch + "</span>" + coinHtml(L, i);
    }
    letters += '<div class="tg-let tg-k-' + L.kind + '" data-ch="' + L.ch + '" style="width:' + L.w + '">' + body + "</div>";
  }

  var dirt = "";
  for (i = 0; i < DIRT.length; i++) {
    var d = DIRT[i];
    dirt +=
      '<i class="tg-dirt" style="--dx:' +
      d[0] +
      ";--dy:" +
      d[1] +
      ";--rot:" +
      d[2] +
      ";--delay:" +
      d[3] +
      ";background:" +
      d[4] +
      ";width:" +
      d[5] +
      ";height:" +
      d[6] +
      '"></i>';
  }

  var sparks = "";
  for (i = 0; i < SPARKS.length; i++) {
    var s = SPARKS[i];
    sparks +=
      '<i class="tg-spark tg-spark-' +
      s[3] +
      '" style="--ex:' +
      s[0] +
      ";--ey:" +
      s[1] +
      ";--delay:" +
      s[2] +
      ";--spin:" +
      s[4] +
      '"></i>';
  }

  return (
    '<div class="tg-stage" aria-hidden="true">' +
    '<div class="tg-sky"></div>' +
    '<div class="tg-moon"></div>' +
    '<div class="tg-glow"></div>' +
    '<div class="tg-ground"><div class="tg-mound"></div><div class="tg-hole"></div></div>' +
    dirt +
    '<div class="tg-chest">' +
    '<div class="tg-lid"><div class="tg-lid-face"><i class="tg-lid-band"></i></div></div>' +
    '<div class="tg-box"><i class="tg-band tg-band-l"></i><i class="tg-band tg-band-r"></i><i class="tg-lock"></i></div>' +
    '<div class="tg-mouth">' +
    sparks +
    "</div>" +
    '<div class="tg-burst"></div>' +
    "</div>" +
    "</div>" +
    '<div class="tg-word" role="img" aria-label="NostalGem">' +
    letters +
    "</div>" +
    '<div class="tg-credit">Created by The UpDoge</div>' +
    '<div class="tg-tag" aria-label="A Blast From The Past"><span>A Blast</span><span>From The</span><span>Past</span></div>' +
    '<div class="boot-wait"></div>' +
    '<div class="boot-version"></div>' +
    '<div class="boot-hint">ANY KEY OR TAP</div>'
  );
}

export function treasureStats(html) {
  function n(cls) {
    var re = new RegExp('class="' + cls + '( |")', "g");
    var m = String(html || "").match(re);
    return m ? m.length : 0;
  }
  var coins = n("tg-coin");
  var dirt = n("tg-dirt");
  var sparks = n("tg-spark");
  return { coins: coins, dirt: dirt, sparks: sparks, particles: coins + dirt + sparks };
}

export function placeSpill(root) {
  if (!root || !root.querySelector) return;
  var mouth = root.querySelector(".tg-mouth");
  var word = root.querySelector(".tg-word");
  var chest = root.querySelector(".tg-chest");
  if (!mouth || !word || !mouth.getBoundingClientRect) return;
  // The rise animation is still at its buried frame on the first paint. Measure the
  // mouth where the chest finishes, or the coins pour out of the hole instead of the lid.
  if (chest) chest.style.animation = "none";
  var scale = 1;
  try {
    scale = scaleFromMatrix(window.getComputedStyle(word).transform);
  } catch (e) {
    scale = 1;
  }
  var mb = mouth.getBoundingClientRect();
  var nodes = root.querySelectorAll(".tg-coin, .tg-stone, .tg-gem-letter");
  var i;
  for (i = 0; i < nodes.length; i++) {
    var b = nodes[i].getBoundingClientRect();
    var v = spillVector({ x: b.left, y: b.top, w: b.width, h: b.height }, { x: mb.left, y: mb.top, w: mb.width, h: mb.height }, scale);
    nodes[i].style.setProperty("--sx", v.x.toFixed(1) + "px");
    nodes[i].style.setProperty("--sy", v.y.toFixed(1) + "px");
  }
  if (chest) chest.style.animation = "";
}

// still: reduced motion. The final frame is CSS; this only marks the card so a skip-before-lineup
// hold and a browser that reports the preference agree, and so the spill never starts.
export function mountTreasureBoot(bootEl, still) {
  if (!bootEl) return;
  bootEl.classList.add("boot-treasure");
  bootEl.innerHTML = treasureMarkup();
  if (still) {
    bootEl.classList.add("tg-still");
    return;
  }
  var raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : null;
  if (!raf) {
    bootEl.classList.add("tg-play");
    return;
  }
  raf(function () {
    if (!bootEl.querySelector || !bootEl.querySelector(".tg-mouth")) return;
    placeSpill(bootEl);
    bootEl.classList.add("tg-play");
  });
}

// Scored separately. Silent until then, and never the CRT power-on.
export function playTreasureSound() {
  return null;
}
