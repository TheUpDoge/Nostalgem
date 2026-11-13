// Crystal Signal's ident: a short glassy rise into a four-note chime. Made here, like the
// secret stations' idents (secrets.js introSound): Web Audio, no file, no library.
// Plays once. A second call stops the first so quick channel changes don't stack.
// Mute, zero volume, or a context the browser won't start: nothing plays.

export const CHIME = {
  seconds: 2.2,
  // A major arpeggio, after the sparkle rise, so the last bell finishes near 2.2s.
  notes: [
    { at: 0.5, freq: 880 },
    { at: 0.74, freq: 1108.73 },
    { at: 0.98, freq: 1318.51 },
    { at: 1.22, freq: 1760 },
  ],
};

let audio = null;
let live = null;
let token = 0;

function envGain(param, t, peak, dur) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.min(0.03, dur * 0.2));
  param.exponentialRampToValueAtTime(0.0001, t + dur);
}

export function stopCrystalChime() {
  token++;
  const cur = live;
  live = null;
  if (!cur) return;
  try {
    const t = cur.ctx.currentTime;
    cur.master.gain.cancelScheduledValues(t);
    cur.master.gain.setTargetAtTime(0.0001, t, 0.03);
    for (let i = 0; i < cur.nodes.length; i++) {
      try {
        cur.nodes[i].stop(t + 0.08);
      } catch (e) {
        /* already stopped */
      }
    }
  } catch (e) {
    /* the card still changes */
  }
}

function bell(a, dest, nodes, time, freq, amp) {
  const car = a.createOscillator();
  const mod = a.createOscillator();
  const depth = a.createGain();
  car.type = "sine";
  mod.type = "sine";
  car.frequency.value = freq;
  mod.frequency.value = freq * 2.02;
  depth.gain.setValueAtTime(freq * 1.4, time);
  depth.gain.exponentialRampToValueAtTime(0.001, time + 0.7);
  mod.connect(depth);
  depth.connect(car.frequency);
  const g = a.createGain();
  envGain(g.gain, time, amp, 0.95);
  car.connect(g);
  g.connect(dest);
  mod.start(time);
  car.start(time);
  mod.stop(time + 1.05);
  car.stop(time + 1.05);
  nodes.push(mod, car);
}

function sparkle(a, dest, nodes, t) {
  const sr = a.sampleRate || 44100;
  const len = Math.floor(sr * 0.45);
  const buf = a.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const bp = a.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 6;
  bp.frequency.setValueAtTime(1400, t);
  bp.frequency.exponentialRampToValueAtTime(7200, t + 0.42);
  const g = a.createGain();
  envGain(g.gain, t, 0.07, 0.48);
  src.connect(bp);
  bp.connect(g);
  g.connect(dest);
  src.start(t);
  src.stop(t + 0.48);
  nodes.push(src);
  const pings = [3200, 4100, 5200, 3800, 6100, 4700];
  const ats = [0.04, 0.1, 0.16, 0.24, 0.32, 0.4];
  for (let i = 0; i < pings.length; i++) {
    const o = a.createOscillator();
    const pg = a.createGain();
    o.type = "sine";
    o.frequency.value = pings[i];
    envGain(pg.gain, t + ats[i], 0.035, 0.09);
    o.connect(pg);
    pg.connect(dest);
    o.start(t + ats[i]);
    o.stop(t + ats[i] + 0.1);
    nodes.push(o);
  }
}

function pad(a, dest, nodes, t) {
  [220, 329.63].forEach(function (f, i) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = "sine";
    o.frequency.value = f;
    envGain(g.gain, t + 0.35, i ? 0.02 : 0.028, 1.7);
    o.connect(g);
    g.connect(dest);
    o.start(t + 0.35);
    o.stop(t + 2.15);
    nodes.push(o);
  });
}

function reverb(a) {
  const seconds = 0.7;
  const n = Math.floor(seconds * (a.sampleRate || 44100));
  const buf = a.createBuffer(2, n, a.sampleRate || 44100);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp((-3.2 * i) / n);
  }
  const conv = a.createConvolver();
  conv.buffer = buf;
  return conv;
}

function startChime(a, vol) {
  const nodes = [];
  const t = a.currentTime;
  const master = a.createGain();
  master.gain.value = 0.2 * vol;
  const lim = a.createDynamicsCompressor();
  lim.threshold.value = -16;
  lim.knee.value = 8;
  lim.ratio.value = 6;
  lim.attack.value = 0.003;
  lim.release.value = 0.12;
  const wet = a.createGain();
  wet.gain.value = 0.38;
  let verb = null;
  try {
    verb = reverb(a);
    verb.connect(wet);
    wet.connect(lim);
  } catch (e) {
    verb = null;
  }
  master.connect(lim);
  if (verb) master.connect(verb);
  lim.connect(a.destination);
  const bus = master;
  sparkle(a, bus, nodes, t);
  pad(a, bus, nodes, t);
  for (let i = 0; i < CHIME.notes.length; i++) bell(a, bus, nodes, t + CHIME.notes[i].at, CHIME.notes[i].freq, 0.2);
  live = { ctx: a, master: master, nodes: nodes };
}

function ownContext() {
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  if (!audio) audio = new AC();
  return audio;
}

// opts: { muted, volume, context }. context is for tests; the app leaves it empty.
export function crystalChime(opts) {
  stopCrystalChime();
  const mine = token;
  const o = opts || {};
  if (o.muted) return;
  const vol = typeof o.volume === "number" ? Math.max(0, Math.min(1, o.volume)) : 1;
  if (vol === 0) return;
  let a = o.context || null;
  try {
    if (!a) a = ownContext();
  } catch (e) {
    return;
  }
  if (!a) return;
  function go() {
    if (mine !== token || !a || a.state !== "running") return;
    try {
      startChime(a, vol);
    } catch (e) {
      live = null;
    }
  }
  if (a.state === "running") {
    go();
    return;
  }
  // A context the browser has already allowed can resume. One it is blocking stays silent.
  try {
    const p = a.resume && a.resume();
    if (p && p.then) {
      p.then(go).catch(function () {});
    }
  } catch (e) {
    /* blocked */
  }
}
