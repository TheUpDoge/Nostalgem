// Station cards in the channel's own voice: the up-next card in a station break, the card while a channel
// loads, and the words on the card over a YouTube ad. Each channel belongs to a family (westerns, noir,
// horror, sci-fi, cartoons, comedy, music…) with its own look (css/app.css, .fam-*) and its own words
// (web/data/cards.json: edit freely, like the bumpers). The words for a break are picked from the clock,
// like the bumpers and the schedule itself, so every TV in the same break shows the same card.
//
// The 8-second station breaks and the sponsor card over YouTube's ads work as before: this only changes
// what the cards look like and say.

import { hash32 } from "./util.js";

// Each family and the look it's drawn in. Several families share a look with their own words.
export const FAMILIES = [
  { id: "western", look: "western", name: "Westerns" },
  { id: "serial", look: "reel", name: "Serials" },
  { id: "noir", look: "noir", name: "Noir & mystery" },
  { id: "horror", look: "horror", name: "Horror" },
  { id: "scifi", look: "scifi", name: "Science fiction" },
  { id: "space", look: "space", name: "Space program" },
  { id: "toon", look: "toon", name: "Cartoons" },
  { id: "anime", look: "anime", name: "Anime" },
  { id: "comedy", look: "comedy", name: "Comedy" },
  { id: "music", look: "music", name: "Music" },
  { id: "silent", look: "silent", name: "Silent era" },
  { id: "reel", look: "reel", name: "From the archive" },
  { id: "tech", look: "tech", name: "Computers" },
  { id: "gameshow", look: "gameshow", name: "Game shows" },
  { id: "desk", look: "desk", name: "Talk & news" },
  { id: "radio", look: "radio", name: "Radio" },
  { id: "retro", look: "retro", name: "NostalGem" },
  // Extra looks. Not on the dial: nothing in BY_SLUG points here.
  { id: "neonrain", look: "neonrain", name: "Neon Rain" },
  { id: "hardchrome", look: "hardchrome", name: "Hard Chrome" },
  { id: "polygon", look: "polygon", name: "Polygon Hour" },
  { id: "glowcircuit", look: "glowcircuit", name: "Glow Circuit" },
];
const FAMILY = {};
FAMILIES.forEach(function (f) {
  FAMILY[f.id] = f;
});

// The shipped channels (web/data/channels.json slugs) and the secret stations.
const BY_SLUG = {
  "high-noon": "western", "singing-cowboys": "western", "trail-tv": "western", "campfire-radio": "western",
  cliffhangers: "serial",
  "midnight-noir": "noir", "mystery-radio": "noir", "yt-true-crime": "noir",
  "creature-feature": "horror", "witching-hour": "horror", "twilight-hour": "horror", "yt-dark-files": "horror", "yt-midnight-movies": "horror", "dead-air": "horror",
  "atomic-drive-in": "scifi", "space-cadets": "scifi", "radio-from-space": "scifi", "yt-filmrise-tv": "scifi", "yt-mecha": "scifi", "yt-ultra": "scifi",
  "mission-control": "space", "live-launch-pad": "space",
  "saturday-morning": "toon", "pixel-dreams": "toon", "yt-toon-block": "toon", "yt-late-show": "toon", "yt-laugh-riot": "toon",
  "yt-anime-vault": "anime", "yt-anime-archive": "anime",
  "laugh-track": "comedy", "rerun-city": "comedy", "comedy-radio": "comedy", "yt-sitcom-classics": "comedy", "yt-after-hours": "comedy", "yt-stand-up": "comedy", "yt-riff-theater": "comedy",
  "hit-parade": "music", jukebox: "music", "netlabel-radio": "music", "live-lofi": "music", "yt-vapor-lounge": "music",
  "silent-era": "silent", "bible-boys-church": "silent", "pearly-gates": "silent",
  ephemera: "reel", newsreel: "reel", "commercial-break": "reel", wanderlust: "reel", "wild-blue": "reel", "iron-horse": "reel", "yt-workshop": "reel", "yt-deep-dives": "reel", "yt-pledge-drive": "reel", "live-cam-tour": "reel", "live-rail-cam": "reel", "yt-outdoors": "reel", "yt-gearheads": "reel", "yt-range-day": "reel", subtitulos: "reel",
  "byte-size": "tech", "dial-up": "tech", "yt-game-room": "tech",
  "game-night": "gameshow",
  "yt-jre": "desk", "yt-pod-squad": "desk", "live-world-desk": "desk", "live-en-espanol": "desk",
};

