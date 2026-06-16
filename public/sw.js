const CACHE = "linkoteca-v22";
const ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icons/arrow-up-right.svg",
  "/icons/badge-check.svg",
  "/icons/check.svg",
  "/icons/clock-3.svg",
  "/icons/cloud.svg",
  "/icons/copy.svg",
  "/icons/download-cloud.svg",
  "/icons/external-link.svg",
  "/icons/folder-open.svg",
  "/icons/folder.svg",
  "/icons/globe.svg",
  "/icons/github.svg",
  "/icons/library.svg",
  "/icons/link.svg",
  "/icons/move-right.svg",
  "/icons/panel-left.svg",
  "/icons/play.svg",
  "/icons/plus.svg",
  "/icons/refresh-cw.svg",
  "/icons/search.svg",
  "/icons/settings.svg",
  "/icons/smartphone.svg",
  "/icons/sparkles.svg",
  "/icons/tag.svg",
  "/icons/trash.svg",
  "/icons/upload-cloud.svg",
  "/icons/x.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return;
  if (event.request.mode === "navigate" || ["/", "/index.html", "/app.js", "/styles.css", "/manifest.webmanifest"].includes(url.pathname)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
