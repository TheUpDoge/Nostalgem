#!/usr/bin/env node
// Checks candidate YouTube channels for NostalGem: does the channel exist, and how many of its uploads
// are episode-length videos that can air (public, embeddable, not age-restricted, not blocked in the US)?
//
//   YOUTUBE_API_KEY=… node tools/yt-probe.mjs @GundamInfo @SomeChannel UCxxxx…  [--min 18] [--scan 500]
//   … ?Cleetus_McFarland        search channels by name (underscores for spaces) and list the top matches
//   … --live @exploreorg        list what each channel is streaming live right now
//   … --match "junji ito|uzumaki"  only count uploads whose title matches (case-insensitive)
//
// Prints a table and, on GitHub Actions, writes it to the job summary.

import { appendFile, readFile } from "node:fs/promises";
import { makeYouTubeFetch, rejectReason, parseIsoDuration, cleanYtTitle, liveVideoIds, filterText } from "./youtube.mjs";
import { compileExclude } from "../web/js/archive.js";

// The same word filter the lineup builder applies to titles and descriptions, with each source's "allow".
const config = JSON.parse(await readFile(new URL("../web/data/channels.json", import.meta.url), "utf8"));
const wordFilter = compileExclude(config.exclude || []);
const allowFor = {};
(config.channels || []).forEach(function (c) {
  (c.youtube || []).forEach(function (s) {
    if (s.handle && s.allow) allowFor[s.handle.toLowerCase()] = new RegExp(s.allow, "gi");
  });
});

