// Where the set gets its lineup. The website serves data/lineup.json next to itself. The TV app ships a
// copy inside the APK, which only changes when the app is rebuilt, while the published lineup is rebuilt
// every day (new uploads, live streams that restarted). So the app asks the website first, keeps the
// last copy it got, and otherwise uses the newest lineup it has.

// What this version of the app understands. A lineup with a higher number needs a newer app, so an
// older app keeps using the lineup it has. 1: Archive programs. 2: YouTube programs, live streams and
// sub-channels.
export const LINEUP_FORMAT = 2;

const CACHE = "ng-lineup";

export function usable(lineup) {
  return !!lineup && typeof lineup === "object" && Array.isArray(lineup.channels) && lineup.channels.length > 0 && (Number(lineup.format) || 1) <= LINEUP_FORMAT;
}

export function builtAt(lineup) {
  const t = Date.parse(lineup && lineup.built);
  return isFinite(t) ? t : 0;
}

// The most recently built usable lineup of those given (nulls are fine); the first one wins a tie.
export function newest(list) {
  let best = null;
  list.forEach(function (l) {
    if (usable(l) && (!best || builtAt(l) > builtAt(best))) best = l;
  });
  return best;
}

// fetch() with a time limit, so a slow network can't hold up the boot screen.
export function fetchJsonTimed(url, ms) {
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timer = 0;
  const timeout = new Promise(function (ok, fail) {
    timer = setTimeout(function () {
      if (ctl) ctl.abort();
      fail(new Error("timed out"));
    }, ms || 8000);
  });
  const req = fetch(url, { credentials: "omit", cache: "no-cache", signal: ctl ? ctl.signal : undefined }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  });
  return Promise.race([req, timeout]).then(
    function (v) {
      clearTimeout(timer);
      return v;
    },
    function (e) {
      clearTimeout(timer);
      throw e;
    }
  );
}

// The last lineup fetched from the web, kept with the Cache Storage API (no size worries, unlike
// localStorage). Either can be missing; then there is simply no saved copy.
export const browserStore = {
  get: function (url) {
    if (typeof caches === "undefined") return Promise.resolve(null);
    return caches
      .open(CACHE)
      .then(function (c) {
        return c.match(url);
      })
      .then(function (r) {
        return r ? r.json() : null;
      })
      .catch(function () {
        return null;
      });
  },
  put: function (url, lineup) {
    if (typeof caches === "undefined") return Promise.resolve();
    return caches
      .open(CACHE)
      .then(function (c) {
        return c.put(url, new Response(JSON.stringify(lineup), { headers: { "content-type": "application/json" } }));
      })
      .catch(function () {
        /* no room or no Cache Storage: next start asks the web again */
      });
  },
};

// opts: { bundled: url, live: url or "", timeout: ms, fetchJson(url, ms), store: { get(url), put(url, l) } }
// Resolves to { lineup, source: "web" | "saved" | "bundled" }, or null when there is nothing usable at all.
export function loadLineup(opts) {
  const fetchJson = opts.fetchJson || fetchJsonTimed;
  const store = opts.store || browserStore;
  const none = function () {
    return null;
  };
  const bundled = fetchJson(opts.bundled, 15000).catch(none);
  if (!opts.live) {
    return bundled.then(function (b) {
      return usable(b) ? { lineup: b, source: "bundled" } : null;
    });
  }
  // A new URL every hour, so a cache along the way can't hand back yesterday's lineup.
  const fresh = opts.live + (opts.live.indexOf("?") < 0 ? "?" : "&") + "h=" + Math.floor(Date.now() / 3600000);
  const live = fetchJson(fresh, opts.timeout || 8000).catch(none);
  return live.then(function (web) {
    const got = usable(web);
    if (got) store.put(opts.live, web);
    return Promise.all([bundled, got ? null : store.get(opts.live)]).then(function (rest) {
      const b = rest[0];
      const saved = rest[1];
      const pick = newest([web, saved, b]);
      if (!pick) return null;
      return { lineup: pick, source: pick === web ? "web" : pick === saved ? "saved" : "bundled" };
    });
  });
}
