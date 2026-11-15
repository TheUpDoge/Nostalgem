// The Video Club: a library card signed under the fine print, two tapes at a time for three days,
// rewind before you return, overdue tapes go back by themselves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_TAPES, LOAN_HOURS, TERMS_VERSION, emptyLibrary, cleanLibrary, cardNumber, issueCard, cancelCard, checkOut, loanFor, setPosition, isRewound, rewind, returnTape, overdue, dueText, isFilm, storeShelves, staffPicks, searchStore, groupAisles, aisleFilms, SHELF_PLAN, CROSS_LINKS, filmTags, bookTags } from "../web/js/library.js";
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

test("family rows follow the shelf plan, and a channel listed twice is one shelf", () => {
  assert.deepEqual(
    SHELF_PLAN.map((r) => [r.id, r.channels]),
    [
      ["western", ["1", "2", "3"]],
      ["horror", ["7", "26", "32", "35", "44"]],
      ["sci-fi", ["17", "30", "31", "33", "46"]],
      ["noir", ["5", "6"]],
      ["comedy", ["10"]],
      ["silent", ["9"]],
      ["space", ["17", "17-2"]],
      ["world", ["23"]],
      ["eighties", ["33", "34", "43", "44"]],
      ["nineties", ["35", "36", "45", "46"]],
      ["anime", ["40"]],
    ]
  );
  const ch = (slug, number, sub, title) => ({
    slug,
    number,
    sub,
    name: slug,
    kind: "video",
    icon: "📼",
    color: "#112233",
    items: [{ id: slug, f: slug + ".mp4", t: title, d: 5000 }],
  });
  const shelves = storeShelves([
    ch("high-noon", 1, 0, "Rio Bravo"),
    ch("trail-tv", 3, 0, "The Ranger"),
    ch("midnight-noir", 6, 0, "Detour"),
    ch("mission-control", 17, 0, "Apollo"),
    ch("wild-blue", 17, 2, "Barnstormer"),
    ch("iron-horse", 3, 2, "The Limited"),
    ch("p-personal-33", 33, 0, "Space Camp"),
    ch("p-1980s-sci-fi-public-domain-30", 48, 0, "Plan 9"),
    ch("my-extra", 99, 0, "The Picnic"),
  ]);
  const aisles = groupAisles(shelves);
  const row = (id) => aisles.find((a) => a.id === id);
  assert.deepEqual(
    row("western").shelves.map((s) => s.ch.slug),
    ["high-noon", "trail-tv"]
  );
  assert.equal(row("noir").shelves[0].ch.slug, "midnight-noir");
  assert.equal(row("sci-fi").shelves.map((s) => s.ch.slug).indexOf("wild-blue"), -1);
  assert.equal(row("space").shelves.some((s) => s.ch.slug === "wild-blue"), true);
  // CH 17 is on the Sci-Fi row and the Space row. Same shelf, not a second copy of the film.
  const onSci = row("sci-fi").shelves.find((s) => s.ch.slug === "mission-control");
  const onSpace = row("space").shelves.find((s) => s.ch.slug === "mission-control");
  assert.equal(onSci, onSpace);
  assert.equal(onSci.films.length, 1);
  // CH 33 is on Sci-Fi and the 80s row, still one shelf.
  const pack33 = row("sci-fi").shelves.find((s) => s.ch.number === 33);
  assert.equal(pack33, row("eighties").shelves.find((s) => s.ch.number === 33));
  // A pack moved off CH 30 still sits on the Sci-Fi row, and nowhere else.
  assert.equal(row("sci-fi").shelves.some((s) => s.ch.slug === "p-1980s-sci-fi-public-domain-30"), true);
  assert.equal(aisles.some((a) => a.id !== "sci-fi" && a.shelves.some((s) => s.ch.slug === "p-1980s-sci-fi-public-domain-30")), false);
  // No anime pack loaded: that row is not on the floor. Unnamed channels, including 3-2, are the rest.
  assert.equal(aisles.some((a) => a.id === "anime"), false);
  assert.equal(aisles[aisles.length - 1].id, "rest");
  assert.deepEqual(
    aisleFilms(aisles[aisles.length - 1]).map((f) => f.item.t).sort(),
    ["The Limited", "The Picnic"]
  );
  const seen = {};
  aisles.forEach(function (a) {
    if (a.id === "rest") return;
    a.shelves.forEach(function (sh) {
      sh.films.forEach(function (f) {
        if (seen[f.key]) assert.equal(seen[f.key], sh);
        else seen[f.key] = sh;
      });
    });
  });
  const custom = groupAisles(shelves, [{ id: "one", name: "One shelf", icon: "★", blurb: "Just noir.", slugs: ["midnight-noir"] }]);
  assert.deepEqual(
    custom.map((a) => a.id),
    ["one", "rest"]
  );
  assert.equal(aisleFilms(custom[0]).length, 1);
  assert.equal(groupAisles([]).length, 0);
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

test("cross-links only name films and books that are really there", async () => {
  const { readFile } = await import("node:fs/promises");
  const { PEARLY_GATES_CHANNEL } = await import("../web/js/secrets.js");
  const lineup = JSON.parse(await readFile(new URL("../web/data/lineup.json", import.meta.url), "utf8"));
  const cat = JSON.parse(await readFile(new URL("../web/data/library-catalog.json", import.meta.url), "utf8"));
  const films = {};
  lineup.channels.forEach(function (ch) {
    (ch.items || []).forEach(function (it) {
      films[it.id] = it;
    });
  });
  const books = {};
  cat.entries.forEach(function (e) {
    books[e.id] = e;
  });
  assert.ok(CROSS_LINKS.length >= 5);
  CROSS_LINKS.forEach(function (link) {
    assert.equal(books[link.bookId] && books[link.bookId].title, link.bookTitle);
    (link.films || []).forEach(function (film) {
      const it = films[film.id];
      assert.ok(it, film.id);
      assert.equal(it.t, film.title);
      assert.ok(it.d >= 40 * 60, film.id);
      assert.ok(String(film.id).indexOf("yt:") !== 0);
      assert.deepEqual(filmTags(film.id), [{ tag: "From the book", title: link.bookTitle, bookId: link.bookId }]);
    });
    if (link.station) {
      assert.equal(link.station.slug, PEARLY_GATES_CHANNEL.slug);
      const on111 = PEARLY_GATES_CHANNEL.items.find(function (it) {
        return it.id === link.station.filmId;
      });
      assert.equal(on111 && on111.t, link.station.filmTitle);
    }
  });
  assert.equal(filmTags("AlicesWonderland").length, 0);
  assert.equal(filmTags("AChristmasCarol1910").length, 0);
  const carol = bookTags("christmascar00dick");
  assert.equal(carol.length, 1);
  assert.equal(carol[0].tag, "On 111 Pearly Gates");
  assert.equal(carol[0].title, "A Christmas Carol");
  assert.equal(bookTags("no-such-book").length, 0);
  assert.ok(bookTags("draculabr00stokuoft").some((t) => t.title.indexOf("Nosferatu") === 0));
  assert.equal(CROSS_LINKS.some((l) => l.station && l.station.slug !== "pearly-gates"), false);
  const box = tapeBoxHtml(film("ThePhantomoftheOpera", "The Phantom of the Opera"), null, "", T0, "On the shelf");
  assert.match(box, /From the book/);
  assert.match(box, /The phantom of the opera/);
  assert.doesNotMatch(tapeBoxHtml(film("detour1945", "Detour"), null, "", T0, "On the shelf"), /From the book/);
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

// ---------- box sets ----------
import { MAX_BOXES, BOX_DAYS, seriesShelves, showName, episodeNumber, checkOutBox, boxFor, setBoxPlace, nextEpisode, restartBox, returnBox, overdueBoxes } from "../web/js/library.js";

const ep = (t, extra) => Object.assign({ id: "id_" + t.replace(/\W+/g, "_"), f: "a.mp4", t: t, d: 1500 }, extra || {});
const sitcoms = {
  slug: "rerun-city",
  number: 11,
  kind: "video",
  items: [
    ep("My Hero - Bum for a Day"),
    ep("Meet Corliss Archer - Episode 3 (1954)"),
    ep("My Hero - Arabian Nights"),
    ep("Meet Corliss Archer - Episode 1 (1954)"),
    ep("My Hero - El Toro"),
    ep("Meet Corliss Archer - Episode 2 (1954)"),
    ep("Meet Corliss Archer - Episode 2 (1954)", { id: "another_upload" }), // the same episode twice
    ep("A Feature Film (1950)", { d: 5400 }), // a film: the tape shelves'
    ep("Only Once - Pilot"),
    ep("Twice - One"),
    ep("Twice - Two"),
    ep("yt:abc", { id: "yt:abc" }),
  ],
};
const lib0 = () => issueCard(emptyLibrary(), "Mitch", 1000, () => 0.5).lib;

test("box sets: a series is three or more episodes of a show on a series channel, in order", () => {
  const sets = seriesShelves([sitcoms]);
  assert.deepEqual(sets.map((s) => [s.show, s.eps.length]), [["Meet Corliss Archer", 3], ["My Hero", 3]]);
  assert.deepEqual(sets[0].eps.map((e) => episodeNumber(e)), [1, 2, 3], "numbered episodes in number order, the second upload of 2 left out");
  assert.equal(sets[0].key, "box:rerun-city:meet corliss archer");
  // Not a series channel: no box sets. A pack's channel (custom): box sets.
  assert.deepEqual(seriesShelves([Object.assign({}, sitcoms, { slug: "high-noon" })]), []);
  assert.equal(seriesShelves([Object.assign({}, sitcoms, { slug: "p-sitcoms-47", custom: true })]).length, 2);
  // Radio isn't a box set.
  assert.deepEqual(seriesShelves([Object.assign({}, sitcoms, { kind: "audio" })]), []);
});

test("box sets: a show's name, whatever the upload calls it", () => {
  const names = {
    "Meet Corliss Archer' - Quaranteened (1954)": "Meet Corliss Archer",
    "Space Patrol aka Planet Patrol s01e02": "Space Patrol",
    "Tom Corbett, Space Cadet (1950) serial #1 The Mercurian Invasion": "Tom Corbett, Space Cadet",
    "Captain Z-Ro (24 Episodes)": "Captain Z-Ro",
    "Burns and Allen # 68": "Burns and Allen",
    "Betty Boop: Chess Nuts": "Betty Boop",
    "Space Patrol 1950 TV Series": "Space Patrol",
  };
  for (const [t, want] of Object.entries(names)) assert.equal(showName({ t: t }), want, t);
  assert.equal(episodeNumber({ t: "Lights Out - S03E07 - Just What Happened" }), 3007);
  assert.equal(episodeNumber({ t: "Beverly Hillbillies Ep02 Getting Settled" }), 2);
  assert.equal(episodeNumber({ t: "Lights Out - Another Country" }), 0);
});

test("box sets: on the real lineup, the series channels have box sets and the film channels don't", async () => {
  const { readFileSync } = await import("node:fs");
  const lineup = JSON.parse(readFileSync(new URL("../web/data/lineup.json", import.meta.url), "utf8"));
  const sets = seriesShelves(lineup.channels);
  const on = (slug) => sets.filter((s) => s.ch.slug === slug).map((s) => s.show);
  assert.ok(on("rerun-city").includes("My Hero"), "Rerun City: " + on("rerun-city"));
  assert.ok(on("game-night").includes("What's My Line"), "Game Night: " + on("game-night"));
  assert.ok(on("saturday-morning").includes("Betty Boop"));
  assert.ok(on("cliffhangers").some((n) => /vampires/i.test(n)));
  assert.ok(sets.every((s) => s.eps.length >= 3 && s.eps.every((e) => e.d < 2400 && !String(e.id).startsWith("yt:"))));
  assert.deepEqual(on("high-noon"), []);
  const vamp = sets.find((s) => /vampires/i.test(s.show));
  assert.deepEqual(vamp.eps.map((e) => episodeNumber(e)).slice(0, 5), [1, 2, 3, 4, 5]);
});

test("box sets: checkout needs a card, one out at a time, apart from the tapes", () => {
  const [a, b] = seriesShelves([sitcoms]);
  assert.equal(checkOutBox(emptyLibrary(), a, 1).error, "card");
  let lib = lib0();
  // Two tapes out doesn't stop a box set: it has its own limit.
  const film = (k) => ({ key: k, item: { id: k, f: "f.mp4", t: k, d: 5400 }, ch: { slug: "x" } });
  lib = checkOut(lib, film("t1"), 1).lib;
  lib = checkOut(lib, film("t2"), 1).lib;
  const r = checkOutBox(lib, a, 5000);
  assert.ok(r.lib && r.box, "a box set goes out with two tapes out");
  lib = r.lib;
  assert.equal(lib.loans.length, 2);
  assert.equal(r.box.due, 5000 + BOX_DAYS * 86400000);
  assert.deepEqual([r.box.ep, r.box.pos, r.box.eps.length, r.box.t], [0, 0, 3, "Meet Corliss Archer"]);
  assert.equal(MAX_BOXES, 1);
  assert.equal(checkOutBox(lib, a, 6000).error, "out");
  const full = checkOutBox(lib, b, 6000);
  assert.equal(full.error, "full");
  assert.match(full.text, /You have a box set out \(Meet Corliss Archer\)/);
  // A third tape is still refused: the box set didn't change the tape limit.
  assert.equal(checkOut(lib, film("t3"), 1).error, "full");
});

test("box sets: the place is kept, episodes follow in order, and it goes back from anywhere", () => {
  const [a] = seriesShelves([sitcoms]);
  let lib = checkOutBox(lib0(), a, 1).lib;
  lib = setBoxPlace(lib, a.key, 0, 600);
  assert.deepEqual([boxFor(lib, a.key).ep, boxFor(lib, a.key).pos], [0, 600]);
  lib = setBoxPlace(lib, a.key, 0, 99999);
  assert.equal(boxFor(lib, a.key).pos, 1500, "never past the episode's end");
  let n = nextEpisode(lib, a.key);
  lib = n.lib;
  assert.deepEqual([n.ep, boxFor(lib, a.key).ep, boxFor(lib, a.key).pos], [1, 1, 0]);
  lib = setBoxPlace(lib, a.key, 2, 30);
  n = nextEpisode(lib, a.key);
  lib = n.lib;
  assert.ok(n.done && boxFor(lib, a.key).done && boxFor(lib, a.key).ep === 2, "after the last episode the box is finished");
  lib = restartBox(lib, a.key);
  assert.deepEqual([boxFor(lib, a.key).ep, boxFor(lib, a.key).pos, boxFor(lib, a.key).done], [0, 0, false]);
  // Back to the shelf mid-episode: no rewinding for a box set.
  lib = setBoxPlace(lib, a.key, 1, 700);
  const back = returnBox(lib, a.key, 9000, false);
  assert.ok(back.lib && !boxFor(back.lib, a.key));
  assert.deepEqual(back.lib.history[0], { kind: "box", t: "Meet Corliss Archer", key: a.key, out: 1, back: 9000, late: false, seen: 1 });
  assert.equal(returnBox(back.lib, a.key, 9000).error, "none");
});

test("box sets: overdue ones are found; they're stored and read back clean; the card takes them back", () => {
  const [a] = seriesShelves([sitcoms]);
  let lib = checkOutBox(lib0(), a, 1).lib;
  assert.deepEqual(overdueBoxes(lib, 1 + BOX_DAYS * 86400000 - 1), []);
  assert.equal(overdueBoxes(lib, 1 + BOX_DAYS * 86400000).length, 1);
  const stored = JSON.parse(JSON.stringify(setBoxPlace(lib, a.key, 2, 99)));
  const clean = cleanLibrary(stored);
  assert.deepEqual([clean.boxes.length, clean.boxes[0].ep, clean.boxes[0].pos], [1, 2, 99]);
  assert.deepEqual(cleanLibrary({ card: stored.card, boxes: [{ key: "x", t: "Bad", eps: [], due: 1 }, "junk"] }).boxes, []);
  assert.deepEqual(cleanLibrary({ card: stored.card }).boxes, [], "an older library has no box sets");
  const cut = cancelCard(lib, 50);
  assert.deepEqual(cut.boxes, []);
  assert.equal(cut.history[0].kind, "box");
});
