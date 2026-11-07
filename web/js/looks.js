// Picture filters, like an emulator's video filters: black and white, Sin City color-pop, color tints,
// VHS, Game Boy, 8-bit, night vision, thermal, ASCII and more.
//
// They're CSS and SVG filters, drawn by the browser on top of the picture, so they work the same on
// Archive programs and on YouTube's player. Nothing reads the video's pixels: the Archive and YouTube
// don't allow that for a page like this one, and SVG filters don't need it.
//
// A look is { id, name, group } plus one of:
//   css   a CSS filter list ("grayscale(1) contrast(1.2)")
//   svg   true: an SVG filter, #ng-look-<id>, made by looksSvg()
// and optionally overlay: an extra layer drawn over the picture (scanline roll, grain), see app.css.
//
// YouTube's player is another site's page inside ours, and browsers won't run SVG filters over another
// site's page. So an SVG look also has yt: a CSS-only version for YouTube channels. The Sin City looks
// can't keep one color with CSS alone, so YouTube gets their hard black and white; ASCII on YouTube is
// the picture seen through a mask of characters (ytMask).

const LUM = ".2126 .7152 .0722 0 0  .2126 .7152 .0722 0 0  .2126 .7152 .0722 0 0  0 0 0 1 0";

export const LOOKS = [
  { id: "off", name: "Off", group: "Original" },

  { id: "bw", name: "Black & white", group: "Classic", css: "grayscale(1) contrast(1.15)" },
  { id: "noir", name: "Hard noir", group: "Classic", css: "grayscale(1) contrast(1.7) brightness(0.92)" },
  { id: "sepia", name: "Sepia", group: "Classic", css: "sepia(0.9) contrast(1.08) brightness(0.96)" },
  { id: "faded", name: "Faded film", group: "Classic", css: "sepia(0.25) saturate(0.7) contrast(0.88) brightness(1.06)" },
  { id: "techni", name: "Technicolor", group: "Classic", css: "saturate(1.9) contrast(1.15)" },

  { id: "pop-red", name: "Sin City · red", group: "Sin City", svg: true, yt: "grayscale(1) contrast(1.6) brightness(0.95)" },
  { id: "pop-blue", name: "Sin City · blue", group: "Sin City", svg: true, yt: "grayscale(1) contrast(1.6) brightness(0.95)" },
  { id: "pop-green", name: "Sin City · green", group: "Sin City", svg: true, yt: "grayscale(1) contrast(1.6) brightness(0.95)" },
  { id: "pop-yellow", name: "Sin City · yellow", group: "Sin City", svg: true, yt: "grayscale(1) contrast(1.6) brightness(0.95)" },
  { id: "pop-purple", name: "Sin City · purple", group: "Sin City", svg: true, yt: "grayscale(1) contrast(1.6) brightness(0.95)" },
  { id: "pop-cyan", name: "Sin City · cyan", group: "Sin City", svg: true, yt: "grayscale(1) contrast(1.6) brightness(0.95)" },

  { id: "tint-red", name: "Red", group: "Tints", svg: true, yt: "grayscale(1) sepia(1) hue-rotate(-50deg) saturate(5) contrast(1.1)" },
  { id: "tint-blue", name: "Blue", group: "Tints", svg: true, yt: "grayscale(1) sepia(1) hue-rotate(180deg) saturate(4)" },
  { id: "tint-green", name: "Green phosphor", group: "Tints", svg: true, yt: "grayscale(1) sepia(1) hue-rotate(70deg) saturate(4)" },
  { id: "tint-yellow", name: "Yellow", group: "Tints", svg: true, yt: "grayscale(1) sepia(1) hue-rotate(15deg) saturate(5)" },
  { id: "tint-purple", name: "Purple", group: "Tints", svg: true, yt: "grayscale(1) sepia(1) hue-rotate(230deg) saturate(3.5)" },
  { id: "tint-amber", name: "Amber monitor", group: "Tints", svg: true, yt: "grayscale(1) sepia(1) hue-rotate(-10deg) saturate(3.5)" },
  { id: "tint-cyan", name: "Cyan", group: "Tints", svg: true, yt: "grayscale(1) sepia(1) hue-rotate(140deg) saturate(4)" },

  { id: "vhs", name: "VHS tape", group: "Retro & emulator", svg: true, yt: "saturate(1.4) contrast(1.08) brightness(1.04) blur(0.7px)", overlay: "vhs" },
  { id: "gameboy", name: "Game Boy", group: "Retro & emulator", svg: true, yt: "grayscale(1) sepia(1) hue-rotate(45deg) saturate(2.2) contrast(1.4) brightness(0.9)", ytOverlay: "pixgrid" },
  { id: "8bit", name: "8-bit", group: "Retro & emulator", svg: true, yt: "saturate(1.8) contrast(1.35)", ytOverlay: "pixgrid" },
  { id: "pixel", name: "Low-res pixels", group: "Retro & emulator", svg: true, yt: "contrast(1.1)", ytOverlay: "pixgrid" },
  { id: "ascii", name: "ASCII", group: "Retro & emulator", svg: true, yt: "grayscale(1) sepia(1) hue-rotate(70deg) saturate(5) contrast(1.6) brightness(1.25)", ytMask: true },
  { id: "ascii-color", name: "ASCII · color", group: "Retro & emulator", svg: true, yt: "saturate(1.6) contrast(1.5) brightness(1.25)", ytMask: true },

  { id: "vapor", name: "Vaporwave", group: "Wild", svg: true, yt: "grayscale(1) sepia(1) hue-rotate(260deg) saturate(3.5) contrast(1.15)" },
  { id: "outrun", name: "Outrun sunset", group: "Wild", svg: true, yt: "sepia(0.5) hue-rotate(-35deg) saturate(2.5) contrast(1.2)" },
  { id: "thermal", name: "Thermal camera", group: "Wild", svg: true, yt: "grayscale(1) sepia(1) hue-rotate(-30deg) saturate(6) contrast(1.35) brightness(1.1)" },
  { id: "nightvision", name: "Night vision", group: "Wild", svg: true, yt: "grayscale(1) sepia(1) hue-rotate(75deg) saturate(5) brightness(1.35) contrast(1.15)", overlay: "grain" },
  { id: "dream", name: "Dreamy glow", group: "Wild", svg: true, yt: "saturate(1.4) brightness(1.08) contrast(0.92) blur(0.8px)" },
  { id: "negative", name: "Negative", group: "Wild", css: "invert(1)" },
];

