// Station cards in each channel family's voice (web/js/cards.js, web/data/cards.json): which family a channel
// is in, the words picked from the clock, the templates filled, the file read with junk left out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { FAMILIES, DEFAULT_CARDS, familyOf, cardClass, parseCards, pickBy, fill, breakKicker, countLabel, loadingLine, familyAdQuips, familyScene } from "../web/js/cards.js";
import { gapCard, loadingCard, adQuip, adBreakCard, AD_QUIPS } from "../web/js/ui/views.js";
import { SECRET_STATIONS } from "../web/js/secrets.js";
import { LINK_CHANNELS } from "../web/js/linkout.js";
import { fmtClock, escapeHtml } from "../web/js/util.js";

const json = JSON.parse(await readFile(new URL("../web/data/cards.json", import.meta.url), "utf8"));
const cards = parseCards(json);
const lineup = JSON.parse(await readFile(new URL("../web/data/lineup.json", import.meta.url), "utf8"));
const ids = FAMILIES.map((f) => f.id);

test("every shipped channel and station has a family, and the right one", () => {
  for (const ch of lineup.channels.concat(SECRET_STATIONS, LINK_CHANNELS)) assert.ok(ids.includes(familyOf(ch).id), ch.slug);
  const want = { "high-noon": "western", "campfire-radio": "western", cliffhangers: "serial", "midnight-noir": "noir", "creature-feature": "horror", "witching-hour": "horror", "atomic-drive-in": "scifi", "mission-control": "space", "saturday-morning": "toon", "yt-anime-vault": "anime", "laugh-track": "comedy", "hit-parade": "music", "silent-era": "silent", newsreel: "reel", "byte-size": "tech", "game-night": "gameshow", "yt-jre": "desk" };
  for (const slug of Object.keys(want)) {
    const ch = lineup.channels.find((c) => c.slug === slug);
    assert.ok(ch, slug);
    assert.equal(familyOf(ch).id, want[slug], slug);
  }
  // The shipped lineup isn't all one card: a good spread of families
  const used = new Set(lineup.channels.map((c) => familyOf(c).id));
  assert.ok(used.size >= 12, "families in use: " + [...used].join(", "));
});

test("a channel a viewer adds is placed by its words; radio and NostalGem's own are the fallbacks", () => {
  assert.equal(familyOf({ slug: "p-x-33", name: "Spaghetti Westerns", tagline: "A few films more", kind: "video" }).id, "western");
  assert.equal(familyOf({ slug: "u-abc", name: "Zombie Night", tagline: "Your search: zombie", kind: "video" }).id, "horror");
  assert.equal(familyOf({ slug: "u-abc", name: "Flash Gordon", tagline: "", kind: "video" }).id, "scifi");
  assert.equal(familyOf({ slug: "u-abc", name: "Old Time Jazz", tagline: "", kind: "audio" }).id, "music");
  assert.equal(familyOf({ slug: "u-abc", name: "Fort Laramie", tagline: "Your search", kind: "audio" }).id, "radio");
  assert.equal(familyOf({ slug: "u-abc", name: "Gardening", tagline: "Your search: gardening", kind: "video" }).id, "retro");
  assert.equal(familyOf(null).id, "retro");
  assert.equal(cardClass({ slug: "creature-feature" }), "fam-horror");
  assert.equal(cardClass({ slug: "cliffhangers" }), "fam-reel", "serials share the archive reel's look with their own words");
});

test("the shipped words: every family, clean, with the templates that get filled", () => {
  for (const id of ids) {
    const w = cards[id];
    assert.ok(w, id);
    assert.ok(w.kickers.length >= 3 && w.loading.length >= 3, id + " has a few of each");
    for (const line of w.kickers.concat(w.loading, w.ad)) {
      assert.doesNotMatch(line, /</, line); // no markup (the lines are escaped anyway; "C:\\> NEXT" is fine)
      assert.ok(line.length <= 120, line);
    }
    for (const q of w.ad) assert.equal(q, q.toLowerCase(), "ad quips are lowercase, like the sponsor card: " + q);
  }
  assert.equal(fill("SUNDOWN ON CH {ch} · {name} · {time}", { name: "High Noon" }, "01", "4:30 PM"), "SUNDOWN ON CH 01 · HIGH NOON · 4:30 PM");
  assert.equal(fill("plain", null, "", ""), "plain");
});

