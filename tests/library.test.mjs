// The Video Club: a library card signed under the fine print, two tapes at a time for three days,
// rewind before you return, overdue tapes go back by themselves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_TAPES, LOAN_HOURS, TERMS_VERSION, emptyLibrary, cleanLibrary, cardNumber, issueCard, cancelCard, checkOut, loanFor, setPosition, isRewound, rewind, returnTape, overdue, dueText, isFilm, storeShelves, staffPicks, searchStore, groupAisles, aisleFilms, SHELF_PLAN } from "../web/js/library.js";
import { SIGNUP_PAGES, cardHtml, tapeBoxHtml, rewindHtml, counter, tapeState, storefrontHtml, spineRowHtml } from "../web/js/ui/club.js";

const T0 = Date.parse("2026-11-08T20:00:00Z");
const film = (id, t, d, ch) => ({ key: id + "/" + id + ".mp4", item: { id, f: id + ".mp4", t, d: d || 5400, y: 1950 }, ch: ch || { slug: "noir", name: "Midnight Noir" } });
const member = () => issueCard(emptyLibrary(), "Marty McFly", T0, () => 0.42).lib;

test("a card needs a signature, and carries a number and the date", () => {
  assert.ok(issueCard(emptyLibrary(), "", T0).error);
  assert.ok(issueCard(emptyLibrary(), " x ", T0).error);
  assert.ok(issueCard(emptyLibrary(), "12345", T0).error);
  const lib = member();
  assert.equal(lib.card.name, "Marty McFly");
  assert.match(lib.card.number, /^NG \d{4} \d{4} \d{4}$/);
  assert.equal(lib.card.issued, T0);
  assert.equal(lib.card.terms, TERMS_VERSION);
  assert.match(cardNumber(), /^NG \d{4} \d{4} \d{4}$/);
  assert.equal(issueCard(emptyLibrary(), "José Ñúñez", T0).lib.card.name, "José Ñúñez");
});

test("no card, no tapes; two tapes at most; the same tape once", () => {
  assert.equal(checkOut(emptyLibrary(), film("a", "A"), T0).error, "card");
  let lib = member();
  const a = checkOut(lib, film("a", "Detour"), T0);
  assert.equal(a.loan.due, T0 + LOAN_HOURS * 3600000);
  lib = a.lib;
  assert.equal(checkOut(lib, film("a", "Detour"), T0).error, "out");
  lib = checkOut(lib, film("b", "D.O.A."), T0).lib;
  assert.equal(lib.loans.length, MAX_TAPES);
  const c = checkOut(lib, film("c", "Scarlet Street"), T0);
  assert.equal(c.error, "full");
  assert.match(c.text, /Rewind and return/);
});

test("be kind, rewind: a tape that's been played goes back only once rewound", () => {
  let lib = checkOut(member(), film("a", "Detour"), T0).lib;
  const key = "a/a.mp4";
  lib = setPosition(lib, key, 1800);
  assert.equal(loanFor(lib, key).pos, 1800);
  assert.equal(isRewound(loanFor(lib, key)), false);
  const no = returnTape(lib, key, T0 + 1000, false);
  assert.equal(no.error, "rewind");
  lib = rewind(lib, key);
  assert.equal(isRewound(loanFor(lib, key)), true);
  const yes = returnTape(lib, key, T0 + 2000, false);
  assert.equal(yes.lib.loans.length, 0);
  assert.equal(yes.lib.history[0].t, "Detour");
  assert.equal(yes.lib.history[0].late, false);
  // A position past the end is the end.
  assert.equal(loanFor(setPosition(checkOut(member(), film("z", "Z", 100), T0).lib, "z/z.mp4", 999), "z/z.mp4").pos, 100);
});

test("overdue tapes are found, and go back late even unrewound", () => {
  let lib = checkOut(member(), film("a", "Detour"), T0).lib;
  lib = setPosition(lib, "a/a.mp4", 600);
  assert.equal(overdue(lib, T0 + 3600000).length, 0);
  const late = overdue(lib, T0 + LOAN_HOURS * 3600000 + 1);
  assert.equal(late.length, 1);
  const back = returnTape(lib, "a/a.mp4", T0 + LOAN_HOURS * 3600000 + 1, true).lib;
  assert.equal(back.loans.length, 0);
  assert.equal(back.history[0].late, true);
});

test("cutting up the card returns every tape", () => {
  let lib = checkOut(member(), film("a", "Detour"), T0).lib;
  lib = checkOut(lib, film("b", "D.O.A."), T0).lib;
  const out = cancelCard(lib, T0 + 5);
  assert.equal(out.card, null);
  assert.equal(out.loans.length, 0);
  assert.equal(out.history.length, 2);
});

