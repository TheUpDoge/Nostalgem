// The Reading Room's books: the Internet Archive's scanned books, comics, manga and magazines, read a page
// at a time. Plain data in and out (URLs, metadata, which pages make a spread) so it can be tested without
// a browser; ui/reader.js turns the pages and main.js runs the shelves.
//
// What the Archive gives us, all public and CORS-friendly where it has to be:
//   advancedsearch.php         the shelves and searches
//   /metadata/<id>             a book's details and files: one book, or several volumes in one item
//   /cors/<id>/<vol>_page_numbers.json   how many pages a volume has (or <vol>_scandata.xml, for books
//                              scanned before the Archive made page-number files)
//   page images: the item's own server's BookReaderImages.php (what /download/<id>[/<vol>]/page/n<k>.jpg
//                              redirects to; asked directly, since that redirect mangles volume names
//                              with brackets or braces in them, and it saves a hop per page)
// Books the Archive only lends (borrowed with an archive.org account) are left off the shelves and, if
// opened from a link, point to archive.org instead: their pages aren't open to read here.

import { ARCHIVE, cleanText, corsUrl, thumbUrl, detailsUrl } from "./archive.js";

// Every shelf and search: scanned pages to turn, nothing lending-only, nothing for grown-ups only.
export const READABLE = 'mediatype:texts AND format:"Single Page Processed JP2 ZIP" AND -access-restricted-item:true';
export const FAMILY = "-subject:(adult OR erotica OR erotic OR hentai OR porn OR pornography OR xxx OR nsfw)";

export function shelfQuery(q) {
  return "(" + q + ") AND " + READABLE + " AND " + FAMILY;
}

export function bookSearchUrl(q, rows, page) {
  const p = new URLSearchParams();
  p.set("q", shelfQuery(q));
  ["identifier", "title", "creator", "date", "year", "imagecount"].forEach(function (f) {
    p.append("fl[]", f);
  });
  p.append("sort[]", "downloads desc");
  p.set("rows", String(rows || 48));
  p.set("page", String(page || 1));
  p.set("output", "json");
  return ARCHIVE + "/advancedsearch.php?" + p.toString();
}

// A year from "1911", "1911-05-02" or "c. 1911"; 0 if none.
export function yearOf(v) {
  const m = /(1[5-9]\d\d|20\d\d)/.exec(Array.isArray(v) ? v.join(" ") : String(v == null ? "" : v));
  return m ? Number(m[1]) : 0;
}

function first(v) {
  return Array.isArray(v) ? v[0] || "" : v || "";
}

// "Carroll, Lewis, 1832-1898" → "Lewis Carroll".
export function authorName(v) {
  let s = cleanText(first(v), 80);
  // Roles and life dates come off the end in either order: "…, 1859-1930, author".
  for (let i = 0; i < 3; i++) {
    s = s
      .replace(/,?\s*(ill|illustrator|ed|editor|tr|translator|author|joint author|creator)\.?$/i, "")
      .replace(/,?\s*(b\.\s*)?\d{3,4}\s*-\s*(\d{3,4})?\.?$/, "")
      .trim();
  }
  // A company keeps its name ("Fawcett Publications, Inc."); "Doyle, Arthur Conan, Sir" is Sir Arthur.
  if (/,\s*(inc|ltd|co|corp|company)\.?$/i.test(s)) return s;
  const sir = /^([^,]+),\s*([^,]+),\s*(sir|dame|lord|lady)\.?$/i.exec(s);
  if (sir) return sir[3].charAt(0).toUpperCase() + sir[3].slice(1).toLowerCase() + " " + sir[2] + " " + sir[1];
  const m = /^([^,]+),\s*([^,]+)$/.exec(s);
  if (m) s = m[2] + " " + m[1];
  return s;
}

// One search hit: { id, t, by, y, pages }.
export function parseBookSearch(json) {
  const docs = json && json.response && Array.isArray(json.response.docs) ? json.response.docs : [];
  return docs
    .filter(function (d) {
      return d && typeof d.identifier === "string";
    })
    .map(function (d) {
      return {
        id: d.identifier,
        t: cleanText(d.title, 120) || d.identifier,
        by: authorName(d.creator),
        y: yearOf(d.year || d.date),
        pages: Number(d.imagecount) || 0,
      };
    });
}

// Numbers in order: "v2" before "v10".
export function naturalCompare(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

// A volume's name from its files: "!Berserk/Berserk v01 (2003) (Digital) (danke-Empire)" → "Berserk v01 (2003)".
export function volumeTitle(stem) {
  const last = String(stem).split("/").pop();
  return (
    last
      .replace(/^[!_\s]+/, "")
      .replace(/\s*\(digital\).*$/i, "")
      .replace(/\s*\[[^\]]*\]\s*$/g, "")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim() || last
  );
}

