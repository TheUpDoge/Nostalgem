// Two stations that aren't on any list, tuned by number only:
//
//   069  ⛪ Bible Boys Church ("BBC"): for whoever types 69 hoping for something naughty. Sunday service
//        instead: the silent era's Bible films, from a 1902 congregation leaving church to The King of
//        Kings. Sit up straight.
//   666  🔥 Dead Air: "this frequency was not assigned." The silent era's devils and damnation — Méliès's
//        House of the Devil, Häxan, L'Inferno, Faust, Nosferatu — under a red glow, with a clock that
//        reads 6:66.
//
// All of it public domain and on the Internet Archive. Each station opens with its own card and sound
// (main.js shows them); this module is the data, the words and the sounds.

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
  items: [
    { id: "le-manoir-du-diable-1896", f: "Le_Manoir_du_Diable_(1896).mp4", t: "The House of the Devil (Le Manoir du diable)", d: 195, y: 1896 },
    { id: "Haxan1922", f: "Haxan (1922).mp4", t: "Häxan: Witchcraft Through the Ages", d: 6293, y: 1922 },
    { id: "l-inferno-1911-eng", f: "L'Inferno (1911) eng.mp4", t: "L'Inferno", d: 4026, y: 1911 },
    { id: "Nosferatu1922HD", f: "Nosferatu (1922) HD.mp4", t: "Nosferatu", d: 5658, y: 1922 },
    { id: "Faust1926_201808", f: "Faust (1926).mp4", t: "Faust", d: 7327, y: 1926 },
    { id: "ThePhantomCarriage_201405", f: "ThePhantomCarriage1921.mp4", t: "The Phantom Carriage", d: 6343, y: 1921 },
    { id: "SORROWSOFSATANSilent", f: "SORROWS_OF_SATAN silent.mp4", t: "The Sorrows of Satan", d: 5321, y: 1926 },
  ],
};

export const SECRET_STATIONS = [BBC_CHANNEL, DEAD_AIR_CHANNEL];

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
  "ThePhantomCarriage_201405": "Whoever dies last on New Year's Eve must drive Death's carriage for a year. Sweden, 1921.",
  SORROWSOFSATANSilent: "D. W. Griffith, 1926: a starving writer, a charming stranger, and a very expensive bargain.",
};

export function secretStation(ch) {
  return ch && (ch.slug === BBC_CHANNEL.slug || ch.slug === DEAD_AIR_CHANNEL.slug) ? ch.slug : "";
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
  return "";
}

// The clock on the info banner: 6:66 on Dead Air.
export function stationClock(slug, clock24) {
  if (slug !== DEAD_AIR_CHANNEL.slug) return "";
  return clock24 ? "06:66" : "6:66 AM";
}

export function bugText(ch, fallback) {
  if (ch && ch.slug === BBC_CHANNEL.slug) return "✝ BBC";
  if (ch && ch.slug === DEAD_AIR_CHANNEL.slug) return "666";
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

export function introSound(slug) {
  try {
    const a = ctx();
    if (!a) return;
    if (slug === BBC_CHANNEL.slug) organ(a);
    else if (slug === DEAD_AIR_CHANNEL.slug) dread(a);
  } catch (e) {
    /* no sound: the card still shows */
  }
}