export function lookById(id) {
  for (let i = 0; i < LOOKS.length; i++) if (LOOKS[i].id === id) return LOOKS[i];
  return LOOKS[0];
}

// The look after (dir 1) or before (dir -1) this one, wrapping around.
export function nextLook(id, dir) {
  let i = 0;
  for (let k = 0; k < LOOKS.length; k++) if (LOOKS[k].id === id) i = k;
  return LOOKS[(i + (dir || 1) + LOOKS.length) % LOOKS.length];
}

// The CSS filter value for a look; "" for Off.
export function lookCss(look) {
  if (!look || look.id === "off") return "";
  if (look.css) return look.css;
  return "url(#ng-look-" + look.id + ")";
}

// The same look for YouTube's player: CSS filter functions only.
export function lookYtCss(look) {
  if (!look || look.id === "off") return "";
  return look.yt || look.css || "";
}

// ASCII on YouTube: a tile of characters to see the picture through. Returns { url, size } for CSS.
export function asciiMask(height) {
  const cell = Math.max(8, Math.round(Math.max(240, height || 720) / 64));
  const rows = ["@#%*+=", "-:.@%#", "*+=-:.", "#@*%=+"];
  let text = "";
  rows.forEach(function (row, r) {
    for (let c = 0; c < row.length; c++) {
      text +=
        "<text x='" +
        (c * cell + cell / 2) +
        "' y='" +
        (r * cell + cell * 0.54) +
        "' dominant-baseline='middle' text-anchor='middle'>" +
        row.charAt(c) +
        "</text>";
    }
  });
  const w = cell * rows[0].length;
  const h = cell * rows.length;
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='" +
    w +
    "' height='" +
    h +
    "' font-family='monospace' font-weight='700' font-size='" +
    Math.round(cell * 1.1) +
    "' fill='#fff'>" +
    text +
    "</svg>";
  return { url: 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")', size: w + "px " + h + "px" };
}

// ---------- the SVG filters ----------

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function num(v) {
  return String(Math.round(v * 1000) / 1000);
}

// Maps brightness onto a palette, dark to light: tints, vaporwave, thermal. discrete: hard steps.
function paletteFuncs(stops, discrete) {
  const cols = stops.map(rgb);
  const type = discrete ? "discrete" : "table";
  const ch = function (c, i) {
    return (
      "<feFunc" +
      c +
      ' type="' +
      type +
      '" tableValues="' +
      cols
        .map(function (x) {
          return num(x[i]);
        })
        .join(" ") +
      '"/>'
    );
  };
  return "<feComponentTransfer>" + ch("R", 0) + ch("G", 1) + ch("B", 2) + "</feComponentTransfer>";
}

function filter(id, body) {
  return '<filter id="ng-look-' + id + '" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">' + body + "</filter>";
}

function gradientMap(id, stops, before) {
  return filter(id, '<feColorMatrix type="matrix" values="' + LUM + '"/>' + (before || "") + paletteFuncs(stops));
}

// Sin City: black and white with hard contrast, and one color left in. Each mask is an alpha row
// (r g b a offset); a pixel keeps its color where both masks agree it's that color.
const POP = {
  red: ["6 -6 0 0 -1.5", "6 0 -6 0 -1.5"],
  blue: ["-6 0 6 0 -1.2", "0 -6 6 0 -0.6"],
  green: ["-7 7 0 0 -1.2", "0 7 -7 0 -0.8"],
  yellow: ["6 0 -6 0 -1.5", "0 6 -6 0 -1.5"],
  purple: ["7 -7 0 0 -0.9", "0 -7 7 0 -0.9"],
  cyan: ["-7 7 0 0 -0.9", "-7 0 7 0 -0.9"],
};
function popFilter(color) {
  const m = POP[color];
  const mask = function (row, name) {
    return '<feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  ' + row + '" result="' + name + '"/>';
  };
  return filter(
    "pop-" + color,
    '<feColorMatrix in="SourceGraphic" type="matrix" values="' +
      LUM +
      '" result="gray"/>' +
      '<feComponentTransfer in="gray" result="noir"><feFuncR type="linear" slope="1.5" intercept="-0.22"/><feFuncG type="linear" slope="1.5" intercept="-0.22"/><feFuncB type="linear" slope="1.5" intercept="-0.22"/></feComponentTransfer>' +
      mask(m[0], "m1") +
      mask(m[1], "m2") +
      '<feComposite in="SourceGraphic" in2="m1" operator="in" result="c1"/>' +
      '<feComposite in="c1" in2="m2" operator="in" result="c2"/>' +
      '<feColorMatrix in="c2" type="saturate" values="1.8" result="c3"/>' +
      '<feMerge><feMergeNode in="noir"/><feMergeNode in="c3"/></feMerge>'
  );
}

// Big square pixels: sample one point per cell, then grow it to fill the cell. Result "pix".
function pixelate(cell) {
  const h = Math.floor(cell / 2);
  return (
    '<feFlood x="' +
    h +
    '" y="' +
    h +
    '" width="1" height="1" flood-color="#fff"/>' +
    '<feComposite width="' +
    cell +
    '" height="' +
    cell +
    '"/>' +
    "<feTile/>" +
    '<feComposite in="SourceGraphic" operator="in"/>' +
    '<feMorphology operator="dilate" radius="' +
    h +
    '" result="pix"/>'
  );
}

// ASCII: the picture as characters, densest where it's brightest. Each cell is pixelated to one
// brightness, cut into bands, and every band is filled with its character, tiled.
export const ASCII_RAMP = [".", ":", "-", "=", "+", "*", "#", "%", "@"];

function glyphImage(ch, cell, color) {
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='" +
    cell +
    "' height='" +
    cell +
    "'><text x='50%' y='54%' dominant-baseline='middle' text-anchor='middle' font-family='monospace' font-weight='700' font-size='" +
    Math.round(cell * 1.1) +
    "' fill='" +
    color +
    "'>" +
    (ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch) +
    "</text></svg>";
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

function asciiFilter(id, cell, colored) {
  const n = ASCII_RAMP.length + 1; // band 0 stays blank
  let body =
    pixelate(cell) +
    '<feColorMatrix in="pix" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .2126 .7152 .0722 0 0"/>' +
    '<feComponentTransfer result="lum"><feFuncA type="gamma" amplitude="1" exponent="0.7" offset="0"/></feComponentTransfer>';
  const merge = [];
  for (let k = 1; k < n; k++) {
    const table = [];
    for (let j = 0; j < n; j++) table.push(j === k ? 1 : 0);
    body +=
      '<feImage href="' +
      glyphImage(ASCII_RAMP[k - 1], cell, colored ? "#fff" : "#39ff6a") +
      '" x="0" y="0" width="' +
      cell +
      '" height="' +
      cell +
      '" preserveAspectRatio="none" result="g' +
      k +
      '"/>' +
      '<feTile in="g' +
      k +
      '" result="t' +
      k +
      '"/>' +
      '<feComponentTransfer in="lum" result="b' +
      k +
      '"><feFuncA type="discrete" tableValues="' +
      table.join(" ") +
      '"/></feComponentTransfer>' +
      '<feComposite in="t' +
      k +
      '" in2="b' +
      k +
      '" operator="in" result="o' +
      k +
      '"/>';
    merge.push('<feMergeNode in="o' + k + '"/>');
  }
  body += "<feMerge result=\"glyphs\">" + merge.join("") + "</feMerge>";
  if (colored) {
    body +=
      '<feColorMatrix in="pix" type="saturate" values="1.5" result="vivid"/>' +
      '<feComponentTransfer in="vivid" result="lit"><feFuncR type="linear" slope="1.35" intercept="0.08"/><feFuncG type="linear" slope="1.35" intercept="0.08"/><feFuncB type="linear" slope="1.35" intercept="0.08"/></feComponentTransfer>' +
      '<feComposite in="lit" in2="glyphs" operator="in" result="glyphs"/>';
  }
  body += '<feFlood flood-color="#000" result="black"/><feMerge><feMergeNode in="black"/><feMergeNode in="glyphs"/></feMerge>';
  return filter(id, body);
}

// opts.height: the picture's height in CSS pixels, so the pixel and ASCII cells scale with the screen.
export function looksSvg(opts) {
  const h = Math.max(240, (opts && opts.height) || 720);
  const asciiCell = Math.max(8, Math.round(h / 64));
  const pixCell = Math.max(4, Math.round(h / 144));
  const defs = [
    popFilter("red"),
    popFilter("blue"),
    popFilter("green"),
    popFilter("yellow"),
    popFilter("purple"),
    popFilter("cyan"),
    gradientMap("tint-red", ["#0a0000", "#6e0000", "#ff2a2a", "#ffe0e0"]),
    gradientMap("tint-blue", ["#00040f", "#0b2f7a", "#3ea0ff", "#e0f1ff"]),
    gradientMap("tint-green", ["#000800", "#0a5c14", "#4dff6a", "#d8ffd8"]),
    gradientMap("tint-yellow", ["#0a0800", "#6b5a00", "#ffe600", "#fffbe0"]),
    gradientMap("tint-purple", ["#07000f", "#3d0a6b", "#b967ff", "#f3e6ff"]),
    gradientMap("tint-amber", ["#0a0400", "#7a3f00", "#ffb000", "#fff1c9"]),
    gradientMap("tint-cyan", ["#000a0c", "#004f5c", "#05d9e8", "#e0fdff"]),
    gradientMap("vapor", ["#14001f", "#5a00a8", "#ff2ec4", "#ff9de2", "#7ff9ff"]),
    gradientMap("outrun", ["#090019", "#3d0080", "#ff2a6d", "#ff8c42", "#ffe066"]),
    gradientMap("thermal", ["#000010", "#2a0a6e", "#a3007a", "#ff3d00", "#ffb300", "#fffbe0"]),
    gradientMap(
      "nightvision",
      ["#000a00", "#0b4d12", "#32ff5a", "#e6ffe6"],
      '<feComponentTransfer><feFuncR type="gamma" amplitude="1.3" exponent="0.7" offset="0"/><feFuncG type="gamma" amplitude="1.3" exponent="0.7" offset="0"/><feFuncB type="gamma" amplitude="1.3" exponent="0.7" offset="0"/></feComponentTransfer>'
    ),
    filter(
      "vhs",
      '<feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/>' +
        '<feOffset in="r" dx="3" result="r2"/>' +
        '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g"/>' +
        '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b"/>' +
        '<feOffset in="b" dx="-3" result="b2"/>' +
        '<feBlend in="r2" in2="g" mode="screen" result="rg"/>' +
        '<feBlend in="rg" in2="b2" mode="screen"/>' +
        '<feGaussianBlur stdDeviation="1.2 0.3"/>' +
        '<feColorMatrix type="saturate" values="1.35"/>' +
        '<feComponentTransfer><feFuncR type="linear" slope="0.9" intercept="0.06"/><feFuncG type="linear" slope="0.9" intercept="0.05"/><feFuncB type="linear" slope="0.9" intercept="0.07"/></feComponentTransfer>'
    ),
    filter("gameboy", pixelate(pixCell) + '<feColorMatrix in="pix" type="matrix" values="' + LUM + '"/>' + paletteFuncs(["#0f380f", "#306230", "#8bac0f", "#9bbc0f"], true)),
    filter(
      "8bit",
      pixelate(pixCell) +
        '<feColorMatrix in="pix" type="saturate" values="1.3"/>' +
        '<feComponentTransfer><feFuncR type="discrete" tableValues="0 0.33 0.67 1"/><feFuncG type="discrete" tableValues="0 0.33 0.67 1"/><feFuncB type="discrete" tableValues="0 0.5 1"/></feComponentTransfer>'
    ),
    filter("pixel", pixelate(pixCell)),
    filter(
      "dream",
      '<feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur"/>' +
        '<feBlend in="SourceGraphic" in2="blur" mode="screen" result="glow"/>' +
        '<feColorMatrix in="glow" type="saturate" values="1.3"/>' +
        '<feComponentTransfer><feFuncR type="linear" slope="0.95" intercept="0.02"/><feFuncG type="linear" slope="0.9" intercept="0.02"/><feFuncB type="linear" slope="1" intercept="0.05"/></feComponentTransfer>'
    ),
    asciiFilter("ascii", asciiCell, false),
    asciiFilter("ascii-color", asciiCell, true),
  ];
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden"><defs>' +
    defs.join("") +
    "</defs></svg>"
  );
}
