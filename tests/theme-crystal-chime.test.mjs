// Crystal Signal's ident: one short chime, silent when muted or blocked, and a second call replaces the first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHIME, crystalChime, stopCrystalChime } from "../web/js/crystal-chime.js";

function param() {
  return {
    value: 1,
    cancelScheduledValues() {},
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setTargetAtTime() {},
  };
}

function fakeContext(state) {
  const osc = [];
  const ctx = {
    state: state,
    currentTime: 1,
    sampleRate: 8000,
    destination: {},
    resume() {
      return Promise.resolve();
    },
    createGain() {
      return { gain: param(), connect() {} };
    },
    createOscillator() {
      const o = {
        type: "",
        frequency: param(),
        started: 0,
        stopped: 0,
        connect() {},
        start() {
          o.started++;
        },
        stop() {
          o.stopped++;
        },
      };
      osc.push(o);
      return o;
    },
    createBiquadFilter() {
      return { type: "", frequency: param(), Q: { value: 1 }, connect() {} };
    },
    createBuffer(_ch, len) {
      const data = [new Float32Array(len), new Float32Array(len)];
      return {
        getChannelData(i) {
          return data[i];
        },
      };
    },
    createBufferSource() {
      const s = { buffer: null, connect() {}, start() {}, stop() {} };
      return s;
    },
    createConvolver() {
      return { buffer: null, connect() {} };
    },
    createDynamicsCompressor() {
      return { threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 1 }, attack: { value: 0 }, release: { value: 0 }, connect() {} };
    },
  };
  return { ctx, osc };
}

test("the ident is a short four-note chime after the sparkle", () => {
  assert.ok(CHIME.seconds >= 1.5 && CHIME.seconds <= 2.5, CHIME.seconds);
  assert.equal(CHIME.notes.length, 4);
  assert.ok(CHIME.notes[0].at >= 0.35 && CHIME.notes[0].at < 0.8);
  const end = CHIME.notes[CHIME.notes.length - 1].at + 1.05;
  assert.ok(end <= 2.5, "rings out by " + end);
  for (let i = 1; i < CHIME.notes.length; i++) assert.ok(CHIME.notes[i].freq > CHIME.notes[i - 1].freq);
});

test("muted, silent, or a blocked context plays nothing", async () => {
  const blocked = fakeContext("suspended");
  crystalChime({ muted: true, volume: 1, context: blocked.ctx });
  assert.equal(blocked.osc.length, 0);
  crystalChime({ muted: false, volume: 0, context: blocked.ctx });
  assert.equal(blocked.osc.length, 0);
  crystalChime({ context: blocked.ctx });
  await new Promise((ok) => setTimeout(ok, 20));
  assert.equal(blocked.osc.length, 0, "still suspended after resume");
  assert.doesNotThrow(() => crystalChime({ muted: false, context: null }));
});

test("a running context plays once, and a second call stops the first", () => {
  const first = fakeContext("running");
  crystalChime({ muted: false, volume: 0.5, context: first.ctx });
  assert.ok(first.osc.length >= 4, "bells and pings: " + first.osc.length);
  assert.ok(first.osc.every((o) => o.started === 1 && o.stopped === 1), "each voice is started and given an end");
  const second = fakeContext("running");
  crystalChime({ volume: 1, context: second.ctx });
  assert.ok(first.osc.every((o) => o.stopped === 2), "the first ident was stopped");
  assert.ok(second.osc.every((o) => o.started === 1 && o.stopped === 1));
  stopCrystalChime();
  assert.ok(second.osc.every((o) => o.stopped === 2));
});
