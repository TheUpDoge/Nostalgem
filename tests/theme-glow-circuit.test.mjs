// Glow Circuit: an extra station-card look, not on the dial.
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
const id = "glowcircuit";

test("Glow Circuit is a family with its own look, and the dial is untouched", () => {
  const fam = FAMILIES.find((f) => f.id === id);
  assert.ok(fam, id);
  assert.equal(fam.look, "glowcircuit");
  assert.equal(fam.name, "Glow Circuit");
  assert.deepEqual(EXTRA_SLUGS, {}, "EXTRA_SLUGS ships empty");
  for (const ch of lineup.channels.concat(SECRET_STATIONS, LINK_CHANNELS)) {
    assert.notEqual(familyOf(ch).id, id, ch.slug + " stays on its own card");
  }
  assert.equal(familyOf({ slug: "u-preview", name: "Glow Circuit", tagline: "A viewer channel", kind: "video" }).id, id);
  assert.equal(familyOf({ slug: "atomic-drive-in", name: "Atomic Drive-In", kind: "video" }).id, "scifi");
});

test("Glow Circuit's words match the other cards: a few lines, lowercase ads, a count", () => {
  const w = cards[id];
  assert.ok(w, "cards.json has glowcircuit");
  assert.ok(w.kickers.length >= 3 && w.loading.length >= 3 && w.ad.length >= 3, "a few of each");
  for (const line of w.kickers.concat(w.loading)) assert.ok(line.length <= 80 && !/</.test(line), line);
  for (const q of w.ad) {
    assert.equal(q, q.toLowerCase(), q);
    assert.ok(q.length <= 120 && !/</.test(q), q);
  }
  assert.equal(w.count, "ONLINE IN");
  assert.equal(countLabel(cards, { slug: "u-preview", name: "Glow Circuit", kind: "video" }), "ONLINE IN");
});

test("Glow Circuit's paint is static, and the three cards use it", () => {
  const block = css.slice(css.indexOf("/* ---- theme: glowcircuit ----"), css.indexOf("/* ---- /theme: glowcircuit ----"));
  assert.ok(block.includes(".fs-glowcircuit") && block.includes(".fam-glowcircuit") && block.includes("--fam:"), "scene, panel, ad color");
  assert.doesNotMatch(block, /animation\s*:/, "no always-on animation");
  assert.doesNotMatch(block, /canvas|@keyframes/, "no canvas and no new loop");
  const ch = { slug: "u-preview", name: "Glow Circuit", number: 94, kind: "video", tagline: "Glow Circuit" };
  const load = loadingCard(ch, cards, 1700000000000);
  assert.match(load, /class="fscene fs-glowcircuit"/);
  assert.match(load, /CH 94 · GLOW CIRCUIT/);
  assert.match(load, /card-dots/);
  assert.ok(cards[id].loading.some((l) => load.includes(l.replace(/'/g, "&#39;")) || load.includes(l)), load.slice(0, 200));
  const slot = { item: { t: "Now", d: 3600 }, next: { t: "First Light", d: 5100, y: 1982 }, startMs: 0, slotEndMs: Date.now() + 8000 };
  const gap = gapCard(ch, slot, false, [], cards);
  assert.match(gap, /fs-glowcircuit/);
  assert.match(gap, /First Light/);
  assert.match(gap, /card-countlabel">ONLINE IN/);
  const ad = adBreakCard(cards[id].ad[0], ch);
  assert.match(ad, /fs-glowcircuit/);
  assert.match(ad, /an ad crossed the line/);
  assert.match(ad, /your show starts right after/);
});
