// Channel 111's sound: the films' own sound ringing around a stone nave, through the browser's audio graph
// (a convolution reverb, the way a sound engineer puts a voice in a church).
//
// The browser lets a page into a film's sound only when the file is loaded with CORS, which the Archive
// allows. Once a <video>'s sound goes through the graph it can't come back out, so the player gives
// church films a <video> of their own and swaps in a fresh one afterwards (player.js).

const SECONDS = 2.8; // how long the nave rings
const DRY = 0.82; // the film itself
const WET = 0.62; // the echo around it

// The sound of the nave: a burst of noise that dies away over SECONDS, darker as it goes (stone and air soak
// up the high notes first), after a handful of early echoes off the nearest walls. Left and right differ, so
// it sounds wide. Returns channel c's n samples at the given sample rate.
export function naveImpulse(n, rate, c, random) {
  const rnd = random || Math.random;
  const out = new Float32Array(n);
  const taps = [0.013, 0.021, 0.029, 0.041, 0.057, 0.073, 0.097];
  taps.forEach(function (t, k) {
    const at = Math.floor((t + (c ? 0.0021 * (k + 1) : 0)) * rate);
    if (at < n) out[at] += (k % 2 ? -1 : 1) * (0.55 - k * 0.06);
  });
  let low = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const decay = Math.exp((-6.9 * t) / SECONDS);
    // A one-pole low-pass whose cutoff falls as the sound dies.
    const k = Math.min(0.92, 0.25 + 0.55 * (t / SECONDS));
    low = low * k + (rnd() * 2 - 1) * (1 - k);
    const fade = t < 0.02 ? t / 0.02 : 1;
    out[i] += low * decay * fade * 1.6;
  }
  return out;
}

export class Church {
  constructor() {
    this.ctx = null;
    this.el = null;
    this.src = null;
    this.meter = null;
    this.buf = null;
  }

  // The audio graph's clock, made the first time it's wanted and woken if the browser put it to sleep.
  // Call it from a button press when you can: browsers only start sound for a page someone pressed on.
  context() {
    const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    try {
      if (!this.ctx) this.ctx = new AC();
      if (this.ctx.state === "suspended") this.ctx.resume();
    } catch (e) {
      return null;
    }
    return this.ctx;
  }

  // Can a film's sound go into the nave now? Only with the graph running: while it's asleep, anything
  // routed through it is silent.
  ready() {
    const ctx = this.context();
    return !!ctx && ctx.state === "running";
  }

  impulse(ctx) {
    if (this.buf && this.buf.sampleRate === ctx.sampleRate) return this.buf;
    const n = Math.floor(SECONDS * ctx.sampleRate);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) buf.getChannelData(c).set(naveImpulse(n, ctx.sampleRate, c));
    this.buf = buf;
    return buf;
  }

  // Put el's sound in the nave. el must be playing a file loaded with CORS. True when it's in.
  attach(el) {
    if (this.el === el) return true;
    if (!this.ready()) return false;
    const ctx = this.ctx;
    let src;
    try {
      src = ctx.createMediaElementSource(el);
    } catch (e) {
      return false;
    }
    this.detach();
    const out = ctx.createGain();
    const dry = ctx.createGain();
    dry.gain.value = DRY;
    const pre = ctx.createDelay(0.1);
    pre.delayTime.value = 0.024;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 180;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 5200;
    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = WET;
    const meter = ctx.createAnalyser();
    meter.fftSize = 1024;
    src.connect(dry);
    dry.connect(out);
    src.connect(pre);
    pre.connect(hp);
    hp.connect(lp);
    lp.connect(verb);
    verb.connect(wet);
    wet.connect(out);
    out.connect(meter);
    meter.connect(ctx.destination);
    this.el = el;
    this.src = src;
    this.out = out;
    this.meter = meter;
    return true;
  }

  // Let go of the <video> whose sound is in the nave (the player is throwing it away).
  detach() {
    if (this.src) {
      try {
        this.src.disconnect();
        this.out.disconnect();
        this.meter.disconnect();
      } catch (e) {
        /* already gone */
      }
    }
    this.el = null;
    this.src = null;
    this.out = null;
    this.meter = null;
  }

  // How loud it is in the nave right now (0 silent … 1), for tests and the state report.
  level() {
    if (!this.meter) return 0;
    const data = new Float32Array(this.meter.fftSize);
    this.meter.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    return Math.sqrt(sum / data.length);
  }
}
