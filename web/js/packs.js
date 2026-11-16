// Channel packs: small JSON files that add channels from the Internet Archive.
// A pack never touches the shipped lineup — its channels load through the same
// viewer-added path as Menu ▸ Add a channel, saved on this TV only. Pack channels take
// CH 30–49, the hundreds 100–199, or 200–299 (dial.js): every built-in channel stays under 99.
// Packs point at the Archive by a collection search or Archive item IDs, and may also list direct links
// to video files ("urls": .mp4, .webm, or an .m3u8 stream), each one a program in the channel's rotation.
// Links are checked when the pack loads: one that is dead, needs a login, expires, or is a web page
// (YouTube, Vimeo: those belong on a sub-channel) is left out with the reason, and the rest play.
// A pack may also carry clean cuts ("skipLists", cuts.js): scenes to cover or skip in its films. A pack
// can be only that.
// Several packs can travel together in a .zip: every .json file in it is read as a pack, or as a skip-list
// file (zip.js).

import {
  cleanText,
  compileExclude,
  contentYear,
  metadataUrl,
  pickPrograms,
  sameShowKey,
  textOf,
} from "./archive.js";
import { hash32, mapLimit, mulberry32, shuffle, spreadApart } from "./util.js";
import { checkSkipLists, SKIP_FORMAT } from "./cuts.js";
import { readZip, utf8Text } from "./zip.js";
import { packNumberOk, packRangesText } from "./dial.js";

export const PACK_VERSION = 1;
export const PACK_MIN_NUMBER = 30; // the viewer-added range, 30–49; packs may also use 100–199 and 200–299 (dial.js)
export const PACK_MAX_NUMBER = 49;
const MAX_CHANNELS = 20;
const MAX_SOURCES = 10;
const MAX_ITEMS = 50;
const NAME_LIMIT = 24;

// A query is rejected when it looks like a link or names another video site.
const BAD_QUERY = /:\/\/|youtu\.?be|youtube|vimeo|dailymotion|twitch\.tv|[<>]/i;
const ITEM_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function isInt(v) {
  return typeof v === "number" && isFinite(v) && Math.floor(v) === v;
}

export function packSlug(name) {
  const s = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "pack";
}

// JSON text -> { ok, pack, errors }. The shape check lives in validatePack.
export function parsePack(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, pack: null, errors: ["Not valid JSON: " + e.message] };
  }
  if (!isPlainObject(data)) {
    return { ok: false, pack: null, errors: ["A pack is one JSON object, not an array or a bare value."] };
  }
  return { ok: true, pack: data, errors: [] };
}

function checkSource(src, where, errors, warnings) {
  if (!isPlainObject(src)) {
    errors.push(where + ": a source is an object with q, items or urls.");
    return;
  }
  if (src.url != null || src.youtube != null || src.handle != null || src.playlist != null) {
    errors.push(where + ": packs point at the Archive by query or item id, or list video files in urls — not url, YouTube or playlists.");
    return;
  }
  const hasQ = src.q != null;
  const hasItems = src.items != null;
  const hasUrls = src.urls != null;
  if (hasQ && hasItems) {
    errors.push(where + ": use q or items, not both.");
    return;
  }
  if (!hasQ && !hasItems && !hasUrls) {
    errors.push(where + ": a source needs q (an Archive search), items (Archive item IDs) or urls (links to video files).");
    return;
  }
  if (hasUrls) checkUrls(src.urls, where, errors, warnings);
  if (hasQ) {
    if (typeof src.q !== "string" || !src.q.trim()) {
      errors.push(where + ": q must be a non-empty Archive search.");
    } else if (BAD_QUERY.test(src.q)) {
      errors.push(where + ": q must be an Archive search, not a link or another video site.");
    } else if (src.q.indexOf("collection:") < 0 && src.q.indexOf("identifier:") < 0 && src.q.indexOf("mediatype:") < 0) {
      warnings.push(where + ": a bare search with no collection:, identifier: or mediatype: — results may vary.");
    }
    if (src.rows != null && (!isInt(src.rows) || src.rows < 1 || src.rows > 100)) {
      errors.push(where + ": rows must be a whole number from 1 to 100.");
    } else if (isInt(src.rows) && src.rows < 25) {
      warnings.push(where + ": rows under 25 may find fewer than 25 programs — a thin channel.");
    }
    if (src.sort != null && typeof src.sort !== "string") {
      errors.push(where + ": sort must be text, like \"downloads desc\".");
    }
  }
  if (hasItems) {
    if (!Array.isArray(src.items) || !src.items.length) {
      errors.push(where + ": items must be a non-empty list of Archive item IDs.");
    } else if (src.items.length > MAX_ITEMS) {
      errors.push(where + ": at most " + MAX_ITEMS + " item IDs per source.");
    } else {
      src.items.forEach(function (id) {
        if (typeof id !== "string" || !ITEM_ID.test(id)) {
          errors.push(where + ": " + JSON.stringify(id) + " is not an Archive item ID (no links, spaces or slashes).");
        }
      });
    }
  }
}

