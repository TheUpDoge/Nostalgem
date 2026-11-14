// Channel packs: small JSON files that add channels from the Internet Archive.
// A pack never touches the shipped lineup — its channels load through the same
// viewer-added path as Menu ▸ Add a channel, saved on this TV only. Pack channels take
// CH 30–49, the hundreds 100–199, or 200–299 (dial.js): every built-in channel stays under 99.
// Packs point at the Archive and nothing else: a collection search, or Archive item
// IDs. No YouTube, no other sites, no direct video links.
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
    errors.push(where + ": a source is an object with q or items.");
    return;
  }
  if (src.url != null || src.youtube != null || src.handle != null || src.playlist != null) {
    errors.push(where + ": packs point at the Archive by query or item id, not by URL or YouTube.");
    return;
  }
  const hasQ = src.q != null;
  const hasItems = src.items != null;
  if (hasQ && hasItems) {
    errors.push(where + ": use q or items, not both.");
    return;
  }
  if (!hasQ && !hasItems) {
    errors.push(where + ": a source needs q (an Archive search) or items (Archive item IDs).");
    return;
  }
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
  ch.sources.forEach(function (src) {
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
