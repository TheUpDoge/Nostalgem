// Clean cuts: lists of scenes the player keeps off the screen, without ever touching the file.
//
// A few classic films are 99% great and have a scene or two that can't air. A skip list names those
// scenes by time, and the player does one of two things when a film reaches one:
//
//   card  covers the picture with a card ("EXTREMELY GRAPHIC SCENE IS PLAYING") and cuts the sound; the
//         film plays on underneath, and the card lifts when the scene is over. Nothing is skipped, so it
//         works on live channels too: the shared clock and the guide stay right.
//   skip  jumps over the scene. Video Club tapes only (a tape is watched at your own pace, so jumping
//         doesn't throw any clock off), and only with the tape's "TV-safe cut" on.
//
// A tape's TV-safe cut is off until the viewer turns it on for that tape: off, the tape plays as it is,
// card or no card.
//
// Scope: sexual content ONLY. Gore and violence are never listed — a list with any other reason is
// refused. Times come from a real viewing pass of the Archive's own file (a scene sits at different times
// in different cuts); none are ever guessed. Until real lists exist, the shipped file has none.
//
// The format ("nostalgem-skip-lists/1"), in data/skip-lists.json or a pack's "skipLists":
//   { "format": "nostalgem-skip-lists/1", "mode": "card", "cardText": "…",
//     "lists": [ { "item": "<archive id>", "file": "<file, optional>", "title": "…", "enabled": true,
//                  "mode": "skip" | "card", "cardText": "…",
//                  "skips": [ { "start": 1234.5, "end": 1267, "reason": "sex-scene", "note": "…" } ] } ] }

export const SKIP_FORMAT = "nostalgem-skip-lists/1";
export const CARD_TEXT = "EXTREMELY GRAPHIC SCENE IS PLAYING";
export const REASONS = ["sexual-assault", "attempted-sexual-assault", "sexual-violence", "sexualized-minor", "nudity-sexualized", "sex-scene", "sexual-content"];
const ITEM_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_LISTS = 500;
const MAX_SKIPS = 60;

function plain(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function text(v, n) {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "";
}

// Check one file's worth of lists. -> { lists, errors, warnings }: the usable lists (disabled ones
// included, marked), and what was wrong with the rest. A list with a reason outside REASONS is refused
// whole: gore and violence are never cut.
export function checkSkipLists(json) {
  const errors = [];
  const warnings = [];
  const lists = [];
  if (!plain(json)) return { lists: lists, errors: ["A skip-list file is one JSON object."], warnings: warnings };
  if (json.format !== SKIP_FORMAT) errors.push('format: this app reads "' + SKIP_FORMAT + '".');
  if (!Array.isArray(json.lists)) errors.push("lists: a list of skip lists (it may be empty).");
  if (errors.length) return { lists: lists, errors: errors, warnings: warnings };
  const fileMode = json.mode === "skip" ? "skip" : "card";
  const fileCard = text(json.cardText, 80) || CARD_TEXT;
  json.lists.slice(0, MAX_LISTS).forEach(function (l, i) {
    const where = "List " + (i + 1) + (plain(l) && l.title ? " (" + text(l.title, 60) + ")" : "");
    if (!plain(l)) return errors.push(where + ": a list is an object.");
    if (typeof l.item !== "string" || !ITEM_ID.test(l.item)) return errors.push(where + ": item must be an Archive item id.");
    if (l.file != null && (typeof l.file !== "string" || !l.file || l.file.length > 300)) return errors.push(where + ": file must be a file name.");
    if (l.mode != null && l.mode !== "skip" && l.mode !== "card") return errors.push(where + ': mode is "skip" or "card".');
    if (!Array.isArray(l.skips)) return errors.push(where + ": skips must be a list.");
    if (l.skips.length > MAX_SKIPS) return errors.push(where + ": at most " + MAX_SKIPS + " scenes per film.");
    let bad = "";
    const skips = [];
    l.skips.forEach(function (s, j) {
      if (bad) return;
      const at = where + " scene " + (j + 1);
      if (!plain(s)) bad = at + ": a scene is an object.";
      else if (REASONS.indexOf(s.reason) < 0) bad = at + ': reason "' + text(String(s.reason), 40) + '" isn\'t one of ' + REASONS.join(", ") + " (sexual content only: gore and violence are never cut).";
      else if (typeof s.start !== "number" || typeof s.end !== "number" || !isFinite(s.start) || !isFinite(s.end) || s.start < 0 || s.end <= s.start) bad = at + ": start and end are seconds into the file, start before end.";
      else if (s.end - s.start > 1800) bad = at + ": over half an hour; that's not a scene.";
      else skips.push({ start: s.start, end: s.end, reason: s.reason, note: text(s.note, 200) });
    });
    if (bad) return errors.push(bad);
    if (!skips.length) warnings.push(where + ": no scenes listed yet.");
    lists.push({
      item: l.item,
      file: typeof l.file === "string" ? l.file : "",
      title: text(l.title, 120),
      enabled: l.enabled !== false,
      mode: l.mode === "skip" || l.mode === "card" ? l.mode : fileMode,
      cardText: text(l.cardText, 80) || fileCard,
      skips: mergeScenes(skips),
    });
  });
  if (json.lists.length > MAX_LISTS) warnings.push("lists: only the first " + MAX_LISTS + " are read.");
  return { lists: lists, errors: errors, warnings: warnings };
}

// In time order, with overlapping or touching scenes joined into one.
export function mergeScenes(skips) {
  const sorted = skips.slice().sort(function (a, b) {
    return a.start - b.start;
  });
  const out = [];
  sorted.forEach(function (s) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end + 0.5) last.end = Math.max(last.end, s.end);
    else out.push({ start: s.start, end: s.end, reason: s.reason, note: s.note });
  });
  return out;
}

// The enabled list for a program ({ id, f }), or null. A list naming a file is for that file only; one
// without is for every file of the item. Later lists (a pack loaded on this TV) win over earlier ones.
export function listFor(lists, item) {
  if (!item || !Array.isArray(lists)) return null;
  let best = null;
  lists.forEach(function (l) {
    if (!l.enabled || !l.skips.length || l.item !== item.id) return;
    if (l.file && l.file !== item.f) return;
    if (!best || l.file || !best.file) best = l;
  });
  return best;
}

// The scene playing at t (seconds into the file), or null.
export function sceneAt(skips, t) {
  for (let i = 0; i < skips.length; i++) {
    if (t >= skips[i].start && t < skips[i].end) return skips[i];
  }
  return null;
}

// The next scene to start after t, or null.
export function nextScene(skips, t) {
  for (let i = 0; i < skips.length; i++) {
    if (skips[i].start > t) return skips[i];
  }
  return null;
}

// How a program plays with its list: { mode: "card" | "skip", skips, text } or null (untouched).
//   tape   a Video Club tape (on-demand, your own pace); uncut: its TV-safe cut is off.
// Anything else (a live channel, a program from the start) gets the card: skipping would desync it.
export function cutsFor(lists, item, tape, uncut) {
  const l = listFor(lists, item);
  if (!l) return null;
  if (tape && uncut) return null;
  return { mode: tape && l.mode === "skip" ? "skip" : "card", skips: l.skips, text: l.cardText };
}
