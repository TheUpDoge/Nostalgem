// Three stations that aren't on any list, tuned by number only:
//
//   069  ⛪ Bible Boys Church ("BBC"): for whoever types 69 hoping for something naughty. Sunday service
//        instead: the silent era's Bible films, from a 1902 congregation leaving church to The King of
//        Kings. Sit up straight.
//   666  🔥 Dead Air: "this frequency was not assigned." The silent era's devils and damnation — Méliès's
//        House of the Devil, Häxan, L'Inferno, Faust, Nosferatu — in red ASCII made of 666s, 999s, crosses
//        and stars, at half speed and an octave down, under a red glow, with a clock that reads 6:66.
//   111  😇 Pearly Gates ("PG"): 666's opposite. Angels, saints and second chances — Beyond Tomorrow,
//        Heaven Only Knows, The Bells of St. Mary's, Scrooge, Chaplin's Kid and Pilgrim — through stained
//        glass, ringing around a church (church.js), with a clock stuck at 11:11. Every program rated PG.
//
// A station's look (looks.js) is its filter while it's on; Menu ▸ Filter can still change it there, and both
// looks are in the filter list for every channel. rate and sound are how the player plays its films
// (player.js): 111's films echo around the nave (church.js). All of it is on the Internet Archive. Each station opens with its own card and sound
// (main.js shows them); this module is the data, the words and the sounds.

import { naveImpulse } from "./church.js";

export const BBC_CHANNEL = {
  slug: "bible-boys-church",
  number: 69,
  name: "Bible Boys Church",
  short: "BBC",
  tagline: "Sunday, whether you meant to or not.",
  icon: "⛪",
  color: "#ffd166",
  kind: "video",
  secret: true,
  offset: 0,
  items: [
    { id: "1902EnglandCongregationLeavingChurchSpeedCorrectedWSound", f: "1902 England  - Congregation Leaving Church (Speed Corrected w Sound).mp4", t: "Congregation Leaving Church", d: 152, y: 1902 },
    { id: "silent-the-passion-play", f: "The Passion Play.mp4", t: "The Passion Play", d: 1615, y: 1904 },
    { id: "the-king-of-kings_1927", f: "the-king-of-kings_1927.ia.mp4", t: "The King of Kings", d: 9456, y: 1927 },
    { id: "silent-the-ten-commandments", f: "The Ten Commandments.mp4", t: "The Ten Commandments", d: 1148, y: 1923 },
    { id: "silent-from-the-manger-to-the-cross-or-jesus-of-nazareth", f: "From the Manger to the Cross; or, Jesus of Nazareth.mp4", t: "From the Manger to the Cross", d: 4236, y: 1912 },
    { id: "silent-ben-hur-a-tale-of-the-christ-1925", f: "Ben Hur, A Tale Of The Christ (1925).mp4", t: "Ben-Hur: A Tale of the Christ", d: 8467, y: 1925 },
    { id: "silent-la-vie-et-la-passion-de-jsus-christ-aka-the-passion-play", f: "La vie et la passion de Jsus Christ AKA The Passion Play.mp4", t: "The Life and Passion of Jesus Christ", d: 2661, y: 1903 },
    { id: "ChristusGiulioAntamoro1916", f: "Christus (Giulio Antamoro, 1916).mp4", t: "Christus", d: 5285, y: 1916 },
  ],
};

export const DEAD_AIR_CHANNEL = {
  slug: "dead-air",
  number: 666,
  name: "Dead Air",
  short: "666",
  tagline: "This frequency was not assigned.",
  icon: "🔥",
  color: "#d90429",
  kind: "video",
  secret: true,
  offset: 0,
  look: "ascii-666",
  rate: 0.5, // half speed: slow, and an octave down
  items: [
    { id: "le-manoir-du-diable-1896", f: "Le_Manoir_du_Diable_(1896).mp4", t: "The House of the Devil (Le Manoir du diable)", d: 195, y: 1896 },
    { id: "Haxan1922", f: "Haxan (1922).mp4", t: "Häxan: Witchcraft Through the Ages", d: 6293, y: 1922 },
    { id: "l-inferno-1911-eng", f: "L'Inferno (1911) eng.mp4", t: "L'Inferno", d: 4026, y: 1911 },
    { id: "Nosferatu1922HD", f: "Nosferatu (1922) HD.mp4", t: "Nosferatu", d: 5658, y: 1922 },
    { id: "Faust1926_201808", f: "Faust (1926).mp4", t: "Faust", d: 7327, y: 1926 },
    { id: "the-phantom-carriage-1921-restored-720p-hd", f: "the phantom carriage-1921-restored-720p-hd.mp4", t: "The Phantom Carriage", d: 6298, y: 1921 },
    { id: "SORROWSOFSATANSilent", f: "SORROWS_OF_SATAN silent.mp4", t: "The Sorrows of Satan", d: 5321, y: 1926 },
  ],
};

