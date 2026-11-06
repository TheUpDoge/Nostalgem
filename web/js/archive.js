// Internet Archive client. Used in two places:
//  - tools/build-lineup.mjs (Node) builds data/lineup.json from data/channels.json
//  - the app itself, when a viewer adds a channel of their own from the menu
// Both ask the same public, CORS-enabled endpoints: advancedsearch, metadata and /cors/ for subtitles.

import { hash32, mulberry32, shuffle, spreadApart, mapLimit } from "./util.js";

export const ARCHIVE = "https://archive.org";

export function searchUrl(q, opts) {
  const o = opts || {};
  const p = new URLSearchParams();
  p.set("q", q);
  ["identifier", "title", "year", "date", "downloads", "subject"].forEach(function (f) {
    p.append("fl[]", f);
  });
  p.append("sort[]", o.sort || "downloads desc");
  p.set("rows", String(o.rows || 50));
  p.set("page", String(o.page || 1));
  p.set("output", "json");
  return ARCHIVE + "/advancedsearch.php?" + p.toString();
}

function encPath(file) {
  return String(file).split("/").map(encodeURIComponent).join("/");
}
export function metadataUrl(id) {
  return ARCHIVE + "/metadata/" + encodeURIComponent(id);
}
export function downloadUrl(id, file) {
  return ARCHIVE + "/download/" + encodeURIComponent(id) + "/" + encPath(file);
}
// The /cors/ path serves an item's files with CORS headers; /download/ doesn't, so subtitles go through here.
export function corsUrl(id, file) {
  return ARCHIVE + "/cors/" + encodeURIComponent(id) + "/" + encPath(file);
}
export function thumbUrl(id) {
  return ARCHIVE + "/services/img/" + encodeURIComponent(id);
}
export function detailsUrl(id) {
  return ARCHIVE + "/details/" + encodeURIComponent(id);
}

// "5971.27", "99:31", "1:39:30", "74 min", "105 min.", "1 hr 20 min" -> seconds (0 when unknown)
export function parseLength(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return isFinite(v) && v > 0 ? v : 0;
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const m = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?(\.\d+)?$/);
  if (m) {
    let sec = 0;
    [m[1], m[2], m[3]].forEach(function (part) {
      if (part !== undefined) sec = sec * 60 + Number(part);
    });
    return sec + (m[4] ? parseFloat(m[4]) : 0);
  }
  let total = 0;
  let hit = false;
  const h = s.match(/(\d+(?:\.\d+)?)\s*h/i);
  if (h) {
    total += parseFloat(h[1]) * 3600;
    hit = true;
  }
  const mi = s.match(/(\d+(?:\.\d+)?)\s*m(?:in)?/i);
  if (mi) {
    total += parseFloat(mi[1]) * 60;
    hit = true;
  }
  return hit ? total : 0;
}

function firstOf(v) {
  return Array.isArray(v) ? v[0] : v;
}

const ENTITIES = { "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&lt;": "<", "&gt;": ">" };
export function cleanText(v, max) {
  let s = Array.isArray(v) ? v.join(" ") : String(v == null ? "" : v);
  s = s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(nbsp|amp|quot|#39|apos|lt|gt);/g, function (e) {
      return ENTITIES[e];
    })
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (max && s.length > max) {
    s = s.slice(0, max);
    const sp = s.lastIndexOf(" ");
    if (sp > max * 0.6) s = s.slice(0, sp);
    s = s.replace(/[\s,.;:(\-]+$/, "") + "…";
  }
  return s;
}