// ---------- direct links ("urls") ----------
const LINK_MAX = 2000; // characters
const VIDEO_EXT = /\.(mp4|m4v|webm|ogv|mov|m3u8)$/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|oga|ogg|opus|wav|flac)$/i;
// Web pages of video sites: they don't play in a <video>. YouTube goes on a sub-channel instead.
const PAGE_SITES = [
  [/(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/i, "a YouTube page, not a video file (YouTube goes on a sub-channel, not in a pack)"],
  [/(^|\.)vimeo\.com$/i, "a Vimeo page, not a video file"],
  [/(^|\.)(dailymotion\.com|dai\.ly)$/i, "a Dailymotion page, not a video file"],
  [/(^|\.)(twitch\.tv|tiktok\.com|facebook\.com|fb\.watch|instagram\.com|x\.com|twitter\.com|rumble\.com|bilibili\.com)$/i, "a video site's page, not a video file"],
  [/(^|\.)(drive\.google\.com|dropbox\.com)$/i, "a sharing page, not the file itself (or it needs a login)"],
];
// Signed links that stop working after a while: they'd die on the air.
const EXPIRING = /[?&](x-amz-expires|x-amz-signature|expires|exp|se|sig|signature|token|policy|key-pair-id|hdnts|hdnea)=/i;
const EXPIRING_HOST = /(^|\.)(googlevideo\.com|fbcdn\.net|cdninstagram\.com|tiktokcdn\.com)$/i;

// The entries of a source's urls: a link, or { url, title }.
function urlEntry(e) {
  if (typeof e === "string") return { url: e.trim(), title: "" };
  if (isPlainObject(e) && typeof e.url === "string") return { url: e.url.trim(), title: typeof e.title === "string" ? e.title.trim().slice(0, 120) : "" };
  return null;
}

function checkUrls(urls, where, errors, warnings) {
  if (!Array.isArray(urls) || !urls.length) {
    errors.push(where + ": urls must be a non-empty list of links to video files.");
    return;
  }
  if (urls.length > MAX_ITEMS) {
    errors.push(where + ": at most " + MAX_ITEMS + " links per source.");
    return;
  }
  urls.forEach(function (raw) {
    const e = urlEntry(raw);
    if (!e) {
      errors.push(where + ": " + JSON.stringify(raw).slice(0, 60) + " is not a link (give the address as text, or { url, title }).");
      return;
    }
    const c = linkCheck(e.url, "video");
    if (!c.ok && c.fatal) errors.push(where + ": " + JSON.stringify(e.url.slice(0, 80)) + " " + c.why + ".");
    else if (!c.ok) warnings.push(where + ": left out " + shortLink(e.url) + " — " + c.why + ".");
  });
}

// "archive.org/download/BigBuckBunny_124/…/big_buck_bunny_720p_surround.mp4" for messages: no scheme,
// the middle shortened.
export function shortLink(url) {
  const t = String(url).replace(/^https?:\/\//i, "");
  return t.length > 60 ? t.slice(0, 28) + "…" + t.slice(-28) : t;
}

// A link, before anything is fetched: { ok: true, file, title, hls, item? } or { ok: false, why, fatal? }.
// fatal: not a link at all (the pack has a mistake); otherwise the link is left out and the rest plays.
// opts: { secure: the page is https (an http link can't play there), hls: this browser plays .m3u8 }
export function linkCheck(url, kind, opts) {
  const o = opts || {};
  if (typeof url !== "string" || !url) return { ok: false, why: "is not a link", fatal: true };
  if (url.length > LINK_MAX) return { ok: false, why: "is longer than " + LINK_MAX + " characters", fatal: true };
  let u;
  try {
    u = new URL(url);
  } catch (e) {
    return { ok: false, why: "is not a whole link (it needs https:// at the start)", fatal: true };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, why: "is not a web link (https://…)", fatal: true };
  if (u.username || u.password) return { ok: false, why: "a link with a login in it" };
  const host = u.hostname.toLowerCase();
  // An Archive item's page: that's an item, so it plays the way items do.
  const det = /^\/(?:details|embed)\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/?$/.exec(u.pathname);
  if (/(^|\.)archive\.org$/.test(host) && det) return { ok: true, item: det[1] };
  for (let i = 0; i < PAGE_SITES.length; i++) if (PAGE_SITES[i][0].test(host)) return { ok: false, why: PAGE_SITES[i][1] };
  if (EXPIRING_HOST.test(host) || EXPIRING.test(u.search)) return { ok: false, why: "a link that expires (it's signed for a short time), so it would stop playing" };
  if (u.protocol === "http:" && o.secure) return { ok: false, why: "an http:// link, which can't play on NostalGem's https:// page (try https://)" };
  let path = u.pathname;
  try {
    path = decodeURIComponent(path);
  } catch (e) {
    /* keep it as it is */
  }
  const file = path.split("/").pop() || host;
  const hls = /\.m3u8$/i.test(file);
  const known = VIDEO_EXT.test(file) || (kind === "audio" && AUDIO_EXT.test(file));
  if (!known && /\.(html?|php|aspx?|jsp)$/i.test(file)) return { ok: false, why: "a web page, not a video file" };
  if (!known && /\.(jpe?g|png|gif|webp|pdf|zip|txt|srt|vtt|json)$/i.test(file)) return { ok: false, why: "not a video file" };
  if (hls && o.hls === false) return { ok: false, why: "an .m3u8 stream, which this browser can't play (the TV app can)" };
  return { ok: true, file: file, hls: hls, title: linkTitle(file) };
}

// "big_buck_bunny_720p_surround.mp4" -> "Big Buck Bunny 720p Surround"
export function linkTitle(file) {
  const t = String(file || "")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[_+.]+/g, " ")
    .replace(/\s*-\s*/g, " – ")
    .replace(/\s+/g, " ")
    .trim();
  return (t || "A film").replace(/(^|\s)([a-z])/g, function (m, a, b) {
    return a + b.toUpperCase();
  }).slice(0, 120);
}

// A validated pack channel's links -> programs. ctx.probe(url, kind) loads the link's details the way the
// player will and resolves { ok, d (seconds; Infinity for a live stream), why }. Every link that won't
// play is left out with the reason, in skipped: [{ url, why }]. (Archive item pages in urls became item
// IDs in packChannelDef.)
// ctx: { probe, secure, hls, concurrency, progress(n, total) }
export async function buildLinkPrograms(entries, def, ctx) {
  const kind = def.kind === "audio" ? "audio" : "video";
  const minS = (def.minMinutes || 0) * 60;
  const maxS = (def.maxMinutes || 600) * 60;
  const progress = ctx.progress || function () {};
  const skipped = [];
  const programs = [];
  const seen = {};
  const todo = [];
  entries.forEach(function (raw) {
    const e = urlEntry(raw);
    if (!e || seen[e.url]) return;
    seen[e.url] = 1;
    const c = linkCheck(e.url, kind, { secure: ctx.secure, hls: ctx.hls });
    if (!c.ok) skipped.push({ url: e.url, why: c.why });
    else if (!c.item) todo.push({ url: e.url, check: c, title: e.title || c.title });
  });
  let checked = 0;
  await mapLimit(todo, ctx.concurrency || 3, async function (t, i) {
    let r;
    try {
      r = await ctx.probe(t.url, kind);
    } catch (e) {
      r = { ok: false, why: e.message };
    } finally {
      progress(++checked, todo.length);
    }
    if (!r || !r.ok) {
      skipped.push({ url: t.url, why: (r && r.why) || "it didn't load (a dead link, or one that needs a login)" });
      return;
    }
    const live = !isFinite(r.d);
    const d = live ? 3600 : Math.round(r.d);
    if (!live && d < minS) {
      skipped.push({ url: t.url, why: "it's shorter than the channel's " + Math.round(minS / 60) + " minutes" });
      return;
    }
    if (!live && d > maxS) {
      skipped.push({ url: t.url, why: "it's longer than the channel's " + Math.round(maxS / 60) + " minutes" });
      return;
    }
    const p = { id: "url:" + hash32(t.url).toString(36), u: t.url, f: t.check.file, t: t.title, d: d };
    if (live) p.live = true;
    programs[i] = p;
  });
  return { items: programs.filter(Boolean), skipped: skipped };
}

// Archive programs and link programs in one rotation: spread through each other evenly, each list in its
// own order, so a channel with ten films and two links airs a link every five or six programs.
export function mixPrograms(a, b) {
  if (!a.length || !b.length) return a.concat(b);
  const out = [];
  const total = a.length + b.length;
  let ia = 0;
  let ib = 0;
  for (let k = 0; k < total; k++) {
    // Take from b when it has fallen behind its share.
    if (ib < b.length && (ia >= a.length || (ib + 0.5) / b.length <= (ia + 0.5) / a.length)) out.push(b[ib++]);
    else out.push(a[ia++]);
  }
  return out;
}

// The .json files in a zip, as text: [{ name, text }]. Folders are fine; macOS's __MACOSX copies and
// hidden files are left out. Throws an Error with a sentence for people when the zip can't be read.
export function packFilesFromZip(buf) {
  return readZip(buf, function (name) {
    return /\.json$/i.test(name) && !/(^|\/)(__MACOSX\/|\.)/.test(name);
  }).map(function (f) {
    return { name: f.name, text: utf8Text(f.data) };
  });
}

// A file's JSON as a pack: a skip-list file (cuts.js) becomes a pack of clean cuts only, named after the file.
export function asPack(json, fileName) {
  if (isPlainObject(json) && json.format === SKIP_FORMAT && json.pack == null) {
    const base = String(fileName || "Clean cuts")
      .split("/")
      .pop()
      .replace(/\.json$/i, "");
    return { pack: base || "Clean cuts", version: PACK_VERSION, skipLists: json };
  }
  return json;
}

// A pack's "skipLists": the whole skip-list file's shape, or just its lists.
function skipListFile(v) {
  return Array.isArray(v) ? { format: SKIP_FORMAT, lists: v } : v;
}

// A validated pack's clean cuts, ready to keep on this TV.
export function packSkipLists(pack) {
  return pack && pack.skipLists != null ? checkSkipLists(skipListFile(pack.skipLists)).lists : [];
}

// A parsed pack -> { ok, errors, warnings }. Errors block loading; warnings don't.
export function validatePack(pack) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(pack)) {
    return { ok: false, errors: ["A pack is one JSON object."], warnings: warnings };
  }
  if (typeof pack.pack !== "string" || !pack.pack.trim()) {
    errors.push("pack: give the pack a name.");
  } else if (pack.pack.length > 80) {
    warnings.push("pack: a name over 80 characters will be trimmed in the menu.");
  }
  if (pack.version !== PACK_VERSION) {
    errors.push("version: this app loads pack version " + PACK_VERSION + ".");
  }
  if (pack.skipLists != null) {
    const cuts = checkSkipLists(skipListFile(pack.skipLists));
    cuts.errors.forEach(function (e) {
      errors.push("skipLists: " + e);
    });
    cuts.warnings.forEach(function (w) {
      warnings.push("skipLists: " + w);
    });
    if (pack.channels == null) return { ok: errors.length === 0, errors: errors, warnings: warnings }; // clean cuts only
  }
  if (!Array.isArray(pack.channels) || !pack.channels.length) {
    errors.push("channels: a pack lists at least one channel.");
    return { ok: false, errors: errors, warnings: warnings };
  }
  if (pack.channels.length > MAX_CHANNELS) {
    errors.push("channels: at most " + MAX_CHANNELS + " channels per pack.");
  }
  const numbers = {};
  pack.channels.forEach(function (ch, i) {
    const where = "Channel " + (i + 1) + (ch && ch.name ? " (" + ch.name + ")" : "");
    if (!isPlainObject(ch)) {
      errors.push(where + ": a channel is an object.");
      return;
    }
    if (typeof ch.name !== "string" || !ch.name.trim()) {
      errors.push(where + ": give the channel a name.");
    } else if (ch.name.length > NAME_LIMIT) {
      warnings.push(where + ": a name over " + NAME_LIMIT + " characters will be trimmed to " + NAME_LIMIT + ".");
    }
    if (!packNumberOk(ch.number)) {
      errors.push(where + ": number must be a whole number from " + packRangesText() + " (the pack ranges; built-in channels stay under 99).");
    } else if (numbers[ch.number]) {
      errors.push(where + ": CH " + ch.number + " is used twice in this pack.");
    } else {
      numbers[ch.number] = 1;
    }
    if (ch.kind != null && ch.kind !== "video" && ch.kind !== "audio") {
      errors.push(where + ": kind is \"video\" or \"audio\".");
    }
    if (ch.tagline != null && typeof ch.tagline !== "string") {
      errors.push(where + ": tagline must be text.");
    }
    if (ch.icon != null && typeof ch.icon !== "string") {
      errors.push(where + ": icon must be text.");
    }
    if (ch.color != null && (typeof ch.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(ch.color))) {
      warnings.push(where + ": color should look like #ff9f1c.");
    }
    if (ch.minMinutes != null && (!isInt(ch.minMinutes) || ch.minMinutes < 0 || ch.minMinutes > 600)) {
      errors.push(where + ": minMinutes must be a whole number from 0 to 600.");
    }
    if (ch.maxMinutes != null && (!isInt(ch.maxMinutes) || ch.maxMinutes < 1 || ch.maxMinutes > 600)) {
      errors.push(where + ": maxMinutes must be a whole number from 1 to 600.");
    }
    if (ch.minMinutes != null && ch.maxMinutes != null && ch.maxMinutes <= ch.minMinutes) {
      errors.push(where + ": maxMinutes must be more than minMinutes.");
    }
    if (ch.maxItems != null && (!isInt(ch.maxItems) || ch.maxItems < 1 || ch.maxItems > 200)) {
      errors.push(where + ": maxItems must be a whole number from 1 to 200.");
    } else if (isInt(ch.maxItems) && ch.maxItems < 25) {
      warnings.push(where + ": maxItems under 25 caps the channel below 25 programs — a thin channel.");
    }
    if (ch.filesPerItem != null && (!isInt(ch.filesPerItem) || ch.filesPerItem < 1 || ch.filesPerItem > 20)) {
      errors.push(where + ": filesPerItem must be a whole number from 1 to 20.");
    }
    if (ch.exclude != null && (!Array.isArray(ch.exclude) || ch.exclude.some(function (w) { return typeof w !== "string"; }))) {
      errors.push(where + ": exclude must be a list of words.");
    }
    if (ch.maxYear != null && !isInt(ch.maxYear)) {
      errors.push(where + ": maxYear must be a whole year, or null.");
    }
    if (!Array.isArray(ch.sources) || !ch.sources.length) {
      errors.push(where + ": a channel lists at least one source.");
    } else if (ch.sources.length > MAX_SOURCES) {
      errors.push(where + ": at most " + MAX_SOURCES + " sources per channel.");
    } else {
      ch.sources.forEach(function (src, j) {
        checkSource(src, where + " source " + (j + 1), errors, warnings);
      });
    }
  });
  return { ok: errors.length === 0, errors: errors, warnings: warnings };
}

