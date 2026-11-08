// Keeps an eye on the frame rate while a heavy picture filter is on. Some TVs can't run a filter over
// full-screen video: the picture stutters and the remote feels slow. When the frame rate stays low, the
// app switches that filter to its lighter version (main.js, Menu ▸ Filter quality).

const WINDOW_MS = 3000; // one measurement
const WARMUP = 1; // windows ignored after a filter goes on (it's still setting up)
const SLOW_FPS = 20; // below this the picture is visibly choppy
const SLOW_WINDOWS = 2; // this many slow windows in a row

// The verdict on a run of measurements (frames per second, oldest first): slow when the last
// SLOW_WINDOWS after the warm-up were all below SLOW_FPS.
export function tooSlow(fps) {
  const counted = fps.slice(WARMUP);
  if (counted.length < SLOW_WINDOWS) return false;
  return counted.slice(-SLOW_WINDOWS).every(function (f) {
    return f < SLOW_FPS;
  });
}

export class FrameWatch {
  // onSlow(key): the filter named key kept the frame rate down.
  constructor(onSlow) {
    this.onSlow = onSlow;
    this.key = "";
    this.raf = 0;
    this.fps = [];
    this.last = 0; // the latest measurement, for Menu ▸ Filter quality and tests
  }

  // key: the heavy filter on screen now, or "" (nothing heavy, paused, a menu up…). Cheap to call often.
  watch(key) {
    if (key === this.key) return;
    this.stop();
    this.key = key;
    if (!key || typeof requestAnimationFrame !== "function") return;
    const self = this;
    let frames = 0;
    let start = 0;
    let prev = 0;
    const frame = function (t) {
      if (self.key !== key) return;
      // A very long gap is the page being hidden or the TV busy elsewhere, not the filter: start over.
      if (!start || t - prev > 4000) {
        start = t;
        frames = 0;
      }
      prev = t;
      frames++;
      if (t - start >= WINDOW_MS) {
        const f = (frames * 1000) / (t - start);
        self.last = Math.round(f);
        self.fps.push(f);
        frames = 0;
        start = t;
        if (tooSlow(self.fps)) {
          self.stop();
          self.key = key; // don't start watching the same filter again
          self.onSlow(key);
          return;
        }
      }
      self.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.key = "";
    this.fps = [];
  }
}