// Uploader decorations that read badly in a TV guide.
const TITLE_TAILS = [
  /^otrr\s+/i,
  /\s+page\s?\d+$/i,
  /\s+singles$/i,
  /\s*[-–:]\s*single episodes$/i,
  /\s*\(?\d+\s*eps?\.?(\s*\+.*)?\)?$/i,
  /\s*\(?(pd|public domain)\s+episodes\)?$/i,
  /\s*public domain episodes$/i,
  /\s+collection$/i,
  /\s*\((classic tv|full movie|colou?rized|hd)\)$/i,
  /\s*\.(mp4|m4v|avi|mkv|mov|mxf|wmv|flv|webm|mpe?g|ogv|mp3)$/i,
];
export function cleanTitle(s) {
  let t = cleanText(s);
  // ''The Lone Ranger'' - Legion of Old Timers  ->  The Lone Ranger - Legion of Old Timers
  t = t.replace(/''([^']+)''/g, "$1").replace(/"([^"]+)"\s*[-–:]/g, "$1 -");
  t = t.replace(/^['"‘’“”]+|['"‘’“”]+$/g, "");
  for (let pass = 0; pass < 3; pass++) {
    TITLE_TAILS.forEach(function (re) {
      t = t.replace(re, "");
    });
  }
  t = t.replace(/^['"‘’“”]+|['"‘’“”]+$/g, "").trim();
  // Charlie Chaplin's "A Fair Exchange   ->   Charlie Chaplin's A Fair Exchange
  if ((t.match(/"/g) || []).length % 2) t = t.replace(/"/g, "").replace(/\s+/g, " ").trim();
  // Apollo-15_Onboard-Film-Mags_EE   ->   Apollo-15 Onboard-Film-Mags EE
  if (t.indexOf(" ") < 0 && t.indexOf("_") >= 0) t = t.replace(/_+/g, " ").trim();
  return t;
}

// "Frontier Gentleman 1958-07-06 (022) The Education of Kid Yancey" (show "Frontier Gentleman")
//   -> "The Education of Kid Yancey"
export function tidyEpisode(ep, show) {
  const norm = function (x) {
    return String(x).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  };
  const showN = norm(show || "").replace(/^the /, "");
  const clean = String(ep).replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  const words = clean.replace(/^the\s+/i, "").split(/\s+/);
  let rest = clean;
  if (showN) {
    let acc = "";
    for (let k = 0; k < words.length - 1; k++) {
      acc = norm(acc + " " + words[k]);
      if (acc === showN) {
        rest = words.slice(k + 1).join(" ");
        break;
      }
      if (showN.indexOf(acc) !== 0) break;
    }
  }
  rest = rest.replace(/^[\s\-–:,.]+/, "");
  let e = rest;
  for (let i = 0; i < 5; i++) {
    e = e.replace(/^(\d{2,4}[-.]\d{1,2}[-.]\d{1,4}|\d{6,8}(?=\s)|\(\d+\)|#\d+|ep\.?\s?\d+|s\d+\s?e\d+|\d{1,4}(?=\s)|[-–_:,.]+)\s*/i, "");
  }
  e = e.trim();
  return e || rest.trim() || clean;
}

export function fileTitle(name) {
  let s = String(name).split("/").pop();
  s = s.replace(/\.[a-z0-9]{2,4}$/i, "").replace(/(_512kb|\.ia|_64kb|_vbr)$/i, "");
  s = s.replace(/[_]+/g, " ");
  // CaseOfTheNevadaManKiller -> Case Of The Nevada Man Killer; 010WalkingCorpse -> 010 Walking Corpse
  if (s.indexOf(" ") < 0 && /[a-z][A-Z]/.test(s)) s = s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/(\d)([A-Z][a-z])/g, "$1 $2");
  // the-defenders -> the defenders, but keep hyphens inside a name that already has spaces
  s = s.replace(/(\S+)/g, function (w) {
    return /^[a-z]+(-[a-z]+)+$/i.test(w) ? w.replace(/-/g, " ") : w;
  });
  return s.replace(/\s+/g, " ").trim();
}

function yearsIn(v) {
  const out = [];
  String(v == null ? "" : firstOf(v)).replace(/\b(18[89]\d|19\d\d|20[0-3]\d)\b/g, function (m) {
    out.push(Number(m));
    return m;
  });
  return out;
}
function minYear(list) {
  let ys = [];
  list.forEach(function (v) {
    ys = ys.concat(yearsIn(v));
  });
  return ys.length ? Math.min.apply(null, ys) : 0;
}

// The earliest year an item mentions anywhere. A compilation uploaded in 2020 of 1949 broadcasts
// says 2020 in its date but 1949 in its description; the content is from 1949.
export function contentYear(md) {
  return minYear([md.year, md.date, md.title, cleanText(md.description).slice(0, 600)]);
}

// The year to show for an item: its own date, unless that's clearly an upload date.
function itemYear(md) {
  const own = minYear([md.year, md.date, md.title]);
  const content = contentYear(md);
  return own && content && own - content > 15 ? 0 : own;
}

// "YTJD 1948-12-07 ..." -> 1948; "Gunsmoke 52-04-26 ..." -> 1952
export function fileYear(text) {
  const s = String(text || "");
  const four = s.match(/(?:^|[^0-9])(18[89]\d|19\d\d|20[0-3]\d)(?:[^0-9]|$)/);
  if (four) return Number(four[1]);
  const two = s.match(/(?:^|[^0-9])([3-6]\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(?:[^0-9]|$)/);
  return two ? 1900 + Number(two[1]) : 0;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A word/phrase list -> one case-insensitive regex that only matches whole words.
export function compileExclude(words) {
  const list = (words || []).filter(Boolean);
  if (!list.length) return null;
  return new RegExp("(^|[^a-z0-9])(" + list.map(escapeRe).join("|") + ")(?=$|[^a-z0-9])", "i");
}

function textOf(o) {
  if (!o) return "";
  const subj = o.subject;
  return [o.identifier, firstOf(o.title), Array.isArray(subj) ? subj.join(" ") : subj || ""]
    .join(" ")
    .replace(/[‘’]/g, "'");
}

const VIDEO_RANK = { "h.264": 0, "h.264 IA": 0, MPEG4: 1, "h.264 HD": 1, "512Kb MPEG4": 3 };
const AUDIO_RANK = { "VBR MP3": 0, "128Kbps MP3": 1, MP3: 1, "160Kbps MP3": 1, "192Kbps MP3": 1, "256Kbps MP3": 1, "320Kbps MP3": 1, "96Kbps MP3": 2, "64Kbps MP3": 2, "56Kbps MP3": 3, "48Kbps MP3": 3, "32Kbps MP3": 4, "24Kbps MP3": 4, "16Kbps MP3": 5 };

function rankOf(f, kind) {
  const name = f.name || "";
  if (f.private === "true" || f.private === true) return -1;
  if (kind === "audio") {
    if (!/\.mp3$/i.test(name)) return -1;
    const r = AUDIO_RANK[f.format];
    return r == null ? 3 : r;
  }
  if (!/\.mp4$/i.test(name)) return -1;
  const r = VIDEO_RANK[f.format];
  return r == null ? 2 : r;
}

// A derivative (foo.mp4 made from foo.avi) belongs with its original.
function groupKey(f) {
  return f.source === "original" || !f.original ? f.name : f.original;
}

function stripExt(name) {
  return String(name).replace(/\.[a-z0-9]{2,4}$/i, "").replace(/(_512kb|\.ia)$/i, "");
}

function isSubtitle(f) {
  const n = f.name || "";
  if (!/\.(srt|vtt)$/i.test(n)) return false;
  // The old ".asr.srt" speech recognition is mostly noise on old films; the newer ".autogenerated.vtt" is good.
  if (/\.asr\.(srt|vtt)$/i.test(n) || f.format === "ASR") return false;
  return !(f.private === "true" || f.private === true);
}

function isAutoCaption(name) {
  return /\.autogenerated\.vtt$/i.test(name);
}

const LANGS = [
  ["es", /^(es|spa|spanish|espanol|español|castellano|sub-?esp|esp)$/i],
  ["en", /^(en|eng|english|ingles|inglés)$/i],
  ["fr", /^(fr|fre|fra|french|francais|français)$/i],
  ["de", /^(de|ger|deu|german|deutsch)$/i],
  ["it", /^(it|ita|italian|italiano)$/i],
  ["pt", /^(pt|por|portuguese|portugues|português)$/i],
];
export function subtitleLang(name) {
  const tokens = stripExt(name).split(/[._\-\s()[\]]+/);
  for (let i = tokens.length - 1; i >= 0; i--) {
    for (let j = 0; j < LANGS.length; j++) if (LANGS[j][1].test(tokens[i])) return LANGS[j][0];
  }
  return "";
}

// -> [[file, lang, auto?], ...]: human-made subtitles first (one per language), then one auto caption.
function subtitlesFor(key, fileName, subs, onlyGroup) {
  const bases = [stripExt(key), stripExt(fileName)];
  const human = [];
  let auto = null;
  const langs = {};
  subs.forEach(function (s) {
    const matches =
      onlyGroup ||
      bases.some(function (b) {
        return b && s.name.indexOf(b) === 0;
      });
    if (!matches) return;
    if (isAutoCaption(s.name)) {
      if (!auto) auto = [s.name, subtitleLang(s.name.replace(/\.autogenerated\.vtt$/i, "")), 1];
      return;
    }
    const l = subtitleLang(s.name);
    if (langs[l] || human.length >= 3) return;
    langs[l] = 1;
    human.push([s.name, l]);
  });
  if (auto) human.push(auto);
  return human;
}

function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

// One item's metadata -> the programs it can contribute (one per playable file).
export function pickPrograms(meta, opts) {
  const o = opts || {};
  const kind = o.kind === "audio" ? "audio" : "video";
  const files = meta.files || [];
  const md = meta.metadata || {};
  const best = {};
  const lengths = {};
  files.forEach(function (f) {
    const k = groupKey(f);
    const len = parseLength(f.length);
    if (len > 0 && !(lengths[k] > 0)) lengths[k] = len;
    const r = rankOf(f, kind);
    if (r < 0) return;
    if (!best[k] || r < best[k].rank) best[k] = { file: f, rank: r };
  });
  const keys = Object.keys(best).sort(naturalCompare);
  const subs = files.filter(isSubtitle);
  const title = cleanTitle(firstOf(md.title) || md.identifier || "");
  const year = itemYear(md);
  const multi = keys.length > 1;
  const minS = o.minS || 0;
  const maxS = o.maxS || Infinity;
  const out = [];
  keys.forEach(function (k) {
    const f = best[k].file;
    let d = parseLength(f.length) || lengths[k] || 0;
    if (!d && !multi) d = parseLength(firstOf(md.runtime));
    d = Math.round(d);
    if (!(d > 0) || d < minS || d > maxS) return;
    const p = { id: md.identifier, f: f.name, t: title || fileTitle(f.name), d: d };
    const y = (multi && fileYear(f.name + " " + (f.title || ""))) || year;
    if (y) p.y = y;
    if (o.maxYear && multi && p.y > o.maxYear) return;
    if (multi) {
      const ep = tidyEpisode(cleanTitle(f.title || fileTitle(f.name)), p.t);
      if (ep && ep.toLowerCase() !== p.t.toLowerCase()) p.e = ep;
      if (o.exclude && p.e && o.exclude.test(p.e)) return;
    }
    const cc = subtitlesFor(k, f.name, subs, !multi);
    if (cc.length) p.cc = cc;
    out.push(p);
  });
  return out;
}

// "Spring - Blender Open Movie", "Spring Open Movie" and "Spring (2019) HD" are the same program.
const NOISE_WORDS = /\b(the|a|an|blender|open|movie|film|full|hd|sd|1080p|720p|480p|colou?rized|restored|remastered|version|upgrade|quality|video)\b/g;
export function sameShowKey(p) {
  return (p.t + " " + (p.e || ""))
    .toLowerCase()
    .replace(/\b(18|19|20)\d\d\b/g, "")
    .replace(NOISE_WORDS, "")
    .replace(/[^a-z0-9]+/g, "");
}

// A channel definition (see data/channels.json) -> a shuffled list of programs.
// ctx: { fetchJson(url) -> Promise<json>, exclude: [...words], excludeDescription: [...], concurrency, seed, log }
export async function buildChannel(def, ctx) {
  const kind = def.kind === "audio" ? "audio" : "video";
  const minS = (def.minMinutes || 0) * 60;
  const maxS = (def.maxMinutes || 600) * 60;
  const perItem = def.filesPerItem || 1;
  const maxItems = def.maxItems || 60;
  const exclude = compileExclude((ctx.exclude || []).concat(def.exclude || []));
  const excludeDesc = compileExclude(ctx.excludeDescription || []);
  const excludeFiles = compileExclude(ctx.excludeFiles || []);
  const log = ctx.log || function () {};
  const progress = ctx.progress || function () {};
  const maxYear = def.maxYear !== undefined ? def.maxYear : ctx.maxYear;
  let checked = 0;

  const docs = [];
  const seen = {};
  for (let s = 0; s < def.sources.length; s++) {
    const src = def.sources[s];
    const json = await ctx.fetchJson(searchUrl(src.q, { rows: src.rows || 60, sort: src.sort }));
    const list = (json && json.response && json.response.docs) || [];
    list.forEach(function (d) {
      if (!d || !d.identifier || seen[d.identifier]) return;
      seen[d.identifier] = 1;
      if (exclude && exclude.test(textOf(d))) return;
      docs.push(d);
    });
  }

  // Several searches feed one channel: merge them by popularity, so a later search isn't left out.
  docs.sort(function (a, b) {
    return (b.downloads || 0) - (a.downloads || 0);
  });
  const groups = new Array(docs.length);
  const about = {};
  await mapLimit(docs, ctx.concurrency || 4, async function (doc, i) {
    let meta;
    try {
      meta = await ctx.fetchJson(metadataUrl(doc.identifier));
    } catch (e) {
      log("  ! " + doc.identifier + ": " + e.message);
      return;
    } finally {
      progress(++checked, docs.length);
    }
    if (!meta || !meta.files || !meta.metadata) return;
    const md = meta.metadata;
    // Lending-library items only play for a signed-in borrower.
    if (String(md["access-restricted-item"]) === "true") return;
    if (exclude && exclude.test(textOf(md))) return;
    // A rip of a commercial release often only gives itself away in a file name.
    if (
      excludeFiles &&
      meta.files.some(function (f) {
        return excludeFiles.test(f.name || "");
      })
    )
      return;
    const desc = cleanText(md.description);
    if (excludeDesc && excludeDesc.test(desc)) return;
    // Public-domain films are mostly from before 1978; later uploads are usually someone's copyright.
    const year = contentYear(md);
    if (maxYear && year && year > maxYear) return;
    let progs = pickPrograms(meta, { kind: kind, minS: minS, maxS: maxS, exclude: exclude, maxYear: maxYear });
    if (perItem === 1 && progs.length > 1) {
      // One film per item: take the full feature, not a trailer, an excerpt or an "_edit" cut.
      progs.sort(function (a, b) {
        return b.d - a.d;
      });
      progs = progs.slice(0, 1);
    } else if (progs.length > perItem) progs = shuffle(progs, mulberry32(hash32(doc.identifier))).slice(0, perItem);
    if (perItem === 1) progs.forEach(function (p) {
      delete p.e;
    });
    if (progs.length && desc) about[md.identifier] = cleanText(desc, 170);
    groups[i] = progs;
  });

  // Round-robin across items so one big collection can't fill the whole channel,
  // and the same film uploaded three times airs once.
  const picked = [];
  const seenTitle = {};
  for (let round = 0; picked.length < maxItems; round++) {
    let any = false;
    for (let g = 0; g < groups.length && picked.length < maxItems; g++) {
      const p = groups[g] && groups[g][round];
      if (!p) continue;
      any = true;
      const key = sameShowKey(p);
      if (seenTitle[key]) continue;
      seenTitle[key] = 1;
      picked.push(p);
    }
    if (!any) break;
  }
  const rand = mulberry32(hash32(def.slug + "|" + (ctx.seed || "")));
  const items = spreadApart(shuffle(picked, rand), function (p) {
    return p.id;
  });
  const usedAbout = {};
  items.forEach(function (p) {
    if (about[p.id]) usedAbout[p.id] = about[p.id];
  });
  return { items: items, about: usedAbout, searched: docs.length };
}

export function browserFetchJson(url) {
  return fetch(url, { credentials: "omit" }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  });
}
