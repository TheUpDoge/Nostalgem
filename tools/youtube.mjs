// YouTube Data API v3 client for the lineup builder. Turns official channels and playlists into programs:
//
//   "youtube": [
//     { "handle": "@GundamInfo", "match": "episode|ep\\.? ?\\d", "exclude": "trailer|teaser|pv", "order": "oldest" },
//     { "playlist": "PLxxxxxxxx", "order": "playlist" },
//     { "channelId": "UCxxxxxxxx" }
//   ]
//
// A source with "live": true airs what the channel is broadcasting live right now, each stream as a
// block of "blockMinutes" (default 20); "videos": [ids] names streams directly. Live channels rebuild daily.
// "every": N spreads a source's programs through the channel, one after every N of the others.
// "allow": a pattern of phrases the word filter lets through for that source (an official channel's own
// "Full Series" watch party, say); the rest of its title and description is still checked.
// order: "shuffle" (default), "oldest", "playlist", or "title" (series, then episode number).
// Every video is checked before it goes on the air: public, embeddable, not age-restricted, not blocked
// in the region (US unless "region" says otherwise), not live or upcoming, and long enough not to be a
// Short. A source's videos air in order ("playlist" order, or "oldest" upload first) or shuffled; several
// sources take turns, like shows in a block.
//
// The key: YOUTUBE_API_KEY in the environment (GitHub Actions secret), sent as X-Goog-Api-Key. In a
// session whose network adds the key itself, it can be left unset.

import { cleanText, compileExclude } from "../web/js/archive.js";
import { hash32, mulberry32, shuffle } from "../web/js/util.js";
import { packRegion } from "../web/js/regions.js";

const API = "https://www.googleapis.com/youtube/v3/";

export function parseIsoDuration(s) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(String(s || ""));
  if (!m) return 0;
  return Math.round((+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0));
}

// Why a video can't air, or "" when it can.
export function rejectReason(v, opts) {
  const o = opts || {};
  const region = o.region || "US";
  if (!v || !v.id) return "missing";
  const st = v.status || {};
  const cd = v.contentDetails || {};
  const sn = v.snippet || {};
  if (st.privacyStatus && st.privacyStatus !== "public") return "not public";
  if (!o.live && st.uploadStatus && st.uploadStatus !== "processed") return "still processing";
  if (st.embeddable === false) return "embedding off";
  if (st.madeForKids && o.allowKids === false) return "made for kids";
  if (o.live) {
    if (sn.liveBroadcastContent !== "live") return "not live now";
  } else if (sn.liveBroadcastContent && sn.liveBroadcastContent !== "none") return "live or upcoming";
  if (cd.contentRating && cd.contentRating.ytRating === "ytAgeRestricted") return "age-restricted";
  const rr = cd.regionRestriction;
  if (rr) {
    if (rr.blocked && rr.blocked.indexOf(region) >= 0) return "blocked in " + region;
    if (rr.allowed && rr.allowed.indexOf(region) < 0) return "not available in " + region;
  }
  if (o.live) return "";
  const d = parseIsoDuration(cd.duration);
  if (!d) return "no duration";
  if (d < (o.minS || 0)) return "too short";
  if (o.maxS && d > o.maxS) return "too long";
  return "";
}

