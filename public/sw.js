const CACHE_NAME = "forum-itsm-shell-v1";
const APP_SHELL = ["/", "/dashboard", "/manifest.webmanifest", "/icon"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // ITSM and tenant data must always be requested live. Never cache APIs.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then((response) => response || caches.match("/dashboard"))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (!response || response.status !== 200 || response.type !== "basic") return response;
      const copy = response.clone();
      void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      return response;
    })),
  );
});
