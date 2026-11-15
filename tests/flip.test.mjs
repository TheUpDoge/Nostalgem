// The Reading Room's page-turn sound: the soft page (0.15 s of noise through a 1200 → 800 Hz band, Q 0.7,
// fading as (1 − t)², quiet), played only when the reader's sound setting says so.
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis.window || {};
const { FLIP, rustle, Reader } = await import("../web/js/ui/reader.js");

// A stand-in for the browser's audio: records what the sound is made of.
function fakeAudio() {
  const log = { buffers: [], filters: [], gains: [], started: 0 };
  const node = () => ({ connect() {} });
  return {
    log,
    sampleRate: 48000,
    currentTime: 10,
    state: "running",
    destination: node(),
    createBuffer(ch, len, rate) {
      const data = new Float32Array(len);
      const b = { len, rate, getChannelData: () => data, data };
      log.buffers.push(b);
      return b;
    },
    createBufferSource() {
      return Object.assign(node(), { start() { log.started++; } });
    },
    createBiquadFilter() {
      const f = Object.assign(node(), { type: "", Q: { value: 0 }, ramps: [], frequency: { setValueAtTime: (v, t) => f.ramps.push(["set", v, t]), exponentialRampToValueAtTime: (v, t) => f.ramps.push(["ramp", v, t]) } });
      log.filters.push(f);
      return f;
    },
    createGain() {
      const g = Object.assign(node(), { gain: { value: 0 } });
      log.gains.push(g);
      return g;
    },
  };
}

test("the soft page: 0.15 s, 1200 → 800 Hz, Q 0.7, (1 − t)², no louder than before", () => {
  assert.deepEqual([FLIP.seconds, FLIP.from, FLIP.to, FLIP.q, FLIP.decay], [0.15, 1200, 800, 0.7, 2]);
  assert.ok(FLIP.gain > 0 && FLIP.gain <= 0.09);
  const a = fakeAudio();
  rustle(a);
  const b = a.log.buffers[0];
  assert.equal(b.len, Math.floor(48000 * 0.15));
  const f = a.log.filters[0];
  assert.equal(f.type, "bandpass");
  assert.equal(f.Q.value, 0.7);
  assert.deepEqual(f.ramps[0], ["set", 1200, 10]);
  assert.equal(f.ramps[1][0], "ramp");
  assert.equal(f.ramps[1][1], 800);
  assert.ok(f.ramps[1][2] > 10 && f.ramps[1][2] <= 10.15);
  assert.equal(a.log.gains[0].gain.value, FLIP.gain);
  assert.equal(a.log.started, 1);
  // It fades as (1 − t)²: the last quarter is far quieter than the first.
  const avg = (from, to) => {
    let sum = 0;
    for (let i = from; i < to; i++) sum += Math.abs(b.data[i]);
    return sum / (to - from);
  };
  const q = Math.floor(b.len / 4);
  assert.ok(avg(b.len - q, b.len) < avg(0, q) / 4);
});

test("a page turn plays it only when the reader's sound setting is on", () => {
  const a = fakeAudio();
  rustle(a); // the reader's sound now goes to this stand-in
  const before = a.log.started;
  let on = false;
  const r = Object.create(Reader.prototype);
  r.o = { sound: () => on };
  r.render = r.hud = r.mark = () => {}; // the page itself isn't on screen here
  r.turned("next");
  assert.equal(a.log.started, before, "sound off: silent");
  on = true;
  r.turned("next");
  assert.equal(a.log.started, before + 1, "sound on: one soft page");
});