// "【Official】Mobile Suit Gundam Wing Ep. 1 | Full Episode (English Dub) [HD]" -> "Mobile Suit Gundam Wing Ep. 1"
const TAG_WORDS = /\b(live|24\/7|official|full episodes?|full movie|english|eng|(w\/ ?)?sub(bed|titled|titles|s)?|dub(bed)?|hd|4k|1080p|720p|remaster(ed)?|free|anime|uncut|premiere|simulcast|cc|limited time)\b/i;
// channel: the uploader's name, dropped where it's tacked on as a piece of the title ("… | Throwback Toons").
export function cleanYtTitle(t, channel) {
  let s = String(t || "");
  s = s.replace(/[【\[(（]([^】\])）]{0,40})[】\])）]/g, function (all, inner) {
    return TAG_WORDS.test(inner) ? " " : all;
  });
  s = s.replace(/^[\s🔴⏺●•]*((live|24\/7)\b[\s!]*)+[:|–-]\s*/i, "").replace(/^🔴\s*/, "");
  s = s.replace(/\s*[|｜]\s*(full episodes?|official|english (sub|dub)\w*|free anime|watch free)\b.*$/i, "");
  s = s.replace(/\s+[-–]\s+((updated )?full episodes?|official (video|upload))\s*$/i, "");
  // Channel branding: "Featured: …", "… -Official-", "… FULL EPISODE", and pipe-separated pieces like
  // "He-Man Official | <title> | She-Ra Full Episodes | Cartoons for kids" or "| Ultra Series 60th Anniversary".
  s = s.replace(/^featured:\s*/i, "");
  s = s.replace(/\s*[-–]\s*official\s*[-–]?\s*$/i, "").replace(/\s+full episode\s*$/i, "");
  // Some channels separate the pieces with emoji instead ("He-Man Official ❄️Song of Celice ❄️He-Man Full Episode").
  if (/\b(official|full episodes?|for kids)\b/i.test(s)) s = s.replace(/\s*(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\uFE0F|\u200D)+\s*/gu, " | ");
  s = dropBranding(s, channel);
  return s.replace(/\s+/g, " ").replace(/^[\s|:–-]+|[\s|:–-]+$/g, "").trim();
}

function initials(text) {
  return text
    .split(/[^A-Za-z]+/)
    .filter(Boolean)
    .map(function (w) {
      return w.charAt(0).toUpperCase();
    })
    .join("");
}

const BRANDING = /\b(official|anniversary|full episodes?|for kids|retro cartoons?|kids cartoons?|cartoon universe)\b|^(hd|4k|1080p|720p|remastered)$/i;
// "He-Man Official | The Rarest Gift of All | He-Man Full Episodes" → "He-Man: The Rarest Gift of All".
function dropBranding(s, channel) {
  const own = String(channel || "").toLowerCase().trim();
  const parts = s.split(/\s*[|｜]\s*/);
  if (parts.length < 2) return s;
  while (parts.length > 1 && /\bofficial$/i.test(parts[0].trim()) && parts[0].length <= 40) parts.shift();
  const kept = [parts[0]];
  let show = "";
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i].trim();
    // "He-Man Full Episode", "She-Ra Episodes": which show it is, not part of the title.
    const m = /^(.{2,30}?)\s+(full\s+)?episodes?$/i.exec(part) || /^(.{2,30}?)\s+full episodes?\b/i.exec(part);
    if (m && !show) show = m[1];
    if (m || !part || BRANDING.test(part) || (own && part.toLowerCase() === own)) continue;
    // The show's initials at the very end: "Teenage Mutant Ninja Turtles (1987) … MARATHON! | TMNT".
    if (i === parts.length - 1 && /^[A-Z]{2,6}$/.test(part) && initials(kept[0]).indexOf(part) >= 0) continue;
    kept.push(part);
  }
  const out = kept.join(" | ");
  return show && out.toLowerCase().indexOf(show.toLowerCase()) < 0 ? show + ": " + out : out;
}

export function toProgram(v) {
  const sn = v.snippet || {};
  const p = { id: "yt:" + v.id, f: "yt", t: cleanYtTitle(sn.title, sn.channelTitle) || sn.title || v.id, d: parseIsoDuration(v.contentDetails.duration) };
  // Where it can't play (web/js/regions.js), so a TV abroad can leave it out of the schedule.
  const r = packRegion(v.contentDetails.regionRestriction);
  if (r) p.r = r;
  return p;
}

function regex(src) {
  return src ? new RegExp(src, "i") : null;
}

// What the word filter reads: the title and the start of the description, minus any phrases the source
// "allow"s. The filter's piracy words ("full series") also turn up in an official channel's own titles.
export function filterText(v, allow) {
  const sn = v.snippet || {};
  const text = (sn.title || "") + " " + (sn.description || "").slice(0, 400);
  return allow ? text.replace(allow, " ") : text;
}

