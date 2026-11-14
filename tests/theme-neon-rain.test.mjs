// Neon Rain: an extra station-card look, not on the dial. Same shape as the other families
// (web/js/cards.js, web/data/cards.json, the fs-neonrain / fam-neonrain paint in css/app.css).
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
const id = "neonrain";

test("Neon Rain is a family with its own look, and the dial is untouched", () => {
  const fam = FAMILIES.find((f) => f.id === id);
  assert.ok(fam, id);
  assert.equal(fam.look, "neonrain");
  assert.equal(fam.name, "Neon Rain");
  assert.deepEqual(EXTRA_SLUGS, {}, "EXTRA_SLUGS ships empty");
  for (const ch of lineup.channels.concat(SECRET_STATIONS, LINK_CHANNELS)) {
    assert.notEqual(familyOf(ch).id, id, ch.slug + " stays on its own card");
  }
  assert.equal(familyOf({ slug: "u-preview", name: "Neon Rain", tagline: "A viewer channel", kind: "video" }).id, id);
  assert.equal(familyOf({ slug: "high-noon", name: "High Noon", kind: "video" }).id, "western");
});

test("Neon Rain's words match the other cards: a few lines, lowercase ads, a count", () => {
  const w = cards[id];
  assert.ok(w, "cards.json has neonrain");
  assert.ok(w.kickers.length >= 3 && w.loading.length >= 3 && w.ad.length >= 3, "a few of each");
  for (const line of w.kickers.concat(w.loading)) assert.ok(line.length <= 80 && !/</.test(line), line);
  for (const q of w.ad) {
    assert.equal(q, q.toLowerCase(), q);
    assert.ok(q.length <= 120 && !/</.test(q), q);
  }
  assert.equal(w.count, "ARRIVING IN");
  assert.equal(countLabel(cards, { slug: "u-preview", name: "Neon Rain", kind: "video" }), "ARRIVING IN");
});

test("Neon Rain's paint is static, and the three cards use it", () => {
  const block = css.slice(css.indexOf("/* ---- theme: neonrain ----"), css.indexOf("/* ---- /theme: neonrain ----"));
  assert.ok(block.includes(".fs-neonrain") && block.includes(".fam-neonrain") && block.includes("--fam:"), "scene, panel, ad color");
  assert.doesNotMatch(block, /animation\s*:/, "no always-on animation");
  assert.doesNotMatch(block, /canvas|@keyframes/, "no canvas and no new loop");
  const ch = { slug: "u-preview", name: "Neon Rain", number: 91, kind: "video", tagline: "Neon Rain" };
  const load = loadingCard(ch, cards, 1700000000000);
  assert.match(load, /class="fscene fs-neonrain"/);
  assert.match(load, /CH 91 · NEON RAIN/);
  assert.match(load, /card-dots/);
  assert.ok(cards[id].loading.some((l) => load.includes(l.replace(/'/g, "&#39;")) || load.includes(l)), load.slice(0, 180));
  const slot = { item: { t: "Now", d: 3600 }, next: { t: "Paper Lanterns", d: 4920, y: 1982 }, startMs: 0, slotEndMs: Date.now() + 8000 };
  const gap = gapCard(ch, slot, false, [], cards);
  assert.match(gap, /fs-neonrain/);
  assert.match(gap, /Paper Lanterns/);
  assert.match(gap, /card-countlabel">ARRIVING IN/);
  const ad = adBreakCard(cards[id].ad[0], ch);
  assert.match(ad, /fs-neonrain/);
  assert.match(ad, /an ad, bright as a billboard/);
  assert.match(ad, /your show starts right after/);
});
