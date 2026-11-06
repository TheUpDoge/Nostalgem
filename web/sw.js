// Keeps a copy of the set itself (HTML, CSS, JS, fonts, lineup) so it still starts on a flaky
// connection. Programs stream from archive.org and are never cached.
const VERSION = "ng-1.0.0";
const SHELL = [
  "./",
  "index.html",
  "css/app.css",
  "js/main.js",
  "js/util.js",
  "js/schedule.js",
  "js/player.js",
  "js/static.js",
  "js/remote.js",
  "js/store.js",
  "js/archive.js",
  "js/captions.js",
  "js/ui/views.js",
  "js/ui/guide.js",
  "js/ui/menu.js",
  "js/ui/dialog.js",
  "data/lineup.json",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "fonts/orbitron-latin-500-normal.woff2",
  "fonts/orbitron-latin-700-normal.woff2",
  "fonts/orbitron-latin-900-normal.woff2",
  "fonts/vt323-latin-400-normal.woff2",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first, so a new version reaches the TV the next time it starts; the cached copy is the
// fallback when there's no connection.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match("index.html")))
  );
});