export const PEARLY_GATES_CHANNEL = {
  slug: "pearly-gates",
  number: 111,
  name: "Pearly Gates",
  short: "PG",
  tagline: "Every program rated PG.",
  icon: "😇",
  color: "#ffe39a",
  kind: "video",
  secret: true,
  offset: 0,
  look: "glass",
  sound: "church",
  items: [
    { id: "BeyondTomorrow_750", f: "BeyondTomorrow.mp4", t: "Beyond Tomorrow", d: 5035, y: 1940 },
    { id: "heaven-only-knows-1947-classic-western-dramady", f: "Heaven Only Knows (1947 +++++ Classic Western Dramady).ia.mp4", t: "Heaven Only Knows", d: 5878, y: 1947 },
    { id: "the-kid-1921_202208", f: "The Kid 1921.mp4", t: "The Kid", d: 3209, y: 1921 },
    { id: "tbosm3543543177", f: "tbosm3543543177.mp4", t: "The Bells of St. Mary's", d: 7548, y: 1945 },
    { id: "silent-a-christmas-carol", f: "A Christmas Carol.mp4", t: "A Christmas Carol", d: 631, y: 1910 },
    { id: "angel_and_the_badman", f: "angel_and_the_badman.mp4", t: "Angel and the Badman", d: 5971, y: 1947 },
    { id: "the-pilgrim-1923-directed-by-charlie-chaplin", f: "The Pilgrim (1923) Directed by Charlie Chaplin.mp4", t: "The Pilgrim", d: 2480, y: 1923 },
    { id: "the-passion-of-joan-of-arc", f: "The Passion of Joan of Arc.ia.mp4", t: "The Passion of Joan of Arc", d: 4929, y: 1928 },
    { id: "Scrooge_1935", f: "Scrooge_1935.mp4", t: "Scrooge", d: 4655, y: 1935 },
    { id: "Our_Town", f: "OurTown.mp4", t: "Our Town", d: 5217, y: 1940 },
  ],
};

export const SECRET_STATIONS = [BBC_CHANNEL, DEAD_AIR_CHANNEL, PEARLY_GATES_CHANNEL];

// What each film is, for the info banner.
export const SECRET_ABOUT = {
  "1902EnglandCongregationLeavingChurchSpeedCorrectedWSound": "Sunday best, 1902: an English congregation files out of church. You're next.",
  "silent-the-passion-play": "One of the first Passion films, hand-tinted for its 1904 audiences.",
  "the-king-of-kings_1927": "Cecil B. DeMille's life of Christ, the silent era's biggest Bible epic.",
  "silent-the-ten-commandments": "Moses, Pharaoh and the parting of the Red Sea, from DeMille's 1923 epic.",
  "silent-from-the-manger-to-the-cross-or-jesus-of-nazareth": "The first feature-length life of Christ, filmed on location in Egypt and Palestine in 1912.",
  "silent-ben-hur-a-tale-of-the-christ-1925": "The 1925 Ben-Hur: sea battles, the chariot race, and a tale of the Christ.",
  "silent-la-vie-et-la-passion-de-jsus-christ-aka-the-passion-play": "Pathé's 1903 Passion, in tableaux, stencil-coloured by hand.",
  "ChristusGiulioAntamoro1916": "Italy's 1916 life of Christ, staged after the Renaissance masters' paintings.",
  "le-manoir-du-diable-1896": "Georges Méliès, 1896: a bat becomes the Devil in a haunted castle. The first horror film.",
  Haxan1922: "Benjamin Christensen's 1922 history of witchcraft, demons and the Devil himself.",
  "l-inferno-1911-eng": "Dante's Inferno, 1911: Italy's first feature film, a guided tour of the nine circles.",
  Nosferatu1922HD: "Murnau's 1922 vampire. Count Orlok has moved in across the street.",
  "Faust1926_201808": "Murnau's 1926 Faust: a scholar, a deal with Mephisto, and the price.",
  "the-phantom-carriage-1921-restored-720p-hd": "Whoever dies last on New Year's Eve must drive Death's carriage for a year. Sweden, 1921.",
  SORROWSOFSATANSilent: "D. W. Griffith, 1926: a starving writer, a charming stranger, and a very expensive bargain.",
  BeyondTomorrow_750: "Christmas Eve, 1940: three old men's ghosts stay behind to look after the young couple they brought together.",
  "heaven-only-knows-1947-classic-western-dramady": "An angel comes down to a Montana boomtown to find the one soul missing from the Book of Life. 1947.",
  "the-kid-1921_202208": "Chaplin, 1921: the Tramp raises a foundling, and dreams of a heaven where everyone has wings.",
  tbosm3543543177: "Bing Crosby's Father O'Malley and Ingrid Bergman's Sister Benedict save a parish school. 1945.",
  "silent-a-christmas-carol": "Edison's 1910 Christmas Carol: Marley's ghost and the three spirits in ten minutes.",
  angel_and_the_badman: "John Wayne, 1947: a wounded gunfighter, a Quaker family, and a slow ride toward grace.",
  "the-pilgrim-1923-directed-by-charlie-chaplin": "Chaplin, 1923: an escaped convict in a stolen parson's suit preaches David and Goliath to a small-town church.",
  "the-passion-of-joan-of-arc": "Carl Th. Dreyer's 1928 trial of Joan of Arc, told almost entirely in close-ups.",
  Scrooge_1935: "Seymour Hicks, 1935: three spirits, one long night, and a miser who wakes up on Christmas morning a new man.",
  Our_Town: "Thornton Wilder's Grover's Corners, 1940: a town's ordinary days, and the quiet hill above it.",
};

