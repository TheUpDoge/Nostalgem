// Alternate treasure-chest boot. The CRT title card stays the default; this only checks the switch,
// the fixed scene, and that the tuner path in main.js is unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BOOT_STYLE,
  treasureWanted,
  treasureMarkup,
  treasureStats,
  spillVector,
  scaleFromMatrix,
  playTreasureSound,
  treasureCues,
} from "../web/js/boot-treasure.js";

const html = treasureMarkup();
const css = readFileSync(new URL("../web/css/boot-treasure.css", import.meta.url), "utf8");
const page = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
const main = readFileSync(new URL("../web/js/main.js", import.meta.url), "utf8");

function seconds(src) {
  return (String(src).match(/\d+(?:\.\d+)?s/g) || []).map((t) => parseFloat(t));
}

test("the CRT card stays the default; treasure is an explicit switch", () => {
  assert.equal(BOOT_STYLE, "");
  assert.equal(treasureWanted(""), false);
  assert.equal(treasureWanted(null), false);
  assert.equal(treasureWanted("crt"), false);
  assert.equal(treasureWanted("CRT"), false);
  assert.equal(treasureWanted("default"), false);
  assert.equal(treasureWanted("off"), false);
  assert.equal(treasureWanted("treasure"), true);
  assert.equal(treasureWanted("Treasure"), true);
  const inline = /var style = "([^"]*)"/.exec(page);
  assert.ok(inline, "pre-paint default");
  assert.equal(inline[1], BOOT_STYLE);
  assert.match(page, /boot-style-treasure/);
  assert.match(page, /css\/boot-treasure\.css/);
  const bootHtml = page.slice(page.indexOf('id="boot"'), page.indexOf("</body>"));
  assert.match(bootHtml, /class="boot-beam"/);
  assert.match(bootHtml, /aria-label="Nostalgem"/);
  assert.doesNotMatch(bootHtml, /tg-chest/);
});

test("the word reads NostalGem, with a diamond o and a gem e", () => {
  const word = html.slice(html.indexOf('class="tg-word"'), html.indexOf('class="tg-credit"'));
  const chars = [...word.matchAll(/data-ch="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(chars, ["N", "o", "s", "t", "a", "l", "G", "e", "m"]);
  assert.match(word, /aria-label="NostalGem"/);
  assert.match(word, /class="tg-stone"/);
  assert.match(word, /class="tg-dia"/);
  assert.match(word, /class="tg-gem-letter"[^>]*>e</);
  const fills = [...word.matchAll(/class="tg-fill[^"]*"[^>]*>([^<])<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(fills, ["N", "s", "t", "a", "l", "G", "m"]);
  assert.match(html, /Created by The UpDoge/);
  assert.match(html, /A Blast From The Past/);
  assert.match(html, /ANY KEY OR TAP/);
  assert.doesNotMatch(word, /NOSTALGEM/);
});

test("particles are a fixed modest set, and the scene finishes inside five seconds", () => {
  const stats = treasureStats(html);
  assert.equal(stats.coins, 41);
  assert.equal(stats.dirt, 10);
  assert.equal(stats.sparks, 6);
  assert.ok(stats.particles >= 40 && stats.particles <= 80);
  assert.equal(treasureStats(treasureMarkup()).particles, stats.particles);
  for (const t of seconds(html).concat(seconds(css))) assert.ok(t <= 4.6, String(t));
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@keyframes tg-fade/);
  assert.match(css, /boot-hold/);
  assert.doesNotMatch(css, /infinite/);
  const frames = css.slice(css.indexOf("@keyframes"));
  assert.doesNotMatch(frames, /^\s*(?:width|height|left|top|letter-spacing|box-shadow|filter)\s*:/m);
});

test("the spill vector points at the chest, and a scaled word is divided back out", () => {
  assert.deepEqual(spillVector({ x: 0, y: 0, w: 10, h: 10 }, { x: 100, y: 40, w: 20, h: 20 }, 1), { x: 105, y: 45 });
  assert.deepEqual(spillVector({ x: 0, y: 0, w: 10, h: 10 }, { x: 100, y: 40, w: 20, h: 20 }, 2), { x: 52.5, y: 22.5 });
  assert.equal(scaleFromMatrix("none"), 1);
  assert.equal(scaleFromMatrix(""), 1);
  assert.equal(scaleFromMatrix("matrix(0.66, 0, 0, 0.66, 10, 20)"), 0.66);
  assert.equal(scaleFromMatrix("matrix(0, 0, 0, 0, 0, 0)"), 1);
});

test("the score is a thud, a creak and a jingle, and it stays silent without audio", () => {
  const cues = treasureCues();
  assert.deepEqual(
    cues.map((c) => c.kind),
    ["thud", "creak", "jingle"]
  );
  assert.ok(cues[0].t < 0.25);
  assert.ok(cues[1].t > 0.4 && cues[1].t < 1.1);
  assert.ok(cues[2].t > 1 && cues[2].t < 1.6);
  assert.equal(playTreasureSound(), null);
});

test("boot() only swaps the card; it still tunes as soon as the lineup is in", () => {
  const boot = main.slice(main.indexOf("async function boot"), main.indexOf("\nboot();"));
  assert.match(boot, /treasureWanted\(params\.get\("boot"\)\)/);
  assert.match(boot, /mountTreasureBoot\(bootEl, still\)/);
  assert.match(boot, /playSound: treasure \? playTreasureSound : playTurnOnSound/);
  assert.match(boot, /if \(!treasure && !still && showBootSnow/);
  assert.equal(boot.includes("1300"), false);
  assert.ok(boot.indexOf("tuneTo(start)") > 0);
  assert.ok(boot.indexOf("tuneTo(start)") < boot.indexOf("lineupReady()"));
  const src = readFileSync(new URL("../web/js/boot-treasure.js", import.meta.url), "utf8");
  assert.equal((src.match(/requestAnimationFrame/g) || []).length, 2);
  assert.doesNotMatch(src, /setInterval/);
  assert.doesNotMatch(src, /canvas/i);
});