// A validated pack channel -> a channel definition the app can build, the same shape
// Menu ▸ Add a channel builds. Query sources stay as sources; item-ID sources move to items.
export function packChannelDef(packName, ch) {
  const kind = ch.kind === "audio" ? "audio" : "video";
  const def = {
    slug: "p-" + packSlug(packName) + "-" + ch.number,
    name: String(ch.name).slice(0, NAME_LIMIT),
    tagline: ch.tagline || "From a channel pack",
    icon: ch.icon || "📦",
    kind: kind,
    minMinutes: ch.minMinutes != null ? ch.minMinutes : kind === "audio" ? 5 : 2,
    maxMinutes: ch.maxMinutes || 240,
    maxItems: ch.maxItems || 50,
    filesPerItem: ch.filesPerItem || 8,
  };
  if (ch.color) def.color = ch.color;
  if (ch.exclude) def.exclude = ch.exclude;
  if (ch.maxYear !== undefined) def.maxYear = ch.maxYear;
  const querySources = [];
  const itemIds = [];
  const urls = [];
  ch.sources.forEach(function (src) {
    if (src.urls) {
      // An Archive item's page in urls is that item; the rest are links to files.
      src.urls.forEach(function (u) {
        const e = urlEntry(u);
        const c = e && linkCheck(e.url, kind);
        if (c && c.item) itemIds.push(c.item);
        else urls.push(u);
      });
    }
    if (src.q != null) {
      const s = { q: src.q };
      if (src.rows != null) s.rows = src.rows;
      if (src.sort != null) s.sort = src.sort;
      querySources.push(s);
    } else if (src.items) {
      src.items.forEach(function (id) {
        itemIds.push(id);
      });
    }
  });
  if (querySources.length) def.sources = querySources;
  if (itemIds.length) def.items = itemIds;
  if (urls.length) def.urls = urls;
  return def;
}