export function secretStation(ch) {
  return ch &&
    SECRET_STATIONS.some(function (st) {
      return st.slug === ch.slug;
    })
    ? ch.slug
    : "";
}

// The card each station opens with.
export function introHtml(ch) {
  if (ch.slug === BBC_CHANNEL.slug) {
    return (
      '<div class="in-bbc">' +
      '<div class="in-cross">✝</div>' +
      '<div class="in-name">BIBLE BOYS CHURCH</div>' +
      '<div class="in-short">B · B · C</div>' +
      '<div class="in-line">You typed 69.</div>' +
      '<div class="in-line">We know what you were looking for.</div>' +
      '<div class="in-small">Service has already begun. Sit up straight.</div>' +
      "</div>"
    );
  }
  if (ch.slug === PEARLY_GATES_CHANNEL.slug) {
    return (
      '<div class="in-pg">' +
      '<div class="in-halo"></div>' +
      '<div class="in-111">1 1 1</div>' +
      '<div class="in-name">PEARLY GATES</div>' +
      '<div class="in-line">Your name is on the list.</div>' +
      '<div class="in-small">Every program rated PG. Wipe your feet.</div>' +
      "</div>"
    );
  }
  return (
    '<div class="in-dead">' +
    '<div class="in-warn" data-text="THIS FREQUENCY WAS NOT ASSIGNED">THIS FREQUENCY WAS NOT ASSIGNED</div>' +
    '<div class="in-666">6 6 6</div>' +
    '<div class="in-small">You shouldn\'t be here. Stay as long as you like.</div>' +
    "</div>"
  );
}

// A line for a few of the remote's buttons on these stations.
export function stationQuip(slug, what) {
  if (slug === BBC_CHANNEL.slug && what === "pause") return "⛪ Pausing the sermon? Bold.";
  if (slug === DEAD_AIR_CHANNEL.slug && what === "leave") return "🔥 It'll be here when you get back.";
  if (slug === PEARLY_GATES_CHANNEL.slug && what === "pause") return "😇 Take all the time you need.";
  if (slug === PEARLY_GATES_CHANNEL.slug && what === "leave") return "👼 Go in peace.";
  return "";
}

// The clock on the info banner: 6:66 on Dead Air, and 11:11 (make a wish) at the Pearly Gates.
export function stationClock(slug, clock24) {
  if (slug === DEAD_AIR_CHANNEL.slug) return clock24 ? "06:66" : "6:66 AM";
  if (slug === PEARLY_GATES_CHANNEL.slug) return clock24 ? "11:11" : "11:11 AM";
  return "";
}

export function bugText(ch, fallback) {
  if (ch && ch.slug === BBC_CHANNEL.slug) return "✝ BBC";
  if (ch && ch.slug === DEAD_AIR_CHANNEL.slug) return "666";
  if (ch && ch.slug === PEARLY_GATES_CHANNEL.slug) return "✦ 111";
  return fallback;
}

// ---------- sounds ----------
let audio = null;
function ctx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audio) audio = new AC();
  if (audio.state === "suspended") audio.resume();
  return audio;
}

