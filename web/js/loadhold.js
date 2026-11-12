// How long a loading card may stay up after it appears. Tune this one number.
// The card still waits out the minimum (passed in; the app's existing delay) and a
// short grace after the picture is really ready, and it always clears by this cap
// so a dead stream cannot hold the screen.
export const LOAD_CARD_HOLD = 9000;
export const LOAD_CARD_GRACE = 800;

// A picture is really on the way: a playing mode, plus a painted frame, advancing
// time, or enough media buffered. If the player cannot report any of those, the
// old behavior stands: "playing" is enough.
export function pictureReady(p) {
  if (!p || !p.playing) return false;
  if (p.signals === false) return true;
  if (p.frame) return true;
  if (typeof p.currentTime === "number" && typeof p.lastTime === "number" && p.currentTime > p.lastTime + 0.02) return true;
  if (typeof p.readyState === "number" && p.readyState >= 3) return true;
  return false;
}

// now, shownAt: when the card appeared. readyAt: when it first became ready (0 if not yet).
// minMs: the shortest the card stays up. Returns { hide, readyAt, wait }.
export function loadCardDecision(now, shownAt, readyAt, ready, minMs) {
  const min = minMs > 0 ? minMs : 0;
  if (!(shownAt > 0)) return { hide: false, readyAt: 0, wait: 0 };
  const cap = shownAt + LOAD_CARD_HOLD;
  if (now >= cap) return { hide: true, readyAt: readyAt || 0, wait: 0 };
  let at = readyAt || 0;
  if (!at && ready) at = now;
  if (!at) return { hide: false, readyAt: 0, wait: Math.min(250, cap - now) };
  const due = Math.min(cap, Math.max(shownAt + min, at + LOAD_CARD_GRACE));
  if (now >= due) return { hide: true, readyAt: at, wait: 0 };
  return { hide: false, readyAt: at, wait: due - now };
}
