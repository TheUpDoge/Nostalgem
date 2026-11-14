// Polygon Hour: an extra station-card look, not on the dial.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EXTRA_SLUGS, FAMILIES, familyOf, parseCards, countLabel } from "../web/js/cards.js";
import { loadingCard, gapCard, adBreakCard } from "../web/js/ui/views.js";
import { SECRET_STATIONS } from "../web/js/secrets.js";
import { LINK_CHANNELS } from "../web/js/linkout.js";

const json = JSON.parse(await readFile(new URL("../web/data/cards.json", import.meta.url), "utf8"));
const cards = parseCards(json);
const lineup = JSON.parse(await readFile(new URL("../web/data/lineup.json", import.meta.url), "utf8"));
const css = await readFile(new URL("../web/css/app.css", import.meta.url), "utf8");
const id = "polygon";

test("Polygon Hour is a family with its own look, and the dial is untouched", () => {
  const fam = FAMILIES.find((f) => f.id === id);
  assert.ok(fam, id);
  assert.equal(fam.look, "polygon");
  assert.equal(fam.name, "Polygon Hour");
  assert.deepEqual(EXTRA_SLUGS, {}, "EXTRA_SLUGS ships empty");
  for (const ch of lineup.channels.concat(SECRET_STATIONS, LINK_CHANNELS)) {
    assert.notEqual(familyOf(ch).id, id, ch.slug + " stays on its own card");
  }
  assert.equal(familyOf({ slug: "u-preview", name: "Polygon Hour", tagline: "A viewer channel", kind: "video" }).id, id);
  assert.equal(familyOf({ slug: "city-wire", name: "ASCII City", tagline: "A whole city drawn in text", kind: "video" }).id !== id, true);
});

test("Polygon Hour's words match the other cards: a few lines, lowercase ads, a count", () => {
  const w = cards[id];
  assert.ok(w, "cards.json has polygon");
  assert.ok(w.kickers.length >= 3 && w.loading.length >= 3 && w.ad.length >= 3, "a few of each");
  for (const line of w.kickers.concat(w.loading)) assert.ok(line.length <= 80 && !/</.test(line), line);
  for (const q of w.ad) {
    assert.equal(q, q.toLowerCase(), q);
    assert.ok(q.length <= 120 && !/</.test(q), q);
  }
  assert.equal(w.count, "RENDER IN");
  assert.equal(countLabel(cards, { slug: "u-preview", name: "Polygon Hour", kind: "video" }), "RENDER IN");
});

test("Polygon Hour's paint is static, and the three cards use it", () => {
  const block = css.slice(css.indexOf("/* ---- theme: polygon ----"), css.indexOf("/* ---- /theme: polygon ----"));
  assert.ok(block.includes(".fs-polygon") && block.includes(".fam-polygon") && block.includes("--fam:"), "scene, panel, ad color");
  assert.doesNotMatch(block, /animation\s*:/, "no always-on animation");
  assert.doesNotMatch(block, /canvas|@keyframes/, "no canvas and no new loop");
  const ch = { slug: "u-preview", name: "Polygon Hour", number: 93, kind: "video", tagline: "Polygon Hour" };
  const load = loadingCard(ch, cards, 1700000000000);
  assert.match(load, /class="fscene fs-polygon"/);
  assert.match(load, /CH 93 · POLYGON HOUR/);
  assert.match(load, /card-dots/);
  assert.ok(cards[id].loading.some((l) => load.includes(l.replace(/'/g, "&#39;")) || load.includes(l)), load.slice(0, 200));
  const slot = { item: { t: "Now", d: 3600 }, next: { t: "Room Twelve", d: 4680, y: 1992 }, startMs: 0, slotEndMs: Date.now() + 8000 };
  const gap = gapCard(ch, slot, false, [], cards);
  assert.match(gap, /fs-polygon/);
  assert.match(gap, /Room Twelve/);
  assert.match(gap, /card-countlabel">RENDER IN/);
  const ad = adBreakCard(cards[id].ad[0], ch);
  assert.match(ad, /fs-polygon/);
  assert.match(ad, /an ad at twelve polygons/);
  assert.match(ad, /your show starts right after/);
});
