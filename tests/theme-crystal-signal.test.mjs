// Crystal Signal: an extra station-card look, not on the dial.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EXTRA_SLUGS, FAMILIES, familyOf, familyScene, parseCards, countLabel } from "../web/js/cards.js";
import { loadingCard, gapCard, adBreakCard } from "../web/js/ui/views.js";
import { SECRET_STATIONS } from "../web/js/secrets.js";
import { LINK_CHANNELS } from "../web/js/linkout.js";

const json = JSON.parse(await readFile(new URL("../web/data/cards.json", import.meta.url), "utf8"));
const cards = parseCards(json);
const lineup = JSON.parse(await readFile(new URL("../web/data/lineup.json", import.meta.url), "utf8"));
const css = await readFile(new URL("../web/css/app.css", import.meta.url), "utf8");
const id = "crystalsignal";

test("Crystal Signal is a family with its own look, and the dial is untouched", () => {
  const fam = FAMILIES.find((f) => f.id === id);
  assert.ok(fam, id);
  assert.equal(fam.look, "crystalsignal");
  assert.equal(fam.name, "Crystal Signal");
  assert.deepEqual(EXTRA_SLUGS, {}, "EXTRA_SLUGS ships empty");
  for (const ch of lineup.channels.concat(SECRET_STATIONS, LINK_CHANNELS)) {
    assert.notEqual(familyOf(ch).id, id, ch.slug + " stays on its own card");
  }
  assert.equal(familyOf({ slug: "u-preview", name: "Crystal Signal", tagline: "A viewer channel", kind: "video" }).id, id);
  assert.equal(familyOf({ slug: "high-noon", name: "High Noon", kind: "video" }).id, "western");
});

test("Crystal Signal's words match the other cards: a few lines, lowercase ads, a count", () => {
  const w = cards[id];
  assert.ok(w, "cards.json has crystalsignal");
  assert.ok(w.kickers.length >= 3 && w.loading.length >= 3 && w.ad.length >= 3, "a few of each");
  for (const line of w.kickers.concat(w.loading)) assert.ok(line.length <= 80 && !/</.test(line), line);
  for (const q of w.ad) {
    assert.equal(q, q.toLowerCase(), q);
    assert.ok(q.length <= 120 && !/</.test(q), q);
  }
  assert.equal(w.count, "SIGNAL IN");
  assert.equal(countLabel(cards, { slug: "u-preview", name: "Crystal Signal", kind: "video" }), "SIGNAL IN");
});

test("Crystal Signal's motion is a fixed set of compositor layers, and the three cards use it", () => {
  const block = css.slice(css.indexOf("/* ---- theme: crystalsignal ----"), css.indexOf("/* ---- /theme: crystalsignal ----"));
  assert.ok(block.includes(".fs-crystalsignal") && block.includes(".fam-crystalsignal") && block.includes("--fam:"), "scene, panel, ad color");
  assert.ok(block.includes("clip-path") && block.includes("background-clip: text"), "a faceted gem and chrome type");
  assert.doesNotMatch(block, /canvas|requestAnimationFrame/, "no canvas and no script loop");
  assert.match(block, /prefers-reduced-motion:\s*reduce/);
  assert.match(block, /\.card\[hidden\][\s\S]*animation:\s*none/);
  const frames = block.match(/@keyframes\s+cs-[\w-]+\s*\{[\s\S]*?\n\}/g) || [];
  assert.ok(frames.length >= 4, "the ident's keyframes");
  for (const frame of frames) {
    const props = frame.match(/^\s*([a-z-]+)\s*:/gm) || [];
    for (const prop of props) {
      const name = prop.replace(":", "").trim();
      if (name === "from" || name === "to") continue;
      assert.ok(name === "transform" || name === "opacity", "keyframe property " + name);
    }
  }
  const scene = familyScene("crystalsignal");
  const sparks = (scene.match(/class="sp/g) || []).length;
  assert.ok(sparks >= 12 && sparks <= 20, "sparkles: " + sparks);
  assert.match(scene, /class="rays"/);
  assert.match(scene, /class="gem"/);
  const ch = { slug: "u-preview", name: "Crystal Signal", number: 95, kind: "video", tagline: "Crystal Signal" };
  const load = loadingCard(ch, cards, 1700000000000);
  assert.match(load, /class="fscene fs-crystalsignal"/);
  assert.match(load, /CH 95 · CRYSTAL SIGNAL/);
  assert.match(load, /card-dots/);
  assert.ok(cards[id].loading.some((l) => load.includes(l.replace(/'/g, "&#39;")) || load.includes(l)), load.slice(0, 200));
  const slot = { item: { t: "Now", d: 3600 }, next: { t: "Cut Glass", d: 5040, y: 1984 }, startMs: 0, slotEndMs: Date.now() + 8000 };
  const gap = gapCard(ch, slot, false, [], cards);
  assert.match(gap, /fs-crystalsignal/);
  assert.match(gap, /Cut Glass/);
  assert.match(gap, /card-countlabel">SIGNAL IN/);
  const ad = adBreakCard(cards[id].ad[0], ch);
  assert.match(ad, /fs-crystalsignal/);
  assert.match(ad, /an ad\. sparkly, and muted\./);
  assert.match(ad, /your show starts right after/);
});
