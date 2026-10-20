/* ConPlus Site Reports — service worker.
   Keeps the app shell (the /site-reports page and its hashed bundles) so the
   installed app opens offline. Data still needs the network: Supabase calls
   are never cached. Navigations are network-first so a deploy shows up on the
   next open; bundles under /assets/ are content-hashed, so cache-first is safe. */
const VERSION = "sr-shell-v1";
const SHELL_URL = "/site-reports";
const SHELL = [SHELL_URL, "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, fonts, n8n: straight through

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && url.pathname === SHELL_URL) {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(SHELL_URL, copy));
          }
          return res;
        })
        .catch(() => caches.match(SHELL_URL).then((hit) => hit || Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((cache) => cache.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