// Build a channel straight from Archive item IDs (the items form of a pack source).
// Mirrors the per-item filtering in buildChannel: lending-library items are skipped,
// ripped-commercial fingerprints and date limits apply, one program per file group.
// ctx: { fetchJson(url), exclude, excludeDescription, excludeFiles, maxYear, concurrency, log, progress }
export async function buildItemsChannel(ids, def, ctx) {
  const kind = def.kind === "audio" ? "audio" : "video";
  const minS = (def.minMinutes || 0) * 60;
  const maxS = (def.maxMinutes || 600) * 60;
  const perItem = def.filesPerItem || 1;
  const maxItems = def.maxItems || 50;
  const exclude = compileExclude((ctx.exclude || []).concat(def.exclude || []));
  const excludeDesc = compileExclude(ctx.excludeDescription || []);
  const excludeFiles = compileExclude(ctx.excludeFiles || []);
  const maxYear = def.maxYear !== undefined ? def.maxYear : ctx.maxYear;
  const log = ctx.log || function () {};
  const progress = ctx.progress || function () {};
  const groups = [];
  const about = {};
  let checked = 0;
  await mapLimit(ids, ctx.concurrency || 4, async function (id, i) {
    let meta;
    try {
      meta = await ctx.fetchJson(metadataUrl(id));
    } catch (e) {
      log("  ! " + id + ": " + e.message);
      return;
    } finally {
      progress(++checked, ids.length);
    }
    if (!meta || !meta.files || !meta.metadata) return;
    const md = meta.metadata;
    if (String(md["access-restricted-item"]) === "true") return;
    if (exclude && exclude.test(textOf(md))) return;
    if (
      excludeFiles &&
      meta.files.some(function (f) {
        return excludeFiles.test(f.name || "");
      })
    )
      return;
    const desc = cleanText(md.description);
    if (excludeDesc && excludeDesc.test(desc)) return;
    const year = contentYear(md);
    if (maxYear && year && year > maxYear) return;
    let progs = pickPrograms(meta, { kind: kind, minS: minS, maxS: maxS, exclude: exclude, maxYear: maxYear });
    if (perItem === 1 && progs.length > 1) {
      progs.sort(function (a, b) {
        return b.d - a.d;
      });
      progs = progs.slice(0, 1);
    } else if (progs.length > perItem) {
      progs = shuffle(progs, mulberry32(hash32(id))).slice(0, perItem);
    }
    if (perItem === 1) {
      progs.forEach(function (p) {
        delete p.e;
      });
    }
    if (progs.length && desc) about[md.identifier] = cleanText(desc, 170);
    groups[i] = progs;
  });
  // Round-robin across items so one big item can't fill the whole channel,
  // and the same program uploaded twice airs once.
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
  const rand = mulberry32(hash32(def.slug + "|items"));
  const items = spreadApart(shuffle(picked, rand), function (p) {
    return p.id;
  });
  const usedAbout = {};
  items.forEach(function (p) {
    if (about[p.id]) usedAbout[p.id] = about[p.id];
  });
  return { items: items, about: usedAbout };
}

