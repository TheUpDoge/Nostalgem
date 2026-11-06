// Snow between channels: a tiny canvas of noise, scaled up, plus an optional hiss.
// Drawn at 160x90 and capped at ~30 fps so it stays cheap on TV processors.

export class Static {
  constructor(canvas) {
    this.c = canvas;
    this.w = 160;
    this.h = 90;
    canvas.width = this.w;
    canvas.height = this.h;
    this.ctx = canvas.getContext("2d");
    this.img = this.ctx ? this.ctx.createImageData(this.w, this.h) : null;
    this.until = 0;
    this.held = false;
    this.raf = 0;
    this.last = 0;
    this.sound = true;
    this.audio = null;
    this.noiseBuf = null;
  }

  // Show snow for at least `ms`.
  burst(ms) {
    this.until = Math.max(this.until, now() + (ms || 350));
    this.start();
    if (this.sound) this.hiss(Math.min(ms || 350, 600));
  }

  // Keep snowing until release(): while a channel is still tuning.
  hold() {
    this.held = true;
    this.start();
  }

  release() {
    this.held = false;
  }

  start() {
    if (!this.img) return;
    this.c.classList.add("on");
    if (!this.raf) {
      const self = this;
      this.raf = requestAnimationFrame(function (t) {
        self.frame(t);
      });
    }
  }

  frame(t) {
    this.raf = 0;
    if (!this.held && now() >= this.until) {
      this.c.classList.remove("on");
      return;
    }
    if (t - this.last > 33) {
      this.last = t;
      const d = this.img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
        d[i + 3] = 255;
      }
      this.ctx.putImageData(this.img, 0, 0);
    }
    const self = this;
    this.raf = requestAnimationFrame(function (tt) {
      self.frame(tt);
    });
  }

  // Needs a user gesture first in most browsers; until then it stays silent.
  hiss(ms) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!this.audio) this.audio = new AC();
      const ctx = this.audio;
      if (ctx.state === "suspended") ctx.resume();
      if (!this.noiseBuf) {
        const len = Math.floor(ctx.sampleRate * 0.6);
        this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const ch = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      }
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 3200;
      filter.Q.value = 0.6;
      const gain = ctx.createGain();
      const t0 = ctx.currentTime;
      const dur = ms / 1000;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.06, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start(t0);
      src.stop(t0 + dur + 0.05);
    } catch (e) {
      /* no audio: that's fine */
    }
  }
}

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
