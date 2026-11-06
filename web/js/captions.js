// Subtitles. Archive uploads are mostly SubRip (.srt); <track> needs WebVTT, so convert in the browser.

function fixTime(t) {
  // 00:01:02,5 / 0:01:02,50 / 01:02.500 -> 00:01:02.500
  const m = String(t).trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?$/);
  if (!m) return null;
  const h = m[1] ? m[1] : "0";
  const ms = (m[4] || "0").padEnd(3, "0");
  return (h.length < 2 ? "0" + h : h) + ":" + m[2].padStart(2, "0") + ":" + m[3].padStart(2, "0") + "." + ms;
}

export function srtToVtt(srt) {
  const text = String(srt).replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (/^WEBVTT/.test(text)) return text + "\n";
  const out = ["WEBVTT", ""];
  text.split(/\n\s*\n/).forEach(function (block) {
    const lines = block.split("\n");
    let i = 0;
    while (i < lines.length && lines[i].indexOf("-->") === -1) i++;
    if (i >= lines.length) return;
    const parts = lines[i].split("-->");
    const a = fixTime(parts[0]);
    const b = fixTime(String(parts[1] || "").trim().split(/\s+/)[0]);
    if (!a || !b) return;
    const body = lines
      .slice(i + 1)
      .join("\n")
      .replace(/\{\\[^}]*\}/g, "") // {\an8} positioning tags
      .replace(/<\/?font[^>]*>/gi, "")
      .trim();
    if (!body) return;
    out.push(a + " --> " + b, body, "");
  });
  return out.join("\n");
}

// cc: [[file, lang, auto?], ...] from the lineup. Picks what to show:
// the wanted language (human-made), then English, then any human-made file, then the auto captions.
// strict: only the wanted language will do (the Subtítulos channel wants Spanish or nothing).
export function pickSubtitle(cc, lang, strict) {
  if (!cc || !cc.length) return null;
  const want = lang && lang !== "any" ? lang : "";
  const human = cc.filter(function (c) {
    return !c[2];
  });
  const find = function (list, l) {
    for (let i = 0; i < list.length; i++) if (list[i][1] === l) return list[i];
    return null;
  };
  if (want) {
    const hit = find(human, want);
    if (hit || strict) return hit;
  }
  return find(human, "en") || human[0] || cc[0];
}

export function subtitleLabel(c) {
  if (!c) return "";
  if (c[2]) return "CC (auto)";
  return LANG_NAMES[c[1]] || "Subtitles";
}

export const LANG_NAMES = { en: "English", es: "Español", fr: "Français", de: "Deutsch", it: "Italiano", pt: "Português", "": "Subtitles" };