const args = process.argv.slice(2);
const opt = (name, d) => {
  const i = args.indexOf("--" + name);
  if (i < 0) return d;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const liveMode = args.indexOf("--live") >= 0;
if (liveMode) args.splice(args.indexOf("--live"), 1);
const minMin = Number(opt("min", "18"));
const matchText = opt("match", "");
const match = matchText ? new RegExp(matchText, "i") : null;
const scan = Number(opt("scan", "500"));
const targets = args.join(" ").split(/[\s,]+/).filter(Boolean);
const yt = makeYouTubeFetch(process.env.YOUTUBE_API_KEY || "");

const rows = [];
const details = [];
for (const t of targets) {
  if (t.startsWith("?")) {
    // Find a channel by name: 100 quota units.
    const q = t.slice(1).replace(/_/g, " ");
    const found = await yt("search", { part: "snippet", q: q, type: "channel", maxResults: "4" });
    const ids = (found.items || []).map((it) => it.snippet.channelId);
    const chans = ids.length ? (await yt("channels", { part: "snippet,statistics", id: ids.join(",") })).items || [] : [];
    for (const c of chans) rows.push({ handle: c.snippet.customUrl || c.id, channel: c.snippet.title.slice(0, 32), country: c.snippet.country || "", videos: Number(c.statistics.videoCount), scanned: "search: " + q });
    if (!chans.length) rows.push({ handle: t, channel: "(no search results)" });
    continue;
  }
  if (liveMode) {
    let ids = [];
    try {
      ids = await liveVideoIds(/^UC[\w-]{22}$/.test(t) ? { channelId: t } : { handle: t }, yt);
    } catch (e) {
      if (e.fatal && /API key|quota/i.test(e.message)) throw e;
      rows.push({ handle: t, channel: "(" + e.message.slice(0, 40) + ")" });
      continue;
    }
    const vids = ids.length ? (await yt("videos", { part: "snippet,contentDetails,status", id: ids.join(",") })).items || [] : [];
    const ok = vids.filter((v) => !rejectReason(v, { live: true }));
    const reasons = {};
    for (const v of vids) {
      const why = rejectReason(v, { live: true });
      if (why) reasons[why] = (reasons[why] || 0) + 1;
    }
    rows.push({ handle: t, channel: (vids[0] && vids[0].snippet.channelTitle.slice(0, 32)) || "", videos: ids.length, airable: ok.length, noEmbed: reasons["embedding off"] || 0, blockedUS: (reasons["blocked in US"] || 0) + (reasons["not available in US"] || 0), ageGate: reasons["age-restricted"] || 0 });
    details.push(`### ${t} — live now\n` + ok.map((v) => `- ${cleanYtTitle(v.snippet.title)} (${v.id})`).join("\n"));
    continue;
  }
  const params = { part: "snippet,contentDetails,statistics" };
  if (/^UC[\w-]{22}$/.test(t)) params.id = t;
  else params.forHandle = t.startsWith("@") ? t : "@" + t;
  let ch;
  try {
    ch = ((await yt("channels", params)).items || [])[0];
  } catch (e) {
    console.error(t + ": " + e.message);
    if (e.fatal) process.exit(1);
    continue;
  }
  if (!ch) {
    rows.push({ handle: t, channel: "(not found)" });
    continue;
  }
  const uploads = ch.contentDetails.relatedPlaylists.uploads;
  const ids = [];
  let page = "";
  try {
    while (ids.length < scan) {
      const p = { part: "contentDetails", playlistId: uploads, maxResults: "50" };
      if (page) p.pageToken = page;
      const j = await yt("playlistItems", p);
      for (const it of j.items || []) ids.push(it.contentDetails.videoId);
      page = j.nextPageToken;
      if (!page) break;
    }
  } catch (e) {
    if (/API key|quota|keyInvalid|unregistered/i.test(e.message)) throw e;
    rows.push({ handle: t, channel: ch.snippet.title.slice(0, 32), videos: Number(ch.statistics.videoCount), scanned: 0, airable: 0 });
    continue;
  }
  const reasons = {};
  const good = [];
  for (let i = 0; i < ids.length; i += 50) {
    const j = await yt("videos", { part: "snippet,contentDetails,status", id: ids.slice(i, i + 50).join(",") });
    for (const v of j.items || []) {
      if (match && !match.test(v.snippet.title)) continue;
      let why = rejectReason(v, { minS: minMin * 60, maxS: 24 * 3600 });
      const text = filterText(v, allowFor[t.toLowerCase()]);
      const hit = !why && wordFilter && text.match(wordFilter);
      if (hit) why = "word filter: " + hit[0].trim();
      if (match) {
        // Looking for something specific: say what happened to each match.
        const d = parseIsoDuration(v.contentDetails.duration);
        console.log(`  ${t} ${v.id} ${Math.round(d / 60)}m ${v.snippet.liveBroadcastContent} → ${why || "OK"} | ${v.snippet.title}`);
      }
      if (why) reasons[why] = (reasons[why] || 0) + 1;
      else good.push({ t: cleanYtTitle(v.snippet.title), d: parseIsoDuration(v.contentDetails.duration) });
    }
  }
  const hours = good.reduce((s, g) => s + g.d, 0) / 3600;
  rows.push({
    handle: t,
    channel: ch.snippet.title.slice(0, 32),
    country: ch.snippet.country || "",
    videos: Number(ch.statistics.videoCount),
    scanned: ids.length,
    airable: good.length,
    hours: +hours.toFixed(1),
    blockedUS: (reasons["blocked in US"] || 0) + (reasons["not available in US"] || 0),
    noEmbed: reasons["embedding off"] || 0,
    ageGate: reasons["age-restricted"] || 0,
    short: reasons["too short"] || 0,
  });
  details.push(`### ${t} — ${ch.snippet.title} (id ${ch.id})\n` + good.slice(0, 12).map((g) => `- ${g.t} (${Math.round(g.d / 60)} min)`).join("\n"));
}
console.table(rows);
for (const d of details) console.log("\n" + d);
if (process.env.GITHUB_STEP_SUMMARY) {
  const cols = ["handle", "channel", "country", "videos", "scanned", "airable", "hours", "blockedUS", "noEmbed", "ageGate", "short"];
  let md = `## YouTube probe (episodes ≥ ${minMin} min, US)\n\n| ${cols.join(" | ")} |\n|${cols.map(() => "---").join("|")}|\n`;
  for (const r of rows) md += "| " + cols.map((c) => (r[c] == null ? "" : String(r[c]))).join(" | ") + " |\n";
  await appendFile(process.env.GITHUB_STEP_SUMMARY, md + "\n" + details.join("\n\n") + "\n");
}