export function makeYouTubeFetch(key) {
  return async function ytFetch(path, params) {
    const url = API + path + "?" + new URLSearchParams(params).toString();
    let last;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(url, { headers: key ? { "x-goog-api-key": key } : {} });
        if (res.status === 403 || res.status === 400 || res.status === 404) {
          const body = await res.text();
          throw Object.assign(new Error("YouTube API " + res.status + ": " + body.slice(0, 300)), { fatal: true });
        }
        if (!res.ok) throw new Error("YouTube API HTTP " + res.status);
        return await res.json();
      } catch (e) {
        last = e;
        if (e.fatal) break;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
    throw last;
  };
}

async function uploadsPlaylist(src, yt) {
  if (src.playlist) return src.playlist;
  const params = { part: "contentDetails" };
  if (src.channelId) params.id = src.channelId;
  else if (src.handle) params.forHandle = src.handle.charAt(0) === "@" ? src.handle : "@" + src.handle;
  else throw new Error("a youtube source needs handle, channelId or playlist");
  const json = await yt("channels", params);
  const ch = json.items && json.items[0];
  if (!ch) throw new Error("no YouTube channel " + (src.handle || src.channelId));
  return ch.contentDetails.relatedPlaylists.uploads;
}

// What a channel is broadcasting live right now (a search costs 100 of the 10,000 daily quota units).
export async function liveVideoIds(src, yt) {
  if (src.videos) return src.videos.slice();
  let channelId = src.channelId;
  if (!channelId) {
    const json = await yt("channels", { part: "id", forHandle: src.handle.charAt(0) === "@" ? src.handle : "@" + src.handle });
    const ch = json.items && json.items[0];
    if (!ch) throw new Error("no YouTube channel " + src.handle);
    channelId = ch.id;
  }
  const json = await yt("search", { part: "id", channelId: channelId, eventType: "live", type: "video", maxResults: "25" });
  return (json.items || [])
    .map(function (it) {
      return it.id && it.id.videoId;
    })
    .filter(Boolean);
}

async function playlistVideoIds(playlistId, max, yt) {
  const ids = [];
  let pageToken = "";
  while (ids.length < max) {
    const params = { part: "contentDetails", playlistId: playlistId, maxResults: "50" };
    if (pageToken) params.pageToken = pageToken;
    const json = await yt("playlistItems", params);
    (json.items || []).forEach(function (it) {
      if (it.contentDetails && it.contentDetails.videoId) ids.push(it.contentDetails.videoId);
    });
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  return ids.slice(0, max);
}

async function videoDetails(ids, yt) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const json = await yt("videos", { part: "snippet,contentDetails,status", id: ids.slice(i, i + 50).join(","), maxResults: "50" });
    out.push.apply(out, json.items || []);
  }
  const byId = {};
  out.forEach(function (v) {
    byId[v.id] = v;
  });
  return ids
    .map(function (id) {
      return byId[id];
    })
    .filter(Boolean);
}

