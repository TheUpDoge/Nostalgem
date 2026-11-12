// What changed in each version, newest first, for the "What's new" page: shown once after an update
// (everything since the version you last saw), as a welcome on a first start, and any time from
// Menu ▸ 📰 What's new. Keep entries short: they're read off a TV across the room.

export const CHANGES = [
  {
    v: "1.17.0",
    title: "Send to TV",
    items: [
      "Send a video from your phone to the TV. On the phone remote's Search page, paste a YouTube or archive.org link and tap ▶ Play on TV. It plays right away, with your picture filter and subtitles. BACK goes back to the channel.",
      "While it plays, the phone has a bar to drag through it, ⏪ and ⏩, and ⏮ ⏭ for an Archive item in parts or a YouTube playlist, which play one after the other.",
      "🌐 Search the Archive on the phone lists films and recordings: tap one to play it on the TV. On Android, the installed remote is in the Share menu, so a video shared from YouTube lands in the box.",
    ],
  },
  {
    v: "1.11.0",
    title: "The club's catalog, and clean cuts",
    items: [
      "Reading Room: the club's catalog, 59 books and 8 Golden Age comics checked one by one to be public domain, on shelves of their own.",
      "Clean cuts: a scene a film can't air goes under a card, with the sound off, while the film plays on. A Video Club tape plays as it is, unless you turn its TV-safe cut on to skip the scene instead. None are listed yet: each one is timed by hand.",
      "Channel packs can come as a .zip: every pack in it loads together.",
    ],
  },
  {
    v: "1.10.2",
    title: "Small fixes",
    items: ["111's films start a little sooner.", "111's 1910 Christmas Carol shows its picture, not just its sound."],
  },
  {
    v: "1.10.1",
    title: "111 rings out",
    items: [
      "The church sound on 111 now works with every film: the Archive's servers won't let a page into a film's sound, so the nave echoes the film itself.",
      "666's Phantom Carriage is the full restored film, not a five-minute clip.",
    ],
  },
  {
    v: "1.10.0",
    title: "Heaven, hell and the arcade on your TV",
    items: [
      "666 now comes in red ASCII made of 666s, 999s, crosses and stars, slowed to half speed and an octave down.",
      "There's a third station that isn't on any list, and it's 666's opposite. Try 1 1 1: stained glass, and its films ring around a church.",
      "Both looks are in Menu ▸ Filter for every channel: ASCII · 666 and Stained glass.",
      "In the TV app, 777's arcade opens right on the TV: play with the remote or a controller, and BACK (or hold Select on the controller) comes back. Needs the newest TV app.",
    ],
  },
  {
    v: "1.9.0",
    title: "Touch screens, two secret stations, a better Reading Room",
    items: [
      "Phones and tablets: drag the guide and the menus to move through them; with one open, the buttons at the bottom become ▲ ▼ ◀ ▶ OK BACK (hold an arrow to keep going).",
      "Swiping the picture to change channel works every time, also when it starts on the info banner or a break card, and a swipe down no longer pulls the page down to reload it.",
      "Two new stations that aren't on any list. Try typing 0 6 9, or 6 6 6.",
      "Reading Room: manga series in folders with odd names open properly, older scans know how many pages they have, and pages come straight from the Archive's own servers.",
      "This page, and the version number in the menu and on the start-up screen.",
    ],
  },
  {
    v: "1.8.0",
    title: "📚 The Reading Room",
    items: [
      "Books, comics, manga and magazines from the Internet Archive, read like a book open on a desk: two pages side by side, manga right to left, Fit width for small print.",
      "Your library card borrows three books for two weeks, stamped with a due date. A bookmark keeps your page.",
    ],
  },
  {
    v: "1.7.0",
    title: "📼 The Video Club",
    items: [
      "A free library card checks out two tapes at a time for three days. Be kind: rewind before you return.",
      "The phone remote's pairing screen shows which ways in are open, to help when a phone won't link.",
    ],
  },
  {
    v: "1.6.0",
    title: "Ads, filters and bigger buttons",
    items: [
      "A YouTube ad before a show plays muted behind a card, and the show starts by itself.",
      "Filter quality: a filter that makes the picture choppy switches to a lighter version on its own. New Colorized looks for black-and-white films; two Sin City looks together keep both colours.",
      "Big CH ▲▼ buttons and a dock for touch screens and mice.",
      "Lo-fi ambience stops when you leave the TV app. A channel number typed into Search tunes it.",
    ],
  },
  {
    v: "1.5.0",
    title: "Filters on canvas, the number pad, the relay",
    items: [
      "Pixel, 8-bit, Game Boy and ASCII filters run at full speed, with Matrix rain. Mix with puts a second filter on top.",
      "An on-screen number pad for remotes without numbers.",
      "The phone remote links through an encrypted relay when the two can't reach each other directly.",
    ],
  },
];

// -1, 0 or 1, comparing "1.10.0" with "1.9.2" by numbers.
export function compareVersions(a, b) {
  const x = String(a || "0").split(".");
  const y = String(b || "0").split(".");
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (Number(x[i]) || 0) - (Number(y[i]) || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

// What to show at start-up. seen: the version last shown ("" never); used: whether this TV has used
// NostalGem before (settings saved), so someone from before this page existed gets "what's new", not a
// welcome. Returns { kind: "welcome" | "update" | "", entries }.
export function whatsNew(seen, current, used, log) {
  const all = log || CHANGES;
  const upTo = all.filter(function (c) {
    return compareVersions(c.v, current) <= 0;
  });
  if (!seen && !used) return { kind: "welcome", entries: upTo.slice(0, 1) };
  const since = seen || "1.5.0";
  if (compareVersions(since, current) >= 0) return { kind: "", entries: [] };
  const entries = upTo.filter(function (c) {
    return compareVersions(c.v, since) > 0;
  });
  // A small fix with nothing to tell: no page.
  return entries.length ? { kind: "update", entries: entries } : { kind: "", entries: [] };
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

// The entries as a page: each version, its headline and its points.
export function changesHtml(entries) {
  return entries
    .map(function (c) {
      return (
        '<div class="wn-ver"><span class="wn-v">v' +
        esc(c.v) +
        '</span> <span class="wn-t">' +
        esc(c.title) +
        '</span></div><ul class="wn-list">' +
        c.items
          .map(function (x) {
            return "<li>" + esc(x) + "</li>";
          })
          .join("") +
        "</ul>"
      );
    })
    .join("");
}

// A first start: what NostalGem is and how to get around.
export const WELCOME_HTML =
  "<p><b>Retro cable TV</b> from the Internet Archive's public library: Westerns, serials, cartoons, noir, old-time radio and more, on the air around the clock.</p>" +
  '<ul class="wn-list">' +
  "<li><b>▲▼</b> change channel · <b>◀</b> the guide · <b>▶</b> the menu · <b>OK</b> what's on</li>" +
  "<li>No number buttons? Menu ▸ 🔢 Number pad. On a phone or tablet, swipe up and down to surf.</li>" +
  "<li>📱 Use your phone as the remote: Menu ▸ Phone remote.</li>" +
  "<li>📼 The Video Club and 📚 the Reading Room lend films and books on a free library card.</li>" +
  "<li>🎨 Filters, 🎧 ambience, subtitles, a sleep timer… all in the menu. Some channels aren't on any list.</li>" +
  "</ul>";
