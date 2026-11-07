// Gamepad support for the TV UI: any standard controller (Xbox, PlayStation, or other)
// drives the remote. The button mapping and the press/repeat logic are pure and
// tested; the poller at the bottom is a thin shell around navigator.getGamepads.
//
// Standard Gamepad API layout: 0 A/cross, 1 B/circle, 2 X/square, 3 Y/triangle (next picture filter),
// 8 Back/Share, 9 Start/Options, 12–15 D-pad up/down/left/right, axes 0/1 left stick.

export const PAD = { A: 0, B: 1, X: 2, Y: 3, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
export const REPEAT_DELAY_MS = 500; // hold a direction this long before it starts repeating
export const REPEAT_MS = 350; // then repeat this often while held
export const STICK_DEAD_ZONE = 0.5; // ignore a stick barely off centre

export function actionForButton(i) {
  switch (i) {
    case 0:
      return "ok";
    case 1:
      return "back";
    case 2:
      return "playpause";
    case 3:
      return "look";
    case 8:
      return "back";
    case 9:
      return "menu";
    case 12:
      return "up";
    case 13:
      return "down";
    case 14:
      return "left";
    case 15:
      return "right";
    default:
      return null;
  }
}

export function newPadState() {
  return { prev: null, held: {} };
}

function isDown(snap, i) {
  return !!(snap && snap.buttons && snap.buttons[i]);
}

function stickDir(snap) {
  if (!snap || !snap.axes) return null;
  var x = snap.axes[0] || 0;
  var y = snap.axes[1] || 0;
  if (y < -STICK_DEAD_ZONE) return "up";
  if (y > STICK_DEAD_ZONE) return "down";
  if (x < -STICK_DEAD_ZONE) return "left";
  if (x > STICK_DEAD_ZONE) return "right";
  return null;
}

// One poll step: given the last snapshot and this one, which actions fire?
// Face buttons fire once per press. A held direction fires on press, then repeats
// after REPEAT_DELAY_MS, every REPEAT_MS — up/down only, so holding ◀ ▶ never
// re-opens the guide or the menu. state is a plain object the caller keeps.
export function padStep(state, snap, now) {
  var out = [];
  var prev = state.prev || null;
  var faces = [0, 1, 2, 3, 8, 9];
  for (var f = 0; f < faces.length; f++) {
    var bi = faces[f];
    if (isDown(snap, bi) && !isDown(prev, bi)) {
      var a = actionForButton(bi);
      if (a) out.push(a);
    }
  }
  var dirs = [
    ["up", 12],
    ["down", 13],
    ["left", 14],
    ["right", 15],
  ];
  for (var d = 0; d < dirs.length; d++) {
    var dir = dirs[d][0];
    var btn = dirs[d][1];
    var held = isDown(snap, btn) || stickDir(snap) === dir;
    var was = isDown(prev, btn) || stickDir(prev) === dir;
    var key = "dir:" + dir;
    if (held && !was) {
      state.held[key] = now + REPEAT_DELAY_MS;
      out.push(dir);
    } else if (!held) {
      delete state.held[key];
    } else if (held && (dir === "up" || dir === "down") && now >= state.held[key]) {
      state.held[key] = now + REPEAT_MS;
      out.push(dir);
    }
  }
  state.prev = snap;
  return out;
}

// Polls the first connected pad and calls onAction({ type }) for each action.
// No gamepad, or a browser without the Gamepad API: nothing happens, no errors.
// opts.onConnect(id) fires when a pad is plugged in.
export function createGamepad(onAction, opts) {
  var o = opts || {};
  var state = newPadState();
  var timer = 0;
  var raf = 0;

  function supported() {
    return typeof navigator !== "undefined" && typeof navigator.getGamepads === "function";
  }
  function snapshot() {
    if (!supported()) return null;
    var pads;
    try {
      pads = navigator.getGamepads();
    } catch (e) {
      return null;
    }
    if (!pads) return null;
    for (var i = 0; i < pads.length; i++) {
      var p = pads[i];
      if (!p || !p.connected) continue;
      var buttons = [];
      var raw = p.buttons || [];
      for (var b = 0; b < raw.length; b++) buttons.push(!!(raw[b] && raw[b].pressed));
      return { buttons: buttons, axes: p.axes || [] };
    }
    return null;
  }
  // Polls only while a pad is connected, so a TV with no controller isn't woken every frame.
  function frame() {
    raf = 0;
    timer = 0;
    var snap = snapshot();
    var actions = padStep(state, snap, Date.now());
    for (var i = 0; i < actions.length; i++) {
      try {
        onAction({ type: actions[i] });
      } catch (e) {
        /* a bad action handler must not kill the poller */
      }
    }
    if (snap) schedule();
    else state = newPadState();
  }
  function schedule() {
    if (raf || timer) return;
    if (typeof requestAnimationFrame === "function") raf = requestAnimationFrame(frame);
    else timer = setTimeout(frame, 100);
  }
  function onPadEvent(e) {
    if (!e || e.type !== "gamepadconnected") return;
    schedule();
    if (typeof o.onConnect === "function") {
      var id = "";
      if (e.gamepad && e.gamepad.id) id = String(e.gamepad.id);
      o.onConnect(id);
    }
  }
  return {
    start: function () {
      if (!supported()) return false;
      if (typeof window !== "undefined" && window.addEventListener) {
        window.addEventListener("gamepadconnected", onPadEvent);
        window.addEventListener("gamepaddisconnected", onPadEvent);
      }
      if (snapshot()) schedule();
      return true;
    },
    stop: function () {
      if (raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      raf = 0;
      timer = 0;
      if (typeof window !== "undefined" && window.removeEventListener) {
        window.removeEventListener("gamepadconnected", onPadEvent);
        window.removeEventListener("gamepaddisconnected", onPadEvent);
      }
    },
    connected: function () {
      return !!snapshot();
    },
  };
}