function listOf(v) {
  if (Array.isArray(v)) return v.map(String);
  if (v == null) return [];
  return String(v).split(/\s*;\s*/);
}

// Manga reads right to left. The Archive says so for some books (page-progression "rl"); manga uploads
// often don't, so a book is taken for manga by its collection, subjects or title (not the light novels).
export function isManga(md) {
  const title = cleanText(md.title, 200);
  if (/^\s*novel\b|light novel/i.test(title)) return false;
  const hay = [title].concat(listOf(md.subject)).join(" | ");
  return listOf(md.collection).indexOf("manga_library") >= 0 || /\bmanga\b/i.test(hay);
}

// A book from /metadata/<id>: { id, title, by, y, about, restricted, rtl, manga, volumes: [{ stem, title }],
// pages } — volumes are the item's scanned books (one, or a whole series), pages the Archive's count for a
// single book (0 when it doesn't say).
export function bookFromMetadata(m) {
  const md = (m && m.metadata) || {};
  const files = (m && Array.isArray(m.files) ? m.files : []).map(function (f) {
    return String((f && f.name) || "");
  });
  const id = String(md.identifier || "");
  const seen = {};
  const stems = [];
  files.forEach(function (name) {
    const k = /^(.*)_jp2\.(zip|tar)$/i.exec(name);
    if (k && !seen[k[1]]) {
      seen[k[1]] = 1;
      stems.push(k[1]);
    }
  });
  stems.sort(naturalCompare);
  const pp = String(md["page-progression"] || "").toLowerCase();
  const manga = isManga(md);
  return {
    id: id,
    title: cleanText(md.title, 140) || id,
    by: authorName(md.creator),
    y: yearOf(md.year || md.date),
    about: cleanText(md.description, 700),
    restricted: String(md["access-restricted-item"]).toLowerCase() === "true",
    rtl: pp === "rl" || (pp !== "lr" && manga),
    manga: manga,
    volumes: stems.map(function (s) {
      return { stem: s, title: volumeTitle(s) };
    }),
    pages: Number(md.imagecount) || 0,
    // Where the item's files live, for its page images.
    server: typeof m.server === "string" && /^[\w.-]+$/.test(m.server) ? m.server : "",
    dir: typeof m.dir === "string" && /^\/[\w./-]+$/.test(m.dir) ? m.dir : "",
  };
}

function encPath(p) {
  return String(p).split("/").map(encodeURIComponent).join("/");
}

// Page n (from 0) of a volume, about width pixels wide (0: the Archive's own size). host: the book's
// { server, dir } from its details, to ask its server directly; without it, archive.org's /download/
// address, which redirects there.
export function pageUrl(id, stem, n, width, host) {
  const page = "n" + Math.max(0, Math.floor(n)) + (width ? "_w" + Math.round(width) : "") + ".jpg";
  const sub = stem && stem !== id ? stem : "";
  if (host && host.server && host.dir) {
    const p = new URLSearchParams();
    p.set("id", id);
    p.set("itemPath", host.dir);
    p.set("server", host.server);
    if (sub) p.set("subPrefix", sub);
    p.set("page", page);
    return "https://" + host.server + "/BookReader/BookReaderImages.php?" + p.toString();
  }
  return ARCHIVE + "/download/" + encodeURIComponent(id) + "/" + (sub ? encPath(sub) + "/" : "") + "page/" + page;
}

export function pageNumbersUrl(id, stem) {
  return corsUrl(id, (stem || id) + "_page_numbers.json");
}

export function scandataUrl(id, stem) {
  return corsUrl(id, (stem || id) + "_scandata.xml");
}

// From <vol>_scandata.xml: { count, labels: [] } — the pages shown to readers (a scan's colour cards and
// such are marked addToAccessFormats false and left out, the way the Archive's page numbers count).
export function parseScandata(xml) {
  const s = String(xml || "");
  const pages = s.match(/<page\b[\s\S]*?<\/page>/g) || [];
  let count = 0;
  pages.forEach(function (p) {
    if (!/<addToAccessFormats>\s*false\s*<\/addToAccessFormats>/i.test(p)) count++;
  });
  if (!pages.length) {
    const m = /<leafCount>\s*(\d+)\s*<\/leafCount>/.exec(s);
    if (m) count = Number(m[1]);
  }
  return { count: count, labels: [] };
}

export function coverUrl(id) {
  return thumbUrl(id);
}

export function bookLink(id) {
  return detailsUrl(id);
}

