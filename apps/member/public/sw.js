/*
 * Offline shell for the installed member app (audit M7, PRD section 15).
 *
 * - Pages (navigations): network first; without a connection, the cached app shell.
 * - Hashed code, fonts and images under /_expo/static and /assets never change, so they are
 *   served from the cache once fetched.
 * - Nothing else is cached: member data from Supabase is on another origin and is never
 *   stored here, so a shared phone keeps no one's messages or profile in this cache.
 */
const CACHE = "kc-shell-v1";
const SHELL = [
  "/",
  "/manifest.json",
  "/icons/logo-splash.jpg",
  "/icons/icon-192.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

const immutable = (url) =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith("/_expo/static/") || url.pathname.startsWith("/assets/"));

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put("/", copy));
          }
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  if (immutable(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
