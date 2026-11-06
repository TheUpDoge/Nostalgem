// Small helpers shared by the app and the lineup builder (Node 18+).
// Written for older TV browsers too: no optional chaining, no nullish operators, no class fields.

// FNV-1a: a stable 32-bit hash, so every TV computes the same schedule.
export function hash32(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Seeded random numbers (mulberry32): same seed, same shuffle, on every machine.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, rand) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

// Moves items so the same show doesn't air twice in a row, where that's possible.
export function spreadApart(list, keyOf) {
  const a = list.slice();
  for (let i = 1; i < a.length; i++) {
    if (keyOf(a[i]) !== keyOf(a[i - 1])) continue;
    for (let j = i + 1; j < a.length; j++) {
      if (keyOf(a[j]) !== keyOf(a[i - 1])) {
        const t = a[i];
        a[i] = a[j];
        a[j] = t;
        break;
      }
    }
  }
  return a;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function pad2(n) {
  return (n < 10 ? "0" : "") + n;
}

export function fmtClock(date, h24) {
  let h = date.getHours();
  const m = pad2(date.getMinutes());
  if (h24) return pad2(h) + ":" + m;
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return h + ":" + m + " " + ap;
}

export function fmtDuration(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? h + ":" + pad2(m) + ":" + pad2(r) : m + ":" + pad2(r);
}

export function fmtLeft(sec) {
  const m = Math.max(1, Math.ceil(sec / 60));
  if (m >= 60) return Math.floor(m / 60) + "h " + (m % 60) + "m left";
  return m + " min left";
}

export function fmtRuntime(sec) {
  const m = Math.round(sec / 60);
  if (m < 1) return Math.round(sec) + " sec";
  if (m >= 60) return Math.floor(m / 60) + " hr " + (m % 60 ? (m % 60) + " min" : "");
  return m + " min";
}

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return ESC[c];
  });
}

// Runs fn over list with at most `limit` calls in flight.
export async function mapLimit(list, limit, fn) {
  let next = 0;
  const workers = [];
  const n = Math.max(1, Math.min(limit, list.length));
  for (let w = 0; w < n; w++) {
    workers.push(
      (async function () {
        while (next < list.length) {
          const i = next++;
          await fn(list[i], i);
        }
      })()
    );
  }
  await Promise.all(workers);
}

export function slugify(s) {
  return (
    String(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "channel"
  );
}