// From <vol>_page_numbers.json: { count, labels } — labels are the printed page numbers ("" when none).
export function parsePageNumbers(json) {
  const pages = json && Array.isArray(json.pages) ? json.pages : [];
  return {
    count: pages.length,
    labels: pages.map(function (p) {
      return p && p.pageNumber != null ? String(p.pageNumber) : "";
    }),
  };
}

// Image widths come in a few sizes, so pages turned before are already in the browser's cache.
const WIDTHS = [400, 600, 800, 1000, 1200, 1600, 2000];
export function pickWidth(px) {
  for (let i = 0; i < WIDTHS.length; i++) if (WIDTHS[i] >= px) return WIDTHS[i];
  return WIDTHS[WIDTHS.length - 1];
}

// ---------- which pages are on screen ----------
// One page at a time, or two side by side like an open book: the cover alone, then 1–2, 3–4… ("shift"
// pairs them 0–1, 2–3… for a book whose two-page pictures come out split).

// The first page of the view that page p is in.
export function viewStart(p, two, shift) {
  if (!two) return p;
  if (shift) return p - (p % 2);
  return p === 0 ? 0 : p % 2 ? p : p - 1;
}

// The pages on screen with page p: [a] or [a, b] (b only if the book has it; count 0 = not known).
export function viewPages(p, count, two, shift) {
  const s = viewStart(p, two, shift);
  if (!two || (!shift && s === 0)) return [s];
  return count && s + 1 >= count ? [s] : [s, s + 1];
}

// The first page of the next view, or -1 at the end.
export function nextView(p, count, two, shift) {
  const v = viewPages(p, count, two, shift);
  const n = v[v.length - 1] + 1;
  return count && n >= count ? -1 : n;
}

// The first page of the view before, or -1 at the start.
export function prevView(p, two, shift) {
  const s = viewStart(p, two, shift);
  return s <= 0 ? -1 : viewStart(s - 1, two, shift);
}

// Pages are counted from the cover, the same everywhere (the page counter, typed numbers, bookmarks):
// a scan's printed numbers start wherever the book's front matter ends, so they'd disagree.
export function pageName(p) {
  return String(p + 1);
}

// Typed digits to a page (from 0), kept inside the book.
export function pageForNumber(typed, count) {
  const n = Number(typed);
  if (!(n > 0)) return -1;
  const k = n - 1;
  return count && k >= count ? count - 1 : k;
}

// ---------- the shelves (web/data/books.json) ----------
// [{ id, name, icon, q }], only well-formed ones.
export function parseShelves(json) {
  const list = json && Array.isArray(json.shelves) ? json.shelves : [];
  return list
    .filter(function (s) {
      return s && typeof s.id === "string" && typeof s.name === "string" && typeof s.q === "string" && s.q.trim();
    })
    .map(function (s) {
      return { id: s.id, name: s.name, icon: typeof s.icon === "string" ? s.icon : "📚", q: s.q };
    });
}

// ---------- the club's catalog ----------
// data/library-catalog.json: public-domain books and Golden Age comics that were checked one by one (rights,
// and that the item exists and can be read). The Reading Room shows it as shelves of its own, one per
// kind, in title order. The manga shelf shows even when it's empty, with the catalog's note on why.
const CATALOG_SHELVES = [
  { type: "book", id: "pd-books", icon: "📜", name: "Public-domain books" },
  { type: "comic", id: "pd-comics", icon: "💥", name: "Public-domain comics" },
  { type: "manga", id: "pd-manga", icon: "🗾", name: "Public-domain manga" },
];
const CATALOG_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function titleKey(t) {
  return String(t)
    .replace(/^(the|a|an)\s+/i, "")
    .toLowerCase();
}

// -> [{ id, icon, name, books: [{ id, t, by, y }], note }]
export function parseCatalog(json) {
  const entries = json && Array.isArray(json.entries) ? json.entries : [];
  const gaps = json && json.gaps && typeof json.gaps === "object" ? json.gaps : {};
  return CATALOG_SHELVES.map(function (sh) {
    const seen = {};
    const books = entries
      .filter(function (e) {
        if (!e || e.type !== sh.type || typeof e.id !== "string" || !CATALOG_ID.test(e.id) || seen[e.id]) return false;
        seen[e.id] = 1;
        return true;
      })
      .map(function (e) {
        return {
          id: e.id,
          t: cleanText(e.title, 140) || e.id,
          by: authorName(String(e.author || "").split(";")[0]),
          y: yearOf(e.year),
        };
      })
      .sort(function (a, b) {
        return naturalCompare(titleKey(a.t), titleKey(b.t));
      });
    return { id: sh.id, icon: sh.icon, name: sh.name, books: books, note: typeof gaps[sh.type] === "string" ? cleanText(gaps[sh.type], 700) : "" };
  });
}