// ---------- a pack list: browsing packs on the TV ----------
// A small JSON file, hosted anywhere outside this repo (personal packs never go in it), listing packs and
// where each file is. The TV fetches it, lists the packs, and loads the one picked the way a pasted pack
// loads. tools/build-pack-index.mjs writes one from a folder of packs.
//   { "format": "nostalgem-pack-index/1", "title": "…", "updated": "2026-11-14",
//     "packs": [{ "name": "…", "file": "packs/x.json" or a full https:// address, "channels": [{ "number": 46,
//                 "name": "…" }], "programs": 37, "about": "…", "by": "…" }] }
export const PACK_INDEX_FORMAT = "nostalgem-pack-index/1";
const INDEX_MAX = 300;

// The list's JSON -> { ok, title, updated, packs: [{ name, url, zip, channels, programs, about, by }], errors }.
// base: the list's own address (a file named relative to it is fetched from beside it). A pack whose file
// isn't a .json or .zip on https is left out, with the reason in errors.
export function parsePackIndex(json, base) {
  const errors = [];
  if (!isPlainObject(json) || json.format !== PACK_INDEX_FORMAT || !Array.isArray(json.packs)) {
    return { ok: false, title: "", updated: "", packs: [], errors: ["That isn't a NostalGem pack list (format " + PACK_INDEX_FORMAT + ")."] };
  }
  const text = function (v, n) {
    return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "";
  };
  let baseUrl = null;
  try {
    baseUrl = new URL(base);
  } catch (e) {
    baseUrl = null;
  }
  const packs = [];
  json.packs.slice(0, INDEX_MAX).forEach(function (p, i) {
    if (!isPlainObject(p)) return;
    const name = text(p.name, 80);
    const where = name || "Pack " + (i + 1);
    let url = null;
    try {
      url = baseUrl ? new URL(String(p.file || ""), baseUrl) : new URL(String(p.file || ""));
    } catch (e) {
      url = null;
    }
    // https, or the same kind of address as the list itself (a list on this computer, for trying one out).
    if (!url || !(url.protocol === "https:" || (baseUrl && url.protocol === baseUrl.protocol && url.host === baseUrl.host))) {
      errors.push(where + ": its file needs an https:// address.");
      return;
    }
    if (!/\.(json|zip)$/i.test(url.pathname)) {
      errors.push(where + ": its file should be a .json or a .zip.");
      return;
    }
    const channels = (Array.isArray(p.channels) ? p.channels : [])
      .filter(function (c) {
        return isPlainObject(c) && isInt(c.number);
      })
      .slice(0, MAX_CHANNELS * 10)
      .map(function (c) {
        return { number: c.number, name: text(c.name, NAME_LIMIT * 2) };
      });
    packs.push({
      name: name || decodeURIComponent(url.pathname.split("/").pop()),
      url: url.href,
      zip: /\.zip$/i.test(url.pathname),
      channels: channels,
      programs: isInt(p.programs) && p.programs >= 0 ? p.programs : 0,
      about: text(p.about, 300),
      by: text(p.by, 60),
    });
  });
  return { ok: true, title: text(json.title, 60) || "Pack list", updated: text(json.updated, 20), packs: packs, errors: errors };
}

// A pack's line in the list: "CH 46, 47 · 37 programs".
export function packIndexLine(p) {
  const nums = p.channels.map(function (c) {
    return c.number;
  });
  const ch = nums.length ? "CH " + (nums.length > 4 ? nums.slice(0, 4).join(", ") + "…" : nums.join(", ")) : "";
  const progs = p.programs ? p.programs + (p.programs === 1 ? " program" : " programs") : "";
  return [ch, progs].filter(Boolean).join(" · ");
}