// Channels viewers add (a search, a pack): by what their name and tagline say.
const KEYWORDS = [
  ["western", /\bwestern|cowboy|cowgirl|ranch|rodeo|frontier|saddle|sheriff|outlaw|gunfight|lone ranger|cattle|wagon|prairie|spaghetti/i],
  ["horror", /horror|monster|creature|zombie|vampire|werewolf|ghost|haunt|witch|demon|devil|nightmare|terror|macabre|gothic|dracula|frankenstein|slasher/i],
  ["space", /\bnasa\b|apollo|mercury|gemini|shuttle|space station|launch pad|mission control|astronaut|cosmonaut/i],
  ["scifi", /sci-?fi|science fiction|\bspace\b|rocket|robot|alien|saucer|flying saucer|galaxy|planet|mecha|ultraman|star ?trek|atomic|dimension x|x minus one|flash gordon|buck rogers/i],
  ["anime", /anime|\bova\b|manga|tokusatsu|kaiju/i],
  ["toon", /cartoon|toon|animated|animation|popeye|betty boop|looney|saturday morning|kids|children/i],
  ["noir", /\bnoir\b|mystery|detective|whodunit|crime|dragnet|sam spade|hardboiled|private eye|true crime|unsolved/i],
  ["comedy", /comedy|comic|sitcom|laugh|slapstick|screwball|stooges|stand-?up|funny|humor|humour|satire|sketch/i],
  ["music", /music|jazz|blues|swing|big band|crooner|song|soundies|synth|chiptune|vaporwave|lo-?fi|beats|concert|orchestra|hit parade|jukebox|radio station/i],
  ["silent", /silent|chaplin|keaton|lloyd|m[ée]li[èe]s|1910s|1920s|nickelodeon/i],
  ["serial", /serial|cliffhanger|chapter/i],
  ["tech", /computer|software|internet|\bbbs\b|dial-?up|web|technology|video game|console|arcade|retro gam/i],
  ["gameshow", /game show|quiz|panel show|contestant|jeopardy|password/i],
  ["desk", /\bnews\b|newscast|podcast|interview|talk show|documentary|documentar|noticias|\blive\b/i],
  ["reel", /newsreel|educational|classroom|industrial|ephemera|prelinger|travelogue|aviation|railroad|trains?\b|history|archive|vintage ads|commercial/i],
  // Extra looks. Only the name, and only if nothing above matched, so the shipped lineup stays put.
  ["neonrain", /\bneon rain\b/i],
  ["hardchrome", /\bhard chrome\b/i],
  ["polygon", /\bpolygon hour\b/i],
  ["glowcircuit", /\bglow circuit\b/i],
];

// Extra looks are not on the dial. To try one on a real channel, map that channel's slug
// to the family id. This ships empty; the shipped lineup keeps the families in BY_SLUG.
//   "high-noon": "neonrain"
export const EXTRA_SLUGS = {};

// A channel's family: an EXTRA_SLUGS override, then by slug, then by its words,
// then radio for audio and NostalGem's own for the rest.
export function familyOf(ch) {
  if (!ch) return FAMILY.retro;
  if (EXTRA_SLUGS[ch.slug] && FAMILY[EXTRA_SLUGS[ch.slug]]) return FAMILY[EXTRA_SLUGS[ch.slug]];
  const byName = BY_SLUG[ch.slug];
  if (byName) return FAMILY[byName];
  const text = [ch.name, ch.tagline, ch.slug].join(" ");
  for (let i = 0; i < KEYWORDS.length; i++) if (KEYWORDS[i][1].test(text)) return FAMILY[KEYWORDS[i][0]];
  return FAMILY[ch.kind === "audio" ? "radio" : "retro"];
}