// A church organ's C major chord, swelling and fading.
function organ(a) {
  const t = a.currentTime;
  const out = a.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.09, t + 0.6);
  out.gain.setValueAtTime(0.09, t + 2.4);
  out.gain.exponentialRampToValueAtTime(0.0001, t + 4.2);
  const lp = a.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1800;
  lp.connect(out);
  out.connect(a.destination);
  [130.81, 164.81, 196.0, 261.63, 392.0].forEach(function (f, i) {
    [f, f * 2].forEach(function (g, k) {
      const o = a.createOscillator();
      o.type = k ? "sine" : "sawtooth";
      o.frequency.value = g * (1 + (i % 2 ? 0.002 : -0.002));
      const v = a.createGain();
      v.gain.value = k ? 0.25 : 0.12;
      o.connect(v);
      v.connect(lp);
      o.start(t);
      o.stop(t + 4.3);
    });
  });
}

// A low drone that beats against itself, and a slow heartbeat under it.
function dread(a) {
  const t = a.currentTime;
  const out = a.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.14, t + 1.2);
  out.gain.setValueAtTime(0.14, t + 4);
  out.gain.exponentialRampToValueAtTime(0.0001, t + 5.5);
  out.connect(a.destination);
  [55, 58.3, 82.4].forEach(function (f) {
    const o = a.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    o.connect(out);
    o.start(t);
    o.stop(t + 5.6);
  });
  for (let i = 0; i < 5; i++) {
    [0, 0.22].forEach(function (off) {
      const at = t + 0.6 + i * 1.0 + off;
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(70, at);
      o.frequency.exponentialRampToValueAtTime(38, at + 0.16);
      g.gain.setValueAtTime(off ? 0.22 : 0.32, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
      o.connect(g);
      g.connect(a.destination);
      o.start(at);
      o.stop(at + 0.22);
    });
  }
}

// A choir's "aah" on a D major chord and a few bells, in a church: sawtooth voices through the formants of
// an open vowel, swelling in, with the reverb of church.js around them.
function choir(a) {
  const t = a.currentTime;
  const verb = a.createConvolver();
  const n = Math.floor(2.8 * a.sampleRate);
  const buf = a.createBuffer(2, n, a.sampleRate);
  for (let c = 0; c < 2; c++) buf.getChannelData(c).set(naveImpulse(n, a.sampleRate, c));
  verb.buffer = buf;
  const wet = a.createGain();
  wet.gain.value = 0.7;
  verb.connect(wet);
  wet.connect(a.destination);
  const out = a.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.07, t + 1.1);
  out.gain.setValueAtTime(0.07, t + 3.2);
  out.gain.exponentialRampToValueAtTime(0.0001, t + 5);
  out.connect(a.destination);
  out.connect(verb);
  // The vowel: three formant filters every voice sings through.
  const formants = [800, 1150, 2900].map(function (f, k) {
    const bp = a.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = f;
    bp.Q.value = k === 2 ? 8 : 5;
    const g = a.createGain();
    g.gain.value = k === 2 ? 0.35 : 1;
    bp.connect(g);
    g.connect(out);
    return bp;
  });
  [146.83, 220, 293.66, 369.99, 440].forEach(function (note, i) {
    [-0.004, 0.004].forEach(function (det) {
      const o = a.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = note * (1 + det + (i % 2 ? 0.001 : 0));
      const vib = a.createOscillator();
      const depth = a.createGain();
      vib.frequency.value = 5 + i * 0.3;
      depth.gain.value = note * 0.004;
      vib.connect(depth);
      depth.connect(o.frequency);
      formants.forEach(function (bp) {
        o.connect(bp);
      });
      o.start(t);
      o.stop(t + 5.1);
      vib.start(t);
      vib.stop(t + 5.1);
    });
  });
  [1174.66, 1479.98, 1760, 2349.32].forEach(function (f, i) {
    const at = t + 1.3 + i * 0.45;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = "sine";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.06, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);
    o.connect(g);
    g.connect(a.destination);
    g.connect(verb);
    o.start(at);
    o.stop(at + 1.7);
  });
}

export function introSound(slug) {
  try {
    const a = ctx();
    if (!a) return;
    if (slug === BBC_CHANNEL.slug) organ(a);
    else if (slug === DEAD_AIR_CHANNEL.slug) dread(a);
    else if (slug === PEARLY_GATES_CHANNEL.slug) choir(a);
  } catch (e) {
    /* no sound: the card still shows */
  }
}
