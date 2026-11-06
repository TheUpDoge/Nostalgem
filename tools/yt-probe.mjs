#!/usr/bin/env node
// Checks candidate YouTube channels for NostalGem: does the channel exist, and how many of its uploads
// are episode-length videos that can air (public, embeddable, not age-restricted, not blocked in the US)?
//
//   YOUTUBE_API_KEY=… node tools/yt-probe.mjs @GundamInfo @SomeChannel UCxxxx…  [--min 18] [--scan 500]
//
// Prints a table and, on GitHub Actions, writes it to the job summary.

import { appendFile } from "node:fs/promises";
import { makeYouTubeFetch, rejectReason, parseIsoDuration, cleanYtTitle } from "./youtube.mjs";

const args = process.argv.slice(2);
const opt = (name, d) => {
  const i = args.indexOf("--" + name);
  if (i < 0) return d;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const minMin = Number(opt("min", "18"));
const scan = Number(opt("scan", "500"));
const targets = args.join(" ").split(/[\s,]+/).filter(Boolean);
const yt = makeYouTubeFetch(process.env.YOUTUBE_API_KEY || "");

const rows = [];
const details = [];
for (const t of targets) {
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
  while (ids.length < scan) {
    const p = { part: "contentDetails", playlistId: uploads, maxResults: "50" };
    if (page) p.pageToken = page;
    const j = await yt("playlistItems", p);
    for (const it of j.items || []) ids.push(it.contentDetails.videoId);
    page = j.nextPageToken;
    if (!page) break;
  }
  const reasons = {};
  const good = [];
  for (let i = 0; i < ids.length; i += 50) {
    const j = await yt("videos", { part: "snippet,contentDetails,status", id: ids.slice(i, i + 50).join(",") });
    for (const v of j.items || []) {
      const why = rejectReason(v, { minS: minMin * 60 });
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