test("the words for a break come from the clock: the same on every TV, different from break to break", () => {
  const ch = lineup.channels.find((c) => c.slug === "high-noon");
  const t = 1800000000000;
  assert.equal(breakKicker(cards, ch, t, "01", "4:30 PM"), breakKicker(cards, ch, t + 999, "01", "4:30 PM"), "the same second, the same words");
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(breakKicker(cards, ch, t + i * 60000, "01", "4:30 PM"));
  assert.ok(seen.size >= 3, "varies over an hour: " + [...seen].join(" | "));
  for (const k of seen) assert.ok(cards.western.kickers.some((line) => fill(line, ch, "01", "4:30 PM") === k), k);
  assert.equal(countLabel(cards, ch), "SHOWDOWN IN");
  assert.equal(countLabel(cards, lineup.channels.find((c) => c.slug === "mission-control")), "T-MINUS");
  assert.ok(cards.horror.loading.includes(loadingLine(cards, { slug: "creature-feature" }, t)));
  assert.equal(pickBy([], t), "");
  assert.deepEqual(familyAdQuips(cards, { slug: "mission-control" }), cards.space.ad);
  assert.deepEqual(familyAdQuips(cards, { slug: "campfire-radio" }), cards.western.ad);
});

test("the file is read with junk left out, and a missing file means the plain words", () => {
  const c = parseCards({ families: { western: { kickers: ["  A ", "", 5, "B"], loading: "no", ad: ["x"], count: 7 }, nonsense: { kickers: ["z"] }, horror: {} } });
  assert.deepEqual(c.western, { kickers: ["A", "B"], loading: [], ad: ["x"], count: "" });
  assert.equal(c.nonsense, undefined);
  assert.equal(c.horror, undefined, "a family with nothing usable falls back");
  assert.equal(parseCards(null), DEFAULT_CARDS);
  assert.equal(parseCards({ families: {} }), DEFAULT_CARDS);
  assert.ok(DEFAULT_CARDS.retro.kickers.length && DEFAULT_CARDS.retro.loading.length);
  assert.ok(breakKicker(DEFAULT_CARDS, { slug: "creature-feature", name: "Creature Feature" }, 1, "07", "9 PM").length, "no words for the family: retro's");
});

test("the cards' markup: the family's scene and words, escaped; the ad quips mix the family's in", () => {
  const ch = lineup.channels.find((c) => c.slug === "creature-feature");
  const slot = { item: { t: "The Thing <From> Space", d: 3600 }, next: { t: "Night of the <Living>", d: 4000, y: 1968 }, startMs: 0, slotEndMs: Date.now() + 8000 };
  const html = gapCard(ch, slot, false, [], cards);
  assert.match(html, /class="fscene fs-horror"/);
  assert.match(html, /Night of the &lt;Living&gt;/);
  assert.doesNotMatch(html, /<Living>/);
  assert.match(html, /card-countlabel">RISING IN</);
  const expected = breakKicker(cards, ch, slot.startMs + slot.item.d * 1000, "07", fmtClock(new Date(slot.slotEndMs), false));
  assert.ok(html.includes(escapeHtml(expected)) && cards.horror.kickers.some((k) => fill(k, ch, "07", fmtClock(new Date(slot.slotEndMs), false)) === expected), "a horror kicker is on it: " + expected);
  const retroHtml = gapCard({ slug: "u-x", name: "Gardening", kind: "video", number: 31 }, slot, false, [], cards);
  assert.match(retroHtml, /class="scene"/, "NostalGem's own family keeps the sunset");
  assert.doesNotMatch(retroHtml, /fscene/);
  const load = loadingCard(ch, cards, 1700000000000);
  assert.match(load, /fs-horror/);
  assert.ok(cards.horror.loading.some((l) => load.includes(l.replace(/'/g, "&#39;")) || load.includes(l)), "a horror loading line: " + load.slice(0, 200));
  assert.equal(familyScene("retro"), "");
  assert.match(familyScene("noir"), /fs-noir/);
  // Ad quips: the general list alone, or with the family's mixed in
  assert.equal(adQuip(3), AD_QUIPS[3]);
  const mixed = new Set();
  for (let i = 0; i < 200; i++) mixed.add(adQuip(i, cards.space.ad));
  assert.ok(cards.space.ad.every((q) => mixed.has(q)) && mixed.has(AD_QUIPS[0]), "both kinds turn up");
  assert.equal(adQuip(-1, []), AD_QUIPS[AD_QUIPS.length - 1]);
  // The card over an ad: the same words and hint, with the family's scenery behind (none for NostalGem's own)
  const ad = adBreakCard("an ad. the real horror.", ch);
  assert.match(ad, /fs-horror/);
  assert.match(ad, /an ad\. the real horror\./);
  assert.match(ad, /your show starts right after/);
  assert.doesNotMatch(adBreakCard("x", { slug: "home-movies", name: "Home Movies", number: 31 }), /fscene/);
  assert.doesNotMatch(adBreakCard("x"), /fscene/, "no channel: the plain black card");
});