test("whatever was stored comes back clean; older fine print means signing again", () => {
  assert.deepEqual(cleanLibrary(null), emptyLibrary());
  assert.deepEqual(cleanLibrary("junk"), emptyLibrary());
  const lib = checkOut(member(), film("a", "Detour"), T0).lib;
  assert.deepEqual(cleanLibrary(JSON.parse(JSON.stringify(lib))), lib);
  const old = JSON.parse(JSON.stringify(lib));
  old.card.terms = 0;
  const again = cleanLibrary(old);
  assert.equal(again.card, null);
  assert.equal(again.loans.length, 1);
  assert.equal(cleanLibrary({ loans: [{ key: "x" }, null, 5] }).loans.length, 0);
});

test("due times read like a store clerk would say them", () => {
  assert.equal(dueText(0), "due back now");
  assert.equal(dueText(40 * 60000), "due back in 40 min");
  assert.equal(dueText(5 * 3600000), "due back in 5 hr");
  assert.equal(dueText(72 * 3600000), "due back in 3 days");
});

test("the store stocks the Archive's feature films, each on one shelf", () => {
  assert.equal(isFilm({ id: "x", f: "x.mp4", t: "X", d: 5400 }), true);
  assert.equal(isFilm({ id: "x", f: "x.mp4", t: "X", d: 600 }), false); // a short
  assert.equal(isFilm({ id: "yt:abc", f: "yt", t: "X", d: 5400 }), false); // YouTube
  assert.equal(isFilm({ id: "x", f: "x.mp4", t: "X", d: 5400, live: true }), false);
  const noir = { slug: "noir", name: "Noir", kind: "video", items: [{ id: "b", f: "b.mp4", t: "The Big Combo", d: 5300 }, { id: "a", f: "a.mp4", t: "Detour", d: 4100 }, { id: "s", f: "s.mp4", t: "Short", d: 300 }] };
  const more = { slug: "more", name: "More", kind: "video", items: [{ id: "a", f: "a.mp4", t: "Detour", d: 4100 }, { id: "c", f: "c.mp4", t: "Bad One", d: 5000 }] };
  const radio = { slug: "radio", name: "Radio", kind: "audio", items: [{ id: "r", f: "r.mp3", t: "Long Show", d: 5000 }] };
  const secret = { slug: "s", name: "S", kind: "video", secret: true, items: [{ id: "q", f: "q.mp4", t: "Q", d: 5000 }] };
  const shelves = storeShelves([noir, more, radio, secret], { skip: (it) => it.id === "c" });
  assert.deepEqual(
    shelves.map((s) => [s.ch.slug, s.films.map((f) => f.item.t)]),
    [["noir", ["The Big Combo", "Detour"].sort((x, y) => (x.replace(/^The /, "") < y.replace(/^The /, "") ? -1 : 1))]]
  );
  assert.equal(searchStore(shelves, "comb")[0].item.t, "The Big Combo");
  assert.equal(searchStore(shelves, "nothing").length, 0);
  assert.equal(staffPicks(shelves, 7, 1).length, 1);
  assert.deepEqual(staffPicks(shelves, 7, 2), staffPicks(shelves, 7, 2)); // the same all week
});

test("the sign-up explains the club and the Archive, and says plainly what the card isn't", () => {
  assert.equal(SIGNUP_PAGES.length, 3);
  const all = SIGNUP_PAGES.map((p) => p.html).join(" ");
  assert.match(all, /Internet Archive/);
  assert.match(all, /not an archive\.org account/);
  assert.match(all, /terms of use/);
  assert.match(all, /archive\.org\/donate/);
  assert.match(all, /two tapes/);
  assert.match(all, /3 days/);
  assert.ok(SIGNUP_PAGES[2].sign);
  assert.doesNotMatch(all, /<script|\son[a-z]+=/i);
});

