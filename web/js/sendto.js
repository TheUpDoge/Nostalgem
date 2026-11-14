// Send to TV: what a phone may send for the TV to play, and how the TV reads an Archive item it was sent.
// Shared by the phone (remote.html: is this something the TV can play?) and the TV (what to do with it).
//
//   a YouTube video     youtube.com/watch?v=…  youtu.be/…  /shorts/…  /live/…  /embed/…   (t= or start=: where to begin)
//   a YouTube playlist  youtube.com/playlist?list=…, or a video's link with list= (the video, then the rest)
//   an Archive item     archive.org/details/<id>  /download/<id>[/<file>]  /embed/<id>   (every part, in order)
//   an Archive search   archive.org/search?query=…   (a channel's worth, not a program: the phone offers a channel)
//
// Text around the link is fine: a phone's Share sheet sends a title and then the address.

import { pickPrograms, cleanText, textOf, compileExclude } from "./archive.js";

export const SENT_MAX = 600; // characters of link a phone may send
export const QUEUE_MAX = 60; // parts of one item, or videos of one playlist, lined up at once

// A link to one of the sites, wherever it sits in the text. The host has to start at a boundary, so
// notyoutube.com and my-archive.org aren't taken for the real ones. (No lookbehind: older iPhones can't read one.)
const LINK = /(^|[^\w.-])((?:https?:\/\/)?(?:[\w-]+\.)*(?:youtube\.com|youtube-nocookie\.com|youtu\.be|archive\.org)\/[^\s<>"'`]*)/gi;
const VIDEO_ID = /^[\w-]{6,20}$/; // what youtube.js plays (YouTube's own are 11 long)
// Playlists a player can be handed: a viewer's (PL), a channel's uploads (UU) or favorites (FL), an album
// (OLAK5uy_), a YouTube Music list (RDCLAK5uy_). Not Watch later or Liked (WL, LL: private), nor a mix
// (RD…: made up for whoever is signed in).
const LIST_ID = /^(PL|UU|FL|OLAK5uy_|RDCLAK5uy_)[\w-]{8,60}$/;
const ARCHIVE_ID = /^[\w.-]{1,100}$/;

// "90", "90s", "1m30s", "1h2m3s" → seconds.
export function linkSeconds(v) {
  const t = String(v == null ? "" : v).trim().toLowerCase();
  if (/^\d{1,6}$/.test(t)) return Number(t);
  const m = /^(?:(\d{1,3})h)?(?:(\d{1,4})m)?(?:(\d{1,6})s)?$/.exec(t);
  if (!m || !t) return 0;
  return (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
}

function decode(p) {
  try {
    return decodeURIComponent(p);
  } catch (e) {
    return p;
  }
}

function parseUrl(raw) {
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
  } catch (e) {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean).map(decode);
  const q = url.searchParams;
  if (host === "youtu.be" || /(^|\.)youtube(-nocookie)?\.com$/.test(host)) {
    let id = "";
    if (host === "youtu.be") id = parts[0] || "";
    else if (parts[0] === "watch") id = q.get("v") || "";
    else if (["shorts", "live", "embed", "v"].indexOf(parts[0]) >= 0) id = parts[1] || "";
    if (!VIDEO_ID.test(id) || id === "videoseries") id = "";
    const list = LIST_ID.test(q.get("list") || "") ? q.get("list") : "";
    if (!id && !list) return null;
    const out = { kind: id ? "youtube" : "ytlist" };
    if (id) out.id = id;
    if (list) out.list = list;
    const at = linkSeconds(q.get("t") || q.get("start"));
    if (id && at > 0) out.at = at;
    return out;
  }
  // The Archive's own pages only: web.archive.org is the Wayback Machine, and the numbered hosts are file servers.
  if (host === "archive.org" || host === "www.archive.org") {
    if (["details", "download", "embed"].indexOf(parts[0]) >= 0 && ARCHIVE_ID.test(parts[1] || "")) {
      const out = { kind: "archive", id: parts[1] };
      const file = parts.slice(2).join("/");
      if (/\.[a-z0-9]{2,5}$/i.test(file) && file.length < 300) out.file = file;
      const at = linkSeconds(q.get("start"));
      if (at > 0) out.at = at;
      return out;
    }
    const query = (q.get("query") || "").replace(/\s+/g, " ").trim();
    if (/^search(\.php)?$/.test(parts[0] || "") && query) return { kind: "search", query: query.slice(0, 200) };
  }
  return null;
}

// The first link in the text that the TV could play: { kind: "youtube", id, list?, at? } | { kind: "ytlist",
// list } | { kind: "archive", id, file?, at? } | { kind: "search", query }, or null.
export function parseSent(text) {
  const t = String(text == null ? "" : text).slice(0, 4000);
  LINK.lastIndex = 0;
  for (let m = LINK.exec(t); m; m = LINK.exec(t)) {
    const p = parseUrl(m[2].replace(/[).,;:!?\]]+$/, ""));
    if (p) return p;
  }
  return null;
}

function encPath(file) {
  return String(file).split("/").map(encodeURIComponent).join("/");
}

// The link in one tidy form: what the phone sends, and what the TV reads back.
export function sentUrl(p) {
  if (!p) return "";
  if (p.kind === "youtube") return "https://www.youtube.com/watch?v=" + p.id + (p.list ? "&list=" + p.list : "") + (p.at ? "&t=" + p.at + "s" : "");
  if (p.kind === "ytlist") return "https://www.youtube.com/playlist?list=" + p.list;
  if (p.kind === "archive") return "https://archive.org/" + (p.file ? "download/" + encodeURIComponent(p.id) + "/" + encPath(p.file) : "details/" + encodeURIComponent(p.id)) + (p.at ? "?start=" + p.at : "");
  if (p.kind === "search") return "https://archive.org/search?query=" + encodeURIComponent(p.query);
  return "";
}