// A channel definition with "youtube" sources -> { items, about, searched, rejected }.
// ctx: { yt (from makeYouTubeFetch), exclude: [...words], seed, log }
export async function buildYouTubeChannel(def, ctx) {
  const yt = ctx.yt;
  const log = ctx.log || function () {};
  const minS = (def.minMinutes != null ? def.minMinutes : 4) * 60;
  const maxS = (def.maxMinutes || 240) * 60;
  const maxItems = def.maxItems || 120;
  const exclude = compileExclude((ctx.exclude || []).concat(def.exclude || []));
  const rand = mulberry32(hash32(def.slug + "|" + (ctx.seed || "")));
  const about = {};
  const rejected = {};
  const lists = [];
  const spread = []; // sources with "every": their programs go between the others'
  let spreadEvery = 0;
  let searched = 0;
  const seen = {};
  const seenTitle = {}; // the same episode uploaded twice (an "HD" re-upload, say) airs once
  for (const src of def.youtube) {
    let ids;
    try {
      if (src.live) ids = await liveVideoIds(src, yt);
      else {
        const pl = await uploadsPlaylist(src, yt);
        ids = await playlistVideoIds(pl, src.maxScan || 300, yt);
      }
    } catch (e) {
      log("  ! " + (src.handle || src.channelId || src.playlist) + ": " + e.message);
      if (e.fatal && /API key|quota|forbidden|keyInvalid|accessNotConfigured/i.test(e.message)) throw e;
      continue;
    }
    searched += ids.length;
    const videos = await videoDetails(ids, yt);
    const match = regex(src.match);
    const skip = regex(src.exclude);
    const allow = src.allow ? new RegExp(src.allow, "gi") : null;
    const list = [];
    for (const v of videos) {
      if (seen[v.id]) continue;
      seen[v.id] = 1;
      const why = rejectReason(v, {
        minS: src.minMinutes != null ? src.minMinutes * 60 : minS,
        maxS: src.maxMinutes != null ? src.maxMinutes * 60 : maxS,
        region: def.region,
        live: !!src.live,
      });
      const title = (v.snippet && v.snippet.title) || "";
      const reason = why || (match && !match.test(title) ? "no match" : "") || (skip && skip.test(title) ? "excluded" : "") || (exclude && exclude.test(filterText(v, allow)) ? "filtered" : "");
      if (reason) {
        rejected[reason] = (rejected[reason] || 0) + 1;
        continue;
      }
      const p = toProgram(v);
      const titleKey = p.t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (!src.live && seenTitle[titleKey]) {
        rejected["same title"] = (rejected["same title"] || 0) + 1;
        continue;
      }
      seenTitle[titleKey] = 1;
      if (src.live) {
        // A live stream airs as a block of the schedule, like a stop on a cam tour.
        p.d = (def.blockMinutes || 20) * 60;
        p.live = 1;
      }
      list.push(p);
      const desc = def.about === false ? "" : cleanText(v.snippet.description || "", 170);
      if (desc) about[p.id] = desc;
    }
    // Uploads come newest first. "oldest" airs a series from episode 1; "playlist" keeps the playlist's own order.
    const order = src.order || "shuffle";
    if (order === "oldest" && !src.playlist) list.reverse();
    // "title": by series, then episode number ("Gundam SEED - Episode 2" before "Episode 10").
    if (order === "title")
      list.sort(function (a, b) {
        return a.t.localeCompare(b.t, "en", { numeric: true, sensitivity: "base" });
      });
    const ordered = order === "shuffle" ? shuffle(list, rand) : list;
    if (src.every > 0) {
      spread.push(ordered);
      spreadEvery = spreadEvery ? Math.min(spreadEvery, src.every) : src.every;
    } else lists.push(ordered);
  }
  // Sources take turns, a program each, like shows in a block.
  const takeTurns = function (ls, max) {
    const out = [];
    for (let round = 0; out.length < max; round++) {
      let any = false;
      for (const l of ls) {
        if (round < l.length && out.length < max) {
          out.push(l[round]);
          any = true;
        }
      }
      if (!any) break;
    }
    return out;
  };
  let items = takeTurns(lists, maxItems);
  // "every": N puts one of that source's programs after every N of the others, repeating them as
  // needed (live news between documentaries), so a source with two live streams isn't heard once a week.
  const between = takeTurns(spread, Infinity);
  if (between.length) {
    if (!items.length) items = between;
    else {
      const mixed = [];
      let k = 0;
      items.forEach(function (p, i) {
        mixed.push(p);
        if ((i + 1) % spreadEvery === 0) mixed.push(between[k++ % between.length]);
      });
      items = mixed;
    }
  }
  const used = {};
  items.forEach(function (p) {
    if (about[p.id]) used[p.id] = about[p.id];
  });
  return { items: items, about: used, searched: searched, rejected: rejected };
}
