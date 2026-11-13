// The Reading Room: Archive books as page images, manga right to left, two pages like an open book,
// and books borrowed on the library card with a bookmark that stays.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shelfQuery, bookSearchUrl, parseBookSearch, authorName, yearOf, bookFromMetadata, isManga, volumeTitle, naturalCompare, pageUrl, pageNumbersUrl, parsePageNumbers, scandataUrl, parseScandata, pickWidth, viewStart, viewPages, nextView, prevView, pageName, pageForNumber, parseShelves, groupStackShelves } from "../web/js/books.js";
import { emptyLibrary, issueCard, borrowBook, returnBook, bookLoan, overdueBooks, setMark, markFor, cancelCard, cleanLibrary, checkOut, MAX_BOOKS, BOOK_DAYS } from "../web/js/library.js";
import { bookBoxHtml, dueSlipHtml, stampDate, readingRoomHtml, emptyShelfHtml, bookSpineHtml } from "../web/js/ui/stacks.js";

const T0 = Date.parse("2026-11-08T20:00:00Z");

test("every shelf and search asks for scanned pages, nothing lending-only, nothing for grown-ups only", () => {
  const q = shelfQuery("collection:comics");
  assert.match(q, /^\(collection:comics\) AND /);
  assert.match(q, /mediatype:texts/);
  assert.match(q, /format:"Single Page Processed JP2 ZIP"/);
  assert.match(q, /-access-restricted-item:true/);
  assert.match(q, /-subject:\(adult/);
  const u = new URL(bookSearchUrl("x", 10, 2));
  assert.equal(u.origin + u.pathname, "https://archive.org/advancedsearch.php");
  assert.equal(u.searchParams.get("rows"), "10");
  assert.equal(u.searchParams.get("page"), "2");
  assert.ok(u.searchParams.getAll("fl[]").includes("imagecount"));
});

test("search hits read like a card catalog", () => {
  const hits = parseBookSearch({ response: { docs: [{ identifier: "a", title: "Little women", creator: "Alcott, Louisa May, 1832-1888", date: "1908", imagecount: 234 }, { title: "no id" }, { identifier: "b" }] } });
  assert.deepEqual(hits, [
    { id: "a", t: "Little women", by: "Louisa May Alcott", y: 1908, pages: 234 },
    { id: "b", t: "b", by: "", y: 0, pages: 0 },
  ]);
  assert.deepEqual(parseBookSearch(null), []);
  assert.equal(authorName("Doyle, Arthur Conan, 1859-1930, author"), "Arthur Conan Doyle");
  assert.equal(authorName(["Miura, Kentarou"]), "Kentarou Miura");
  assert.equal(authorName("Inc. World Editions"), "Inc. World Editions");
  assert.equal(yearOf("1911-05-02"), 1911);
  assert.equal(yearOf("c. 1890?"), 1890);
  assert.equal(yearOf(""), 0);
});

test("a book's details: one book, or every volume of a series in order", () => {
  const one = bookFromMetadata({
    metadata: { identifier: "alice", title: "Alice's adventures", creator: "Carroll, Lewis, 1832-1898", date: "1911", imagecount: "348", description: "<p>With <b>illustrations</b></p>" },
    files: [{ name: "alice_jp2.zip" }, { name: "alice.pdf" }, { name: "alice_page_numbers.json" }],
  });
  assert.equal(one.title, "Alice's adventures");
  assert.equal(one.by, "Lewis Carroll");
  assert.equal(one.y, 1911);
  assert.equal(one.pages, 348);
  assert.equal(one.about, "With illustrations");
  assert.equal(one.rtl, false);
  assert.equal(one.restricted, false);
  assert.deepEqual(one.volumes, [{ stem: "alice", title: "alice" }]);
  const series = bookFromMetadata({
    metadata: { identifier: "manga_X", title: "MANGA: X", collection: ["manga_library", "comics"] },
    files: [{ name: "!X [grp]/X v10 (2010) (Digital) (grp)_jp2.zip" }, { name: "!X [grp]/X v2 (2004) (Digital) (grp)_jp2.zip" }, { name: "!X [grp]/X v1 (2003) (Digital) (grp)_jp2.zip" }, { name: "!X [grp]/X v1 (2003) (Digital) (grp).cbz" }],
  });
  assert.deepEqual(
    series.volumes.map((v) => v.title),
    ["X v1 (2003)", "X v2 (2004)", "X v10 (2010)"]
  );
  assert.equal(series.manga, true);
  assert.equal(series.rtl, true); // manga reads right to left even when the uploader didn't say
  assert.equal(bookFromMetadata({ metadata: { identifier: "y", title: "MANGA: Y", collection: "manga_library", "page-progression": "lr" }, files: [] }).rtl, false); // unless it says otherwise
  assert.equal(bookFromMetadata({ metadata: { identifier: "z", title: "Arabic book", "page-progression": "rl" }, files: [] }).rtl, true);
  assert.equal(bookFromMetadata({ metadata: { identifier: "l", "access-restricted-item": "true" }, files: [{ name: "l_jp2.zip" }] }).restricted, true);
  assert.equal(isManga({ title: "NOVEL: Overlord", collection: "manga_library" }), false); // light novels read left to right
  assert.equal(isManga({ title: "Doraemon", subject: "manga; comics" }), true);
  assert.equal(volumeTitle("Berserk v01 (2003) (Digital) (danke-Empire)"), "Berserk v01 (2003)");
  assert.ok(naturalCompare("v2", "v10") < 0);
});

test("page images and page lists, from the Archive's addresses", () => {
  assert.equal(pageUrl("alice", "alice", 5, 800), "https://archive.org/download/alice/page/n5_w800.jpg");
  assert.equal(pageUrl("alice", "", 0, 0), "https://archive.org/download/alice/page/n0.jpg");
  assert.equal(pageUrl("berserk-manga", "Berserk v01 (2003)", 5, 600), "https://archive.org/download/berserk-manga/Berserk%20v01%20(2003)/page/n5_w600.jpg");
  assert.equal(pageUrl("m", "!B [g]/B v1", 2, 400), "https://archive.org/download/m/!B%20%5Bg%5D/B%20v1/page/n2_w400.jpg");
  assert.equal(pageNumbersUrl("alice", "alice"), "https://archive.org/cors/alice/alice_page_numbers.json");
  assert.equal(pageNumbersUrl("m", "B v1"), "https://archive.org/cors/m/B%20v1_page_numbers.json");
  assert.deepEqual(parsePageNumbers({ pages: [{ pageNumber: "" }, { pageNumber: "IV" }, { pageNumber: "1" }] }), { count: 3, labels: ["", "IV", "1"] });
  assert.deepEqual(parsePageNumbers({}), { count: 0, labels: [] });
  assert.equal(pickWidth(700), 800);
  assert.equal(pickWidth(5000), 2000);
});

test("two pages like an open book: the cover alone, then pairs; shifted pairs; one page at a time", () => {
  // count 7: views [0] [1,2] [3,4] [5,6]
  assert.deepEqual(viewPages(0, 7, true, false), [0]);
  assert.deepEqual(viewPages(2, 7, true, false), [1, 2]);
  assert.deepEqual(viewPages(6, 7, true, false), [5, 6]);
  assert.equal(nextView(0, 7, true, false), 1);
  assert.equal(nextView(1, 7, true, false), 3);
  assert.equal(nextView(5, 7, true, false), -1);
  assert.equal(prevView(3, true, false), 1);
  assert.equal(prevView(1, true, false), 0);
  assert.equal(prevView(0, true, false), -1);
  // count 6: the last view is one page
  assert.deepEqual(viewPages(5, 6, true, false), [5]);
  // shifted: [0,1] [2,3]…
  assert.deepEqual(viewPages(1, 7, true, true), [0, 1]);
  assert.equal(viewStart(5, true, true), 4);
  assert.deepEqual(viewPages(6, 7, true, true), [6]);
  // one at a time
  assert.deepEqual(viewPages(4, 7, false, false), [4]);
  assert.equal(nextView(6, 7, false, false), -1);
  // not knowing how many pages: always another, until one won't load
  assert.deepEqual(viewPages(9, 0, true, false), [9, 10]);
  assert.equal(nextView(9, 0, true, false), 11);
});

test("pages are counted from the cover everywhere: the counter and typed numbers agree", () => {
  assert.equal(pageName(0), "1");
  assert.equal(pageName(4), "5");
  assert.equal(pageForNumber("2", 6), 1);
  assert.equal(pageForNumber("40", 10), 9); // past the end: the last page
  assert.equal(pageForNumber("40", 0), 39); // the end not known yet
  assert.equal(pageForNumber("0", 6), -1);
});

test("the shelves file is well-formed and every shelf has a search", () => {
  const shelves = parseShelves(JSON.parse(readFileSync(new URL("../web/data/books.json", import.meta.url), "utf8")));
  assert.ok(shelves.length >= 6);
  assert.ok(shelves.some((s) => s.id === "manga"));
  for (const s of shelves) assert.ok(s.q && s.name && s.icon, s.id);
  assert.equal(new Set(shelves.map((s) => s.id)).size, shelves.length);
  assert.deepEqual(parseShelves({ shelves: [{ id: "x" }, { id: "y", name: "Y", q: " " }] }), []);
});

test("books on the library card: three at a time, two weeks, return any time, the bookmark stays", () => {
  const book = (id) => ({ id, t: "Book " + id, by: "A. Writer", y: 1900 });
  assert.equal(borrowBook(emptyLibrary(), book("a"), T0).error, "card");
  let lib = issueCard(emptyLibrary(), "Marty McFly", T0).lib;
  const a = borrowBook(lib, book("a"), T0);
  assert.equal(a.loan.due, T0 + BOOK_DAYS * 86400000);
  lib = a.lib;
  assert.equal(borrowBook(lib, book("a"), T0).error, "out");
  lib = borrowBook(lib, book("b"), T0).lib;
  lib = borrowBook(lib, book("c"), T0).lib;
  assert.equal(lib.books.length, MAX_BOOKS);
  assert.equal(borrowBook(lib, book("d"), T0).error, "full");
  // Tapes and books don't share the limit.
  assert.ok(checkOut(lib, { key: "t/t.mp4", item: { id: "t", f: "t.mp4", t: "T", d: 5400 }, ch: null }, T0).lib);
  lib = setMark(lib, "a", { v: 1, p: 41, rtl: true, shift: false }, T0);
  lib = returnBook(lib, "a", T0 + 1000).lib;
  assert.equal(bookLoan(lib, "a"), null);
  assert.deepEqual(markFor(lib, "a"), { v: 1, p: 41, rtl: true, shift: false, at: T0 });
  assert.equal(lib.history[0].kind, "book");
  assert.equal(overdueBooks(lib, T0 + BOOK_DAYS * 86400000 + 1).length, 2);
  // Stored and read back: the same library.
  assert.deepEqual(cleanLibrary(JSON.parse(JSON.stringify(lib))), lib);
  // Cutting up the card returns everything, but bookmarks stay.
  const cut = cancelCard(lib, T0 + 5);
  assert.equal(cut.books.length, 0);
  assert.ok(markFor(cut, "a"));
});

test("only the last sixty bookmarks are kept", () => {
  let lib = emptyLibrary();
  for (let i = 0; i < 70; i++) lib = setMark(lib, "b" + i, { v: 0, p: i }, T0 + i);
  assert.equal(Object.keys(lib.marks).length, 60);
  assert.equal(markFor(lib, "b0"), null);
  assert.equal(markFor(lib, "b69").p, 69);
});

test("a book's box and the stamped due date", () => {
  assert.equal(stampDate(Date.parse("2026-11-22T12:00:00Z")), "NOV 22 2026");
  const loan = { id: "a", t: "A", due: T0 + 9 * 86400000 };
  assert.match(dueSlipHtml(loan, T0), /DATE DUE/);
  assert.match(dueSlipHtml(loan, T0), /due back in 9 days/);
  assert.match(dueSlipHtml(loan, T0), /THREE BOOKS · TWO WEEKS/);
  assert.match(readingRoomHtml(), /READING ROOM/);
  assert.match(readingRoomHtml(), /THREE BOOKS · TWO WEEKS/);
  assert.match(emptyShelfHtml("Public-domain manga", "No verifiably <b>public-domain</b> manga"), /No verifiably &lt;b&gt;public-domain&lt;\/b&gt; manga/);
  assert.match(bookSpineHtml([{ id: "oz", t: "<i>Oz</i>" }], "What's on the shelf"), /What&#39;s on the shelf/);
  assert.doesNotMatch(bookSpineHtml([{ id: "oz", t: "<i>Oz</i>" }], "Shelf"), /<i>Oz<\/i>/);
  assert.equal(bookSpineHtml([], ""), "");
  const book = bookFromMetadata({ metadata: { identifier: "a", title: "MANGA: Tom & Jerry", collection: "manga_library" }, files: [{ name: "A v1_jp2.zip" }, { name: "A v2_jp2.zip" }] });
  const html = bookBoxHtml({ id: "a", t: "A" }, book, loan, { v: 1, p: 9 }, T0);
  assert.match(html, /services\/img\/a/);
  assert.match(html, /Tom &amp; Jerry/);
  assert.match(html, /2 volumes/);
  assert.match(html, /right to left/);
  assert.match(html, /bookmark at vol\. 2, page 10/);
  assert.match(bookBoxHtml({ id: "a", t: "A" }, null, null, null, T0), /Fetching its details/);
  const lent = bookFromMetadata({ metadata: { identifier: "l", "access-restricted-item": "true" }, files: [] });
  assert.match(bookBoxHtml({ id: "l", t: "L" }, lent, null, null, T0, "lends"), /link-qr/);
  assert.doesNotMatch(html, /<script|\son[a-z]+=/i);
});

test("page images straight from the item's server, so volume names with brackets and braces work", () => {
  const host = { server: "ia800406.us.archive.org", dir: "/26/items/manga_Berserk" };
  const u = new URL(pageUrl("manga_Berserk", "!Berserk [danke-Empire]{HD}/Berserk v01 (2003)", 0, 800, host));
  assert.equal(u.origin + u.pathname, "https://ia800406.us.archive.org/BookReader/BookReaderImages.php");
  assert.equal(u.searchParams.get("id"), "manga_Berserk");
  assert.equal(u.searchParams.get("itemPath"), "/26/items/manga_Berserk");
  assert.equal(u.searchParams.get("server"), "ia800406.us.archive.org");
  assert.equal(u.searchParams.get("subPrefix"), "!Berserk [danke-Empire]{HD}/Berserk v01 (2003)");
  assert.equal(u.searchParams.get("page"), "n0_w800.jpg");
  // One book: no subPrefix, like the Archive's own redirect.
  assert.equal(new URL(pageUrl("alice", "alice", 3, 600, { server: "ia1.us.archive.org", dir: "/1/items/alice" })).searchParams.get("subPrefix"), null);
  const b = bookFromMetadata({ server: "ia800406.us.archive.org", dir: "/26/items/x", metadata: { identifier: "x" }, files: [{ name: "x_jp2.zip" }] });
  assert.equal(b.server, "ia800406.us.archive.org");
  assert.equal(b.dir, "/26/items/x");
  assert.equal(bookFromMetadata({ server: "evil.example/x?", dir: "../", metadata: { identifier: "x" }, files: [] }).server, "");
});

test("page counts from a scan's own page list, for books without a page-number file", () => {
  const xml = '<book><bookData><leafCount>4</leafCount></bookData><pageData><page leafNum="0"><addToAccessFormats>true</addToAccessFormats></page><page leafNum="1"><addToAccessFormats>false</addToAccessFormats></page><page leafNum="2"><addToAccessFormats>true</addToAccessFormats></page><page leafNum="3"></page></pageData></book>';
  assert.deepEqual(parseScandata(xml), { count: 3, labels: [] });
  assert.equal(parseScandata("<book><leafCount>12</leafCount></book>").count, 12);
  assert.equal(parseScandata("").count, 0);
  assert.equal(scandataUrl("m", "!B [g]{HD}/B v1"), "https://archive.org/cors/m/!B%20%5Bg%5D%7BHD%7D/B%20v1_scandata.xml");
});

test("the club's catalog: checked public-domain shelves, the manga shelf empty with its note", async () => {
  const { parseCatalog } = await import("../web/js/books.js");
  const { readFile } = await import("node:fs/promises");
  const json = JSON.parse(await readFile(new URL("../web/data/library-catalog.json", import.meta.url), "utf8"));
  const shelves = parseCatalog(json);
  assert.deepEqual(
    shelves.map((s) => [s.id, s.books.length]),
    [
      ["pd-books", 59],
      ["pd-comics", 8],
      ["pd-manga", 0],
    ]
  );
  assert.match(shelves[2].note, /No verifiably public-domain manga/);
  const ids = shelves.flatMap((s) => s.books.map((b) => b.id));
  assert.equal(new Set(ids).size, ids.length, "each item once");
  assert.ok(shelves[0].books.every((b) => b.t && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(b.id)));
  // Title order, "The" and "A" aside; authors as names.
  const t = shelves[0].books.map((b) => b.t);
  const i = t.indexOf("The adventures of Sherlock Holmes");
  assert.ok(i >= 0 && i < t.indexOf("Around the world in eighty days") && t.indexOf("Around the world in eighty days") < t.indexOf("A Christmas carol"), t.slice(0, 8).join(" | "));
  assert.equal(shelves[0].books.find((b) => b.id === "christmascar00dick").by, "Charles Dickens");
  assert.equal(shelves[0].books.find((b) => b.id === "adventuresofsher001892doyl").by, "Sir Arthur Conan Doyle");
});

test("a catalog entry that isn't right is left off its shelf", async () => {
  const { parseCatalog } = await import("../web/js/books.js");
  const shelves = parseCatalog({
    entries: [
      { id: "ok_book", title: "Ok", type: "book", year: 1900 },
      { id: "ok_book", title: "Again", type: "book" },
      { id: "bad id", title: "Bad", type: "book" },
      { id: "ok_comic", title: "Comic", type: "comic" },
      { id: "x", title: "Film", type: "film" },
      null,
    ],
    gaps: { manga: "None found." },
  });
  assert.deepEqual(shelves.map((s) => s.books.map((b) => b.id)), [["ok_book"], ["ok_comic"], []]);
  assert.equal(shelves[2].note, "None found.");
  assert.deepEqual(parseCatalog(null).map((s) => s.books.length), [0, 0, 0]);
});

test("the catalog shelves stay one list per kind, in title order", async () => {
  const { parseCatalog } = await import("../web/js/books.js");
  const { readFile } = await import("node:fs/promises");
  const json = JSON.parse(await readFile(new URL("../web/data/library-catalog.json", import.meta.url), "utf8"));
  const books = parseCatalog(json)[0].books;
  assert.equal(books.length, 59);
  const titles = books.map((b) => b.t.toLowerCase().replace(/^(the|a|an)\s+/, ""));
  const sorted = titles.slice().sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  assert.deepEqual(titles, sorted);
  const html = bookBoxHtml({ id: "christmascar00dick", t: "A Christmas carol" }, null, null, null, T0);
  assert.match(html, /On 111 Pearly Gates/);
  assert.match(html, /A Christmas Carol/);
  assert.match(emptyShelfHtml("Public-domain manga", "No verifiably <b>public-domain</b> manga", "No verifiably public-domain manga — here's why"), /No verifiably public-domain manga/);
  assert.match(emptyShelfHtml("Public-domain manga", "No verifiably <b>public-domain</b> manga", "No verifiably public-domain manga — here's why"), /&lt;b&gt;/);
});

test("the Archive's stacks follow a shelf plan, and a shelf it doesn't name still shows", () => {
  const shelves = [
    { id: "classics", name: "Classic novels" },
    { id: "manga", name: "Manga" },
    { id: "pulps", name: "Pulps" },
    { id: "new-one", name: "New" },
  ];
  const aisles = groupStackShelves(shelves);
  assert.deepEqual(
    aisles.map((a) => a.id),
    ["pictures", "magazines", "novels", "more"]
  );
  assert.equal(aisles[0].shelves[0].id, "manga");
  assert.equal(aisles[3].shelves[0].id, "new-one");
  assert.equal(groupStackShelves(null).length, 0);
});
