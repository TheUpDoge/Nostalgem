// The start-up turn-on: a CRT waking up, then the station ident.
//
// It is a picture on top of the set, not a gate. The tuner starts as soon as the lineup is in; this
// only decides when the picture over it should leave. Any key or tap skips it. Its own noise follows
// the set's mute and the Channel static setting (With hiss / Silent / Off). The snow is a few still
// frames on a tiny canvas, then it stops: a TV bogs down on a canvas that keeps repainting.

export var TURN_ON_MS = 3400;
export var TURN_ON_STILL_MS = 800;
export var SNOW_CAP_W = 160;
export var SNOW_CAP_H = 90;
export var SNOW_MAX_DPR = 1;
// Three stills, then nothing. Offsets from the first draw, in ms.
export var SNOW_FRAMES = [0, 90, 180];

export function turnOnDuration(still) {
  return still ? TURN_ON_STILL_MS : TURN_ON_MS;
}

// prefers-reduced-motion: the beam stays packed away and the ident is already there.
export function prefersStill(match) {
  try {
    var q = match("(prefers-reduced-motion: reduce)");
    return !!(q && q.matches);
  } catch (e) {
    return false;
  }
}

// The turn-on's own noise. Mute wins, and so does Channel static set to Silent or Off:
// the set already decided it doesn't hiss.
export function introAudible(opt) {
  return !!(opt && !opt.muted && opt.staticFx === "sound");
}

// Channel static Off: no snow between channels, and none in the turn-on either.
export function showBootSnow(staticFx) {
  return staticFx !== "off";
}

// What a press does while the turn-on is up.
// "skip": the press only dismisses it (Back must not also arm "press again to exit").
// "both": dismiss it and do the press (OK, channel up, mute).
// "run": the turn-on is already gone.
export function turnOnAction(active, type) {
  if (!active) return "run";
  if (type === "back") return "skip";
  return "both";
}

// Backing store for the snow. Cap the buffer and the device pixel ratio so a 4K TV
// doesn't allocate a full-screen canvas for a texture CSS is going to scale up anyway.
export function snowBufferSize(cssW, cssH, dpr) {
  var ratio = Number(dpr);
  if (!(ratio > 0)) ratio = 1;
  if (ratio > SNOW_MAX_DPR) ratio = SNOW_MAX_DPR;
  var w = Math.round((Number(cssW) > 0 ? Number(cssW) : SNOW_CAP_W) * ratio);
  var h = Math.round((Number(cssH) > 0 ? Number(cssH) : SNOW_CAP_H) * ratio);
  if (w < 1) w = 1;
  if (h < 1) h = 1;
  if (w > SNOW_CAP_W || h > SNOW_CAP_H) {
    var k = Math.min(SNOW_CAP_W / w, SNOW_CAP_H / h);
    w = Math.max(1, Math.round(w * k));
    h = Math.max(1, Math.round(h * k));
  }
  return { w: w, h: h, dpr: ratio };
}

export function snowPixels(w, h, rand) {
  var r = rand || Math.random;
  var data = new Uint8ClampedArray(w * h * 4);
  var i;
  var v;
  for (i = 0; i < data.length; i += 4) {
    v = (r() * 255) | 0;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  return data;
}

// Schedules the overlay. Callers tune on their own; lineupReady() only means the picture
// underneath is allowed to be uncovered. onFinish runs once, when it should leave.
// onWait runs if it's skipped before there's a lineup yet (hold a still ident, no beam).
export function createTurnOn(env) {
  var duration = env.duration > 0 ? env.duration : TURN_ON_MS;
  var t0 = env.now();
  var skipped = false;
  var ready = false;
  var done = false;
  var timers = [];
  var sound = null;

  function later(fn, ms) {
    var id = env.schedule(fn, ms);
    timers.push(id);
    return id;
  }
  function clearTimers() {
    var i;
    for (i = 0; i < timers.length; i++) env.cancel(timers[i]);
    timers = [];
  }
  function stopSound() {
    if (!sound) return;
    try {
      sound.stop();
    } catch (e) {
      /* already stopped */
    }
    sound = null;
  }
  function finish() {
    if (done || !ready) return;
    if (!skipped && env.now() - t0 < duration) return;
    done = true;
    clearTimers();
    stopSound();
    env.onFinish(skipped);
  }

  if (env.audible && env.audible()) {
    try {
      sound = env.playSound ? env.playSound() : null;
    } catch (e) {
      sound = null;
    }
  }
  later(finish, duration);

  return {
    active: function () {
      return !done;
    },
    lineupReady: function () {
      ready = true;
      finish();
    },
    skip: function () {
      if (done || skipped) return;
      skipped = true;
      stopSound();
      // Drop the snow frames and the end timer. lineupReady() finishes on its own once a
      // channel can play; nothing should keep drawing until then.
      clearTimers();
      if (!ready && env.onWait) env.onWait();
      finish();
    },
    arm: function (fn, ms) {
      return later(fn, ms);
    },
  };
}

function tone(ctx, master, at, freq, dur, type, peak) {
  var o = ctx.createOscillator();
  var g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g);
  g.connect(master);
  o.start(at);
  o.stop(at + dur + 0.02);
}

function noise(ctx, master, at, dur, peak, hz) {
  var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  var buf = ctx.createBuffer(1, len, ctx.sampleRate);
  var data = buf.getChannelData(0);
  var i;
  for (i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  var src = ctx.createBufferSource();
  src.buffer = buf;
  var filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = hz;
  var g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(at);
  src.stop(at + dur + 0.02);
}

// Relay thump, a short hiss, a lock click. Scheduled once; stop() cuts it off.
// Browsers may keep the context suspended until a gesture: then this stays silent, which is fine.
export function playTurnOnSound() {
  var AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  var ctx;
  try {
    ctx = new AC();
  } catch (e) {
    return null;
  }
  var master = ctx.createGain();
  master.gain.value = 0.2;
  master.connect(ctx.destination);
  var t = ctx.currentTime + 0.02;
  if (ctx.state === "suspended") {
    var resumed = ctx.resume();
    if (resumed && resumed.catch) resumed.catch(function () {});
  }
  tone(ctx, master, t, 55, 0.32, "sine", 0.85);
  tone(ctx, master, t, 110, 0.18, "triangle", 0.16);
  noise(ctx, master, t + 0.85, 0.28, 0.1, 2200);
  noise(ctx, master, t + 1.5, 0.045, 0.16, 800);
  var stopped = false;
  return {
    stop: function () {
      if (stopped) return;
      stopped = true;
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(0.0001, ctx.currentTime);
      } catch (e) {
        /* context already closed */
      }
      try {
        ctx.close();
      } catch (e2) {
        /* already closed */
      }
    },
  };
}
