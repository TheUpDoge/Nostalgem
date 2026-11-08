// Sound over the program: lo-fi vinyl crackle, rain on the window, or tape hiss. It's made here, in the
// browser, and mixed on top. The program's own sound can't be run through effects: the Archive and
// YouTube don't let a page like this one touch it.

export const AMBIENCES = [
  ["off", "Off"],
  ["lofi", "Lo-fi vinyl"],
  ["rain", "Rainy window"],
  ["tape", "Tape hiss"],
];

export function ambienceName(id) {
  for (let i = 0; i < AMBIENCES.length; i++) if (AMBIENCES[i][0] === id) return AMBIENCES[i][1];
  return AMBIENCES[0][1];
}

// Sparse clicks for crackle and raindrops: `rate` clicks a second, each a few ms of decaying noise.
export function clickTrain(len, sampleRate, rate, rand) {
  const r = rand || Math.random;
  const out = new Float32Array(len);
  const p = rate / sampleRate;
  for (let i = 0; i < len; i++) {
    if (r() >= p) continue;
    const amp = (0.3 + r() * 0.7) * (r() < 0.5 ? -1 : 1);
    const decay = Math.floor(sampleRate * (0.0008 + r() * 0.003));
    for (let j = 0; j < decay && i + j < len; j++) out[i + j] += amp * Math.exp((-5 * j) / decay) * (r() * 2 - 1);
  }
  return out;
}

export class Ambience {
  constructor() {
    this.ctx = null;
    this.out = null;
    this.nodes = [];
    this.mode = "off";
    this.active = true;
    this.asleep = false; // the app is in the background: no sound at all
  }

  // mode: one of AMBIENCES. Safe to call often; only a change rebuilds the sound.
  set(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.stop();
    if (mode !== "off") this.start();
  }

  // Muted, asleep or the set is off: fade out; otherwise fade back in.
  setActive(on) {
    this.active = !!on && !this.asleep;
    if (!this.out || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(this.active ? 1 : 0, t, 0.25);
  }

  // The app went to the background (or the page is going away): stop the sound outright, not just fade it,
  // so nothing keeps playing behind the TV's home screen.
  sleep() {
    this.asleep = true;
    this.setActive(false);
    if (this.ctx && this.ctx.state === "running") {
      try {
        this.ctx.suspend();
      } catch (e) {
        /* fine */
      }
    }
  }
  wake() {
    this.asleep = false;
    this.resume();
  }

  resume() {
    if (this.asleep) return;
    if (this.ctx && this.ctx.state === "suspended") {
      try {
        this.ctx.resume();
      } catch (e) {
        /* a gesture will come */
      }
    }
  }

  start() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!this.ctx) this.ctx = new AC();
      const ctx = this.ctx;
      this.resume();
      this.out = ctx.createGain();
      this.out.gain.value = this.active ? 1 : 0;
      this.out.connect(ctx.destination);
      const sr = ctx.sampleRate;
      const noise = function (seconds) {
        const len = Math.floor(sr * seconds);
        const buf = ctx.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        return buf;
      };
      const clicks = function (seconds, rate) {
        const len = Math.floor(sr * seconds);
        const buf = ctx.createBuffer(1, len, sr);
        buf.getChannelData(0).set(clickTrain(len, sr, rate));
        return buf;
      };
      const self = this;
      const layer = function (buf, type, freq, q, gain) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        if (q) f.Q.value = q;
        const g = ctx.createGain();
        g.gain.value = gain;
        src.connect(f);
        f.connect(g);
        g.connect(self.out);
        src.start();
        self.nodes.push(src);
      };
      if (this.mode === "lofi") {
        layer(noise(3), "lowpass", 2400, 0, 0.012); // surface noise
        layer(noise(2), "lowpass", 70, 0, 0.05); // turntable rumble
        layer(clicks(5.3, 9), "highpass", 1200, 0, 0.16); // crackle
        layer(clicks(7.1, 0.6), "bandpass", 900, 0.8, 0.5); // the odd pop
      } else if (this.mode === "rain") {
        layer(noise(4), "bandpass", 1100, 0.4, 0.06); // the downpour
        layer(noise(3), "lowpass", 180, 0, 0.04); // distant rumble
        layer(clicks(6.7, 40), "bandpass", 3200, 0.7, 0.12); // drops on the glass
      } else if (this.mode === "tape") {
        layer(noise(3), "highpass", 3500, 0, 0.02);
        layer(noise(2), "lowpass", 120, 0, 0.02);
      }
    } catch (e) {
      /* no audio: the picture still works */
    }
  }

  stop() {
    this.nodes.forEach(function (n) {
      try {
        n.stop();
      } catch (e) {
        /* already stopped */
      }
    });
    this.nodes = [];
    if (this.out) {
      try {
        this.out.disconnect();
      } catch (e) {
        /* fine */
      }
    }
    this.out = null;
  }
}