// The CSS class a card for this channel gets.
export function cardClass(ch) {
  return "fam-" + familyOf(ch).look;
}

// Words when data/cards.json isn't there: one plain set for every family.
export const DEFAULT_CARDS = {
  retro: { kickers: ["UP NEXT ON CH {ch} · {name}"], loading: ["TUNING IN…", "ADJUSTING THE ANTENNA…", "ONE MOMENT PLEASE"], ad: [], count: "" },
};

function clean(v, n) {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "";
}
function lines(v, n, max) {
  return (Array.isArray(v) ? v : [])
    .map(function (s) {
      return clean(s, n);
    })
    .filter(Boolean)
    .slice(0, max);
}

// The file's shape, cleaned up: { families: { western: { kickers, loading, ad, count }, … } }. Unknown
// families and junk entries are dropped; a family with nothing usable is left out (it falls back to retro's words).
export function parseCards(data) {
  const out = {};
  const fams = data && data.families && typeof data.families === "object" ? data.families : {};
  Object.keys(fams).forEach(function (id) {
    if (!FAMILY[id] || !fams[id] || typeof fams[id] !== "object") return;
    const f = fams[id];
    const entry = { kickers: lines(f.kickers, 80, 12), loading: lines(f.loading, 80, 12), ad: lines(f.ad, 120, 12), count: clean(f.count, 24) };
    if (entry.kickers.length || entry.loading.length || entry.ad.length) out[id] = entry;
  });
  return Object.keys(out).length ? Object.assign({}, DEFAULT_CARDS, out) : DEFAULT_CARDS;
}

// Loads web/data/cards.json. A missing or broken file means the plain words: never hold anything up for this.
export function loadCards(url) {
  if (typeof fetch === "undefined") return Promise.resolve(DEFAULT_CARDS);
  return fetch(url, { credentials: "omit", cache: "no-cache" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(parseCards)
    .catch(function () {
      return DEFAULT_CARDS;
    });
}

function words(cards, ch) {
  const c = cards || DEFAULT_CARDS;
  return c[familyOf(ch).id] || c.retro || DEFAULT_CARDS.retro;
}

// One of a list, by the clock: the same on every TV at the same moment, different from one break to the next.
export function pickBy(list, seedMs, salt) {
  if (!list || !list.length) return "";
  const h = hash32(String(Math.floor((seedMs || 0) / 1000)) + "|" + (salt || ""));
  return list[(h >>> 2) % list.length];
}

// {ch}, {name} and {time} in a line.
export function fill(line, ch, label, time) {
  return String(line || "")
    .replace(/\{ch\}/g, label || "")
    .replace(/\{name\}/g, ch && ch.name ? ch.name.toUpperCase() : "")
    .replace(/\{time\}/g, time || "");
}

// The kicker over the up-next card for a break that starts at breakStartMs.
export function breakKicker(cards, ch, breakStartMs, label, time) {
  const w = words(cards, ch);
  const line = pickBy(w.kickers.length ? w.kickers : DEFAULT_CARDS.retro.kickers, breakStartMs, "kicker:" + familyOf(ch).id);
  return fill(line, ch, label, time);
}

// The label over the countdown ("T-MINUS", "INTERMISSION"); "" for a plain count.
export function countLabel(cards, ch) {
  return words(cards, ch).count || "";
}

// What the card says while the channel's program loads (startMs: when it was tuned).
export function loadingLine(cards, ch, startMs) {
  const w = words(cards, ch);
  return pickBy(w.loading.length ? w.loading : DEFAULT_CARDS.retro.loading, startMs, "loading:" + familyOf(ch).id);
}

// The family's own quips for the card over a YouTube ad, to mix with the general ones.
export function familyAdQuips(cards, ch) {
  return words(cards, ch).ad || [];
}

// The scenery behind a card, for a look: layers css/app.css paints (fs-<look> .l1 .l2 .l3). retro has the
// sunset scene views.js already draws, so it gets nothing here.
export function familyScene(look) {
  if (!look || look === "retro") return "";
  return '<div class="fscene fs-' + look + '" aria-hidden="true"><i class="l1"></i><i class="l2"></i><i class="l3"></i></div>';
}
