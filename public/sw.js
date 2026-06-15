const CACHE_NAME = "droplink-cache-v2";
const ASSETS = [
  "/",
  "/index.html",
  "/share.html",
  "/css/style.css",
  "/js/app.js",
  "/js/share.js",
  "/js/modules/api.js",
  "/js/modules/utils.js",
  "/favicon.svg",
  "/manifest.json"
];

// Install Service Worker
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate Service Worker
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch static assets from Cache-First, fallback to Network
self.addEventListener("fetch", (e) => {
  // Skip non-GET requests (e.g. POST multipart file uploads)
  if (e.request.method !== "GET") return;

  // Skip API calls to allow real-time server verification
  if (e.request.url.includes("/api/")) return;

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then((response) => {
        // Cache new static resources successfully fetched
        if (response && response.status === 200 && response.type === "basic") {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return response;
      });
    })
  );
});
