// Keeps a copy of the set itself (HTML, CSS, JS, fonts, lineup) so it still starts on a flaky
// connection. Programs stream from archive.org and are never cached.
const VERSION = "ng-1.11.0";
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
  "js/link.js",
  "js/lineup.js",
  "js/youtube.js",
  "js/phone.js",
  "js/problems.js",
  "js/regions.js",
  "js/tzcountry.js",
  "js/about.js",
  "js/packs.js",
  "js/bumpers.js",
  "js/gamepad.js",
  "js/intro.js",
  "js/arcade.js",
  "js/southpark.js",
  "js/linkout.js",
  "js/looks.js",
  "js/fxcanvas.js",
  "js/framewatch.js",
  "js/citywire.js",
  "js/ambience.js",
  "js/relay.js",
  "js/ui/numpad.js",
  "js/ui/drag.js",
  "js/ui/club.js",
  "js/library.js",
  "js/books.js",
  "js/secrets.js",
  "js/church.js",
  "js/cuts.js",
  "js/zip.js",
  "js/changes.js",
  "js/ui/reader.js",
  "js/ui/stacks.js",
  "remote.html",
  "about.html",
  "remote.webmanifest",
  "css/phone.css",
  "vendor/peerjs.min.js",
  "vendor/qrcode.js",
  "data/lineup.json",
  "data/bumpers.json",
  "data/books.json",
  "data/library-catalog.json",
  "data/skip-lists.json",
  "manifest.webmanifest",
  "favicon.ico",
  "icons/favicon-32.png",
  "icons/apple-touch-icon.png",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/boot-gem.webp",
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
      .catch(() =>
        caches
          .match(e.request, { ignoreSearch: true })
          .then((hit) => hit || caches.match(/\/remote(\.html)?$/.test(url.pathname) ? "remote.html" : "index.html"))
      )
  );
});