// In a few words, for the phone: what kind of link this is.
export function sentLabel(p) {
  if (!p) return "";
  if (p.kind === "youtube") return p.list ? "a YouTube video, then the rest of its playlist" : "a YouTube video";
  if (p.kind === "ytlist") return "a YouTube playlist";
  if (p.kind === "archive") return "archive.org: " + p.id;
  return "an archive.org search";
}

// The link a phone's Share sheet handed over (remote.webmanifest share_target: ?title=…&text=…&url=…).
export function sharedLink(search) {
  let q;
  try {
    q = new URLSearchParams(String(search || ""));
  } catch (e) {
    return null;
  }
  return parseSent(q.get("url")) || parseSent(q.get("text")) || parseSent(q.get("title"));
}

// ---------- the adult filter ----------
// The sexual words of the lineup's leave-out lists (web/data/channels.json "exclude" and
// "excludeDescription"; tests/sendto.test.mjs checks every word here is on them), so a sent link is held to
// the same line as Search the Archive. A title or a subject is checked against the long list, a description
// against the short one (a description says "regardless of sex" without being about it). Nothing else from
// those lists applies to a link somebody chose to send: not the year cap, not trailers, not rips.
export const ADULT_TITLE = [
  "sex", "sexy", "sexual", "sexploitation", "nude", "nudes", "nudist", "nudity", "nudie", "erotic", "erotica", "porn", "porno", "pornographic", "xxx",
  "adults only", "hentai", "nsfw", "fetish", "striptease", "stripper", "strip tease", "burlesque", "bares", "molester", "lingerie", "playboy", "perversion for profit",
];
export const ADULT_DESCRIPTION = ["nudity", "xxx", "porn", "sexploitation", "nsfw", "explicit", "softcore", "full frontal"];
const adultTitle = compileExclude(ADULT_TITLE);
const adultDescription = compileExclude(ADULT_DESCRIPTION);

// title: an item's identifier, title and subjects (archive.js textOf); description: its description, cleaned.
export function isAdult(title, description) {
  return adultTitle.test(String(title || "")) || adultDescription.test(String(description || ""));
}

// ---------- an Archive item the TV was sent ----------
function one(v) {
  return Array.isArray(v) ? v[0] : v;
}
function bare(name) {
  return String(name || "").replace(/\.[a-z0-9]{2,5}$/i, "").toLowerCase();
}

// What the TV does with it: { kind, programs, start, about } to play (every part in order, from the file the
// link named), or { why } when it can't: "notfound" (no such item), "collection" (a channel's worth),
// "lending" (the Archive keeps it for signed-in members), "adult", "nofile" (nothing a TV plays: no MP4, no MP3).
export function archivePlan(meta, file) {
  const md = meta && meta.metadata;
  if (!md || !md.identifier || !Array.isArray(meta.files)) return { why: "notfound" };
  const type = String(one(md.mediatype) || "");
  if (type === "collection") return { why: "collection" };
  if (String(md["access-restricted-item"]) === "true") return { why: "lending" };
  const desc = cleanText(md.description);
  if (isAdult(textOf(md), desc)) return { why: "adult" };
  let kind = type === "audio" || type === "etree" ? "audio" : "video";
  let programs = pickPrograms(meta, { kind: kind });
  if (!programs.length) {
    kind = kind === "audio" ? "video" : "audio";
    programs = pickPrograms(meta, { kind: kind });
  }
  if (!programs.length) return { why: "nofile" };
  let start = 0;
  if (file) {
    // The file the link named, or the playable copy made from it (film.avi → film.mp4).
    const want = bare(file.split("/").pop()).replace(/(_512kb|\.ia)$/i, "");
    for (let i = 0; i < programs.length; i++) {
      if (programs[i].f === file || bare(programs[i].f.split("/").pop()).replace(/(_512kb|\.ia)$/i, "") === want) {
        start = i;
        break;
      }
    }
  }
  if (programs.length > QUEUE_MAX) {
    const from = Math.min(start, programs.length - QUEUE_MAX);
    programs = programs.slice(from, from + QUEUE_MAX);
    start -= from;
  }
  return { kind: kind, programs: programs, start: start, about: cleanText(desc, 170) };
}

// Why a sent link can't play, in words for the phone and the TV.
export function whyNot(why) {
  switch (why) {
    case "notfound":
      return "The Archive has nothing at that address.";
    case "collection":
      return "That's a whole collection: a channel's worth. Make a channel of it with 📡 New TV channel or 📻 New radio channel.";
    case "search":
      return "That's a search: a channel's worth. Make a channel of it with 📡 New TV channel or 📻 New radio channel.";
    case "lending":
      return "The Archive only plays that one for a signed-in member, so it can't play here.";
    case "adult":
      return "That one's on the TV's leave-out list (adult material).";
    case "nofile":
      return "Nothing in that item plays on a TV: it has no MP4 video and no MP3.";
    case "playlist":
      return "YouTube wouldn't hand over that playlist. Send one of its videos instead.";
    case "nochannel":
      return "The TV has no channel to come back to. Unhide a channel first.";
    default:
      return "The TV couldn't play that.";
  }
}
