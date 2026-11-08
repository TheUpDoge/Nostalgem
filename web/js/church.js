// Channel 111's sound: the films' own sound ringing around a stone nave.
//
// Two ways:
//   reverb  through the browser's audio graph (a convolution reverb, the way a sound engineer puts a voice
//           in a church). The browser lets a page into a film's sound only when the file comes with CORS
//           permission. Once a <video>'s sound goes through the graph it can't come back out, so the player
//           swaps in a fresh <video> after a church film (player.js).
//   echoes  for files that don't (the Archive's video servers don't): quieter copies of the film's own
//           sound, each a beat behind, the way a nave throws a voice back. Hidden <audio> players of the
//           same file, kept in step with the picture. The same address lets the browser share what it has
//           already downloaded.

const SECONDS = 2.8; // how long the nave rings
const DRY = 0.82; // the film itself
const WET = 0.62; // the echo around it
// The echoes: [seconds behind, how loud].
export const ECHOES = [
  [0.12, 0.3],
  [0.26, 0.18],
  [0.43, 0.1],
];
const STEP_MS = 200; // how often the echoes are kept in step

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
    this.echoOf = null; // the film the echoes follow
    this.taps = [];
    this.stepTimer = 0;
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

  // Echo el, a film playing the ordinary way.
  echo(el) {
    if (this.echoOf === el) return;
    this.quiet();
    if (typeof document === "undefined") return;
    const src = el.getAttribute("src");
    if (!src) return;
    this.echoOf = el;
    this.taps = ECHOES.map(function (e) {
      const a = document.createElement("audio");
      a.preload = "auto";
      a.src = src;
      return { el: a, delay: e[0], vol: e[1] };
    });
    const self = this;
    this.stepTimer = setInterval(function () {
      self.keepStep();
    }, STEP_MS);
    this.keepStep();
  }

  // Each echo where it belongs, a little behind the film: a touch faster or slower to catch up, a jump
  // when it's far off, paused while the film is.
  keepStep() {
    const m = this.echoOf;
    if (!m) return;
    if (!m.isConnected || !m.getAttribute("src")) {
      this.quiet();
      return;
    }
    const going = !m.paused && !m.ended && !m.seeking && m.readyState >= 3;
    this.taps.forEach(function (t) {
      const a = t.el;
      a.muted = m.muted;
      a.volume = Math.max(0, Math.min(1, t.vol * m.volume));
      const at = m.currentTime - t.delay;
      if (!going || at < 0) {
        if (!a.paused) a.pause();
        return;
      }
      const off = a.currentTime - at;
      if (Math.abs(off) > 1) {
        try {
          a.currentTime = at;
        } catch (e) {
          /* not ready to seek yet */
        }
      } else if (a.readyState >= 2) {
        a.playbackRate = m.playbackRate * Math.max(0.94, Math.min(1.06, 1 - off * 0.8));
      }
      if (a.paused) {
        const p = a.play();
        if (p && p.catch) p.catch(function () {});
      }
    });
  }

  // Stop the echoes.
  quiet() {
    if (this.stepTimer) clearInterval(this.stepTimer);
    this.stepTimer = 0;
    this.taps.forEach(function (t) {
      try {
        t.el.pause();
      } catch (e) {
        /* never started */
      }
      t.el.removeAttribute("src");
      try {
        t.el.load();
      } catch (e) {
        /* already empty */
      }
    });
    this.taps = [];
    this.echoOf = null;
  }

  // The echoes playing now, and how far (ms) the furthest is from where it belongs.
  echoState() {
    const m = this.echoOf;
    let worst = 0;
    let on = 0;
    this.taps.forEach(function (t) {
      if (t.el.paused || !m) return;
      on++;
      worst = Math.max(worst, Math.abs(t.el.currentTime - (m.currentTime - t.delay)));
    });
    return { on: on, off: Math.round(worst * 1000) };
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
