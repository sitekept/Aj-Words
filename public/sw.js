const CACHE_NAME = "aj-words-v5";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

const cacheFirst = async (request) => {
  const cached = await caches.match(request);

  if (cached) {
    return cached;
  }

  const response = await fetch(request);

  // Only cache a response that actually succeeded. Without this check a 404 or
  // a 502 served during a deploy was cached and then replayed to the user until
  // CACHE_NAME changed — `staleWhileRevalidate` below already guards the same
  // way. On a beta where installs land mid-deploy, that is a real way to strand
  // someone on a broken page.
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }

  return response;
};

const staleWhileRevalidate = async (request) => {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const fetched = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }

      return response;
    })
    .catch(() => undefined);

  if (cached) {
    return cached;
  }

  return fetched.then((response) => response || fetch(request));
};

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (url.pathname.startsWith("/_next/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Same guard as cacheFirst: an error page must never be stored as the
          // app shell, or every later offline load would serve it.
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          }

          return response;
        })
        .catch(() => caches.match(request).then((match) => match || caches.match("/")))
    );
    return;
  }

  if (url.pathname.startsWith("/icons/") || url.pathname === "/apple-touch-icon.png") {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (url.pathname === "/manifest.webmanifest") {
    event.respondWith(cacheFirst(request));
  }
});