test("aisles follow the shelf plan, and a plan never hides a tape", () => {
  const ch = (slug, name, titles) => ({
    slug,
    name,
    kind: "video",
    items: titles.map((t, i) => ({ id: slug + i, f: slug + i + ".mp4", t, d: 5000 })),
  });
  const shelves = storeShelves([
    ch("high-noon", "High Noon", ["Rio Bravo"]),
    ch("midnight-noir", "Noir", ["Detour"]),
    ch("my-extra", "Home Movies", ["The Picnic"]),
    ch("trail-tv", "Trail", ["The Ranger"]),
  ]);
  const aisles = groupAisles(shelves);
  const westerns = aisles.find((a) => a.id === "westerns");
  assert.deepEqual(
    westerns.shelves.map((s) => s.ch.slug),
    ["high-noon", "trail-tv"]
  );
  assert.equal(westerns.count, 2);
  assert.equal(aisles.find((a) => a.id === "after-dark").shelves[0].ch.slug, "midnight-noir");
  assert.equal(aisles[aisles.length - 1].id, "rest");
  assert.equal(aisleFilms(aisles[aisles.length - 1])[0].item.t, "The Picnic");
  const titles = aisles.flatMap((a) => aisleFilms(a).map((f) => f.item.t)).sort();
  assert.deepEqual(titles, ["Detour", "Rio Bravo", "The Picnic", "The Ranger"]);
  // Nova's plan is this same shape: drop it in and the floor follows, with anything unnamed still on a shelf.
  const custom = groupAisles(shelves, [{ id: "one", name: "One shelf", icon: "★", blurb: "Just noir.", slugs: ["midnight-noir"] }]);
  assert.deepEqual(
    custom.map((a) => a.id),
    ["one", "rest"]
  );
  assert.equal(aisleFilms(custom[0]).length, 1);
  assert.equal(aisleFilms(custom[1]).length, 3);
  assert.equal(groupAisles([]).length, 0);
  assert.ok(SHELF_PLAN.length >= 4);
  assert.ok(SHELF_PLAN.every((a) => a.id && a.name && a.slugs.length));
});

test("the card, a tape's box and the rewind screen", () => {
  const lib = member();
  const card = cardHtml(lib.card);
  assert.match(card, /Marty McFly/);
  assert.match(card, /NG \d{4}/);
  assert.match(card, /NOT AN ARCHIVE\.ORG ACCOUNT/);
  assert.match(card, /TWO TAPES · 3 DAYS/);
  assert.match(storefrontHtml(), /TWO TAPES · 3 DAYS · BE KIND, REWIND/);
  const row = spineRowHtml(
    [
      { key: "a/a", item: { t: "<b>Detour</b>" } },
      { key: "b/b", item: { t: "Rio Bravo" } },
    ],
    "What's on the shelf"
  );
  assert.match(row, /What&#39;s on the shelf/);
  assert.match(row, /&lt;b&gt;Detour&lt;\/b&gt;/);
  assert.doesNotMatch(row, /<script|\son[a-z]+=/i);
  assert.match(cardHtml({ name: "<b>x</b>", number: "NG 1", issued: T0 }), /&lt;b&gt;/);
  const f = film("detour1945", "Detour");
  const box = tapeBoxHtml(f, null, "A hitchhiker's bad luck.", T0, "On the shelf");
  assert.match(box, /club-sleeve/);
  assert.match(box, /BE KIND REWIND/);
  assert.match(box, /services\/img\/detour1945/);
  assert.match(box, /Detour/);
  assert.match(box, /On the shelf/);
  const loan = setPosition(checkOut(lib, f, T0).lib, f.key, 125).loans[0];
  assert.match(tapeBoxHtml(f, loan, "", T0), /You have this tape · at 2:05 · due back in 3 days/);
  assert.equal(tapeState(Object.assign({}, loan, { pos: 0 }), T0), "rewound · due back in 3 days");
  assert.equal(counter(3725), "1:02:05");
  assert.equal(counter(65), "0:01:05");
  assert.match(rewindHtml("Detour", 65), /0:01:05/);
});

test("a tape's TV-safe cut is off until the viewer turns it on, and it's remembered with the tape", async () => {
  const { setSafeCut } = await import("../web/js/library.js");
  let lib = issueCard(emptyLibrary(), "Test", 0).lib;
  const film = { key: "film/f.mp4", item: { id: "film", f: "f.mp4", t: "Film", d: 5400, y: 1950 }, ch: null };
  lib = checkOut(lib, film, 0).lib;
  assert.ok(!loanFor(lib, film.key).cut, "off when checked out");
  lib = setSafeCut(lib, film.key, true);
  assert.equal(loanFor(lib, film.key).cut, true);
  assert.equal(loanFor(cleanLibrary(JSON.parse(JSON.stringify(lib))), film.key).cut, true, "kept when stored");
  lib = setSafeCut(lib, film.key, false);
  assert.equal(loanFor(lib, film.key).cut, false);
  assert.equal(setSafeCut(lib, "nope/x.mp4", true), lib, "no such tape: nothing changes");
});
