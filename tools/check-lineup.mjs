#!/usr/bin/env node
// Checks that every program in the lineup can still be played: each Internet Archive item still exists,
// isn't dark or restricted, and still has the file the lineup plays; each YouTube video is still public,
// embeddable, not age-restricted, and (optionally) which countries block it.
//
//   node tools/check-lineup.mjs                     Archive items (no key needed)
//   YOUTUBE_API_KEY=… node tools/check-lineup.mjs --youtube [--regions CA,GB,AU,DE,MX]
//   … --only yt-workshop,westerns                  just these channels
//
// Prints a table per channel and the programs that can't play, and writes it to the job summary on
// GitHub Actions. Exits 0 either way: it's a report.

import { readFile, appendFile } from "node:fs/promises";
import { makeYouTubeFetch } from "./youtube.mjs";

const args = process.argv.slice(2);
const opt = (name, d) => {
  const i = args.indexOf("--" + name);
  return i < 0 ? d : args[i + 1];
};
const doYouTube = args.indexOf("--youtube") >= 0;
const regions = String(opt("regions", "CA,GB,AU,DE,MX,IN,BR,PH"))
  .split(",")
  .map((r) => r.trim().toUpperCase())
  .filter(Boolean);
const only = String(opt("only", "")).split(",").filter(Boolean);
const lineup = JSON.parse(await readFile(new URL("../web/data/lineup.json", import.meta.url), "utf8"));
const channels = lineup.channels.filter((c) => !only.length || only.indexOf(c.slug) >= 0);
const label = (c) => c.number + (c.sub ? "-" + c.sub : "") + " " + c.name;

async function getJson(url, tries) {
  for (let i = 0; i < (tries || 4); i++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": "NostalGem lineup check (github.com/TheUpDoge/Nostalgem)" } });
      if (r.status === 429 || r.status >= 500) throw new Error("HTTP " + r.status);
      if (!r.ok) return { _status: r.status };
      return await r.json();
    } catch (e) {
      if (i === (tries || 4) - 1) return { _error: e.message };
      await new Promise((ok) => setTimeout(ok, 1500 * (i + 1)));
    }
  }
}

async function pool(list, n, fn) {
  let next = 0;
  const workers = Array.from({ length: n }, async () => {
    while (next < list.length) {
      const i = next++;
      await fn(list[i], i);
    }
  });
  await Promise.all(workers);
}

const report = []; // { ch, total, bad, examples }
const lines = [];

// ---------- Internet Archive ----------
const archiveByItem = {};
for (const c of channels) {
  for (const p of c.items) {
    if (p.f === "yt") continue;
    (archiveByItem[p.id] = archiveByItem[p.id] || []).push({ c: c, p: p });
  }
}
const items = Object.keys(archiveByItem);
const verdict = {}; // "id/file" -> reason, or "" when fine
let done = 0;
await pool(items, 8, async (id) => {
  const m = await getJson("https://archive.org/metadata/" + encodeURIComponent(id));
  const files = {};
  ((m && m.files) || []).forEach((f) => (files[f.name] = f));
  let itemWhy = "";
  if (!m || m._error) itemWhy = "couldn't check (" + ((m && m._error) || "no answer") + ")";
  else if (m._status) itemWhy = "HTTP " + m._status;
  else if (!m.metadata) itemWhy = "item is gone";
  else if (m.is_dark) itemWhy = "item was taken down (dark)";
  else if (m.metadata["access-restricted-item"] === "true" || m.metadata["access-restricted-item"] === true) itemWhy = "item is restricted (lending library)";
  for (const { p } of archiveByItem[id]) {
    let why = itemWhy;
    if (!why && !files[p.f]) why = "file is gone: " + p.f;
    else if (!why && files[p.f].private === "true") why = "file is private: " + p.f;
    verdict[id + "/" + p.f] = why;
  }
  if (++done % 250 === 0) console.error("  … " + done + " of " + items.length + " Archive items");
});

// ---------- YouTube ----------
const ytVerdict = {};
const blockedIn = {}; // videoId -> [regions]
if (doYouTube) {
  const yt = makeYouTubeFetch(process.env.YOUTUBE_API_KEY || "");
  const ids = [];
  for (const c of channels) for (const p of c.items) if (p.f === "yt" && !p.live) ids.push(p.id.slice(3));
  const uniq = Array.from(new Set(ids));
  for (let i = 0; i < uniq.length; i += 50) {
    const batch = uniq.slice(i, i + 50);
    const j = await yt("videos", { part: "status,contentDetails", id: batch.join(","), maxResults: "50" });
    const seen = {};
    for (const v of j.items || []) {
      seen[v.id] = 1;
      const st = v.status || {};
      const cd = v.contentDetails || {};
      const rr = cd.regionRestriction || {};
      let why = "";
      if (st.privacyStatus && st.privacyStatus !== "public" && st.privacyStatus !== "unlisted") why = "now " + st.privacyStatus;
      else if (st.embeddable === false) why = "embedding turned off";
      else if (cd.contentRating && cd.contentRating.ytRating === "ytAgeRestricted") why = "age-restricted";
      else if ((rr.blocked || []).indexOf("US") >= 0 || (rr.allowed && rr.allowed.indexOf("US") < 0)) why = "blocked in the US";
      ytVerdict[v.id] = why;
      blockedIn[v.id] = regions.filter((r) => (rr.blocked || []).indexOf(r) >= 0 || (rr.allowed && rr.allowed.indexOf(r) < 0));
    }
    batch.forEach((id) => {
      if (!seen[id]) ytVerdict[id] = "removed or private";
    });
  }
}

// ---------- report ----------
for (const c of channels) {
  const yt = c.items.length && c.items[0].f === "yt";
  if (yt && !doYouTube) continue;
  const bad = [];
  const regionCount = {};
  for (const p of c.items) {
    if (p.f === "yt") {
      if (p.live) continue;
      const vid = p.id.slice(3);
      if (ytVerdict[vid]) bad.push(p.t + " — " + ytVerdict[vid]);
      (blockedIn[vid] || []).forEach((r) => (regionCount[r] = (regionCount[r] || 0) + 1));
    } else {
      const why = verdict[p.id + "/" + p.f];
      if (why) bad.push(p.t + " (" + p.id + ") — " + why);
    }
  }
  const vod = c.items.filter((p) => !p.live).length;
  const regionText = Object.keys(regionCount)
    .map((r) => r + " " + Math.round((100 * regionCount[r]) / Math.max(1, vod)) + "%")
    .join(", ");
  report.push({ ch: label(c), programs: c.items.length, cantPlay: bad.length, blockedElsewhere: regionText });
  if (bad.length) {
    lines.push("", "### " + label(c) + ": " + bad.length + " can't play");
    bad.slice(0, 25).forEach((b) => lines.push("- " + b));
    if (bad.length > 25) lines.push("- … and " + (bad.length - 25) + " more");
  }
}
console.table(report);
console.log(lines.join("\n"));
const total = report.reduce((s, r) => s + r.cantPlay, 0);
console.log("\n" + total + " program(s) can't play, across " + report.filter((r) => r.cantPlay).length + " channel(s).");
if (process.env.GITHUB_STEP_SUMMARY) {
  const md = ["## Lineup check", "", "| Channel | Programs | Can't play | Blocked elsewhere (share of the channel) |", "|---|---:|---:|---|"]
    .concat(report.map((r) => `| ${r.ch} | ${r.programs} | ${r.cantPlay} | ${r.blockedElsewhere || ""} |`))
    .concat(lines)
    .join("\n");
  await appendFile(process.env.GITHUB_STEP_SUMMARY, md + "\n");
}
