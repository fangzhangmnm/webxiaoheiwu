// Bump CACHE_VERSION whenever any precached asset changes. The activate
// handler wipes older caches; skipWaiting + clientsClaim make the new SW
// take over on the next reload (no need to close all tabs).
const CACHE_VERSION = "v12-2026-05-16-renamededupe";
const CACHE_NAME = `xiaoheiwu-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./src/app.js",
  "./src/db.js",
  "./src/ime.js",
  "./src/styles.css",
  "./src/vendor/my-rime/worker.js",
  "./src/vendor/my-rime/dist/rime.js",
  "./src/vendor/my-rime/dist/rime.wasm",
  "./src/vendor/my-rime/dist/rime.data",
  "./src/vendor/rime-contrib/luna-pinyin/luna_pinyin.prism.bin",
  "./src/vendor/rime-contrib/luna-pinyin/luna_pinyin.reverse.bin",
  "./src/vendor/rime-contrib/luna-pinyin/luna_pinyin.schema.yaml",
  "./src/vendor/rime-contrib/luna-pinyin/luna_pinyin.table.bin",
  "./src/vendor/rime-contrib/double-pinyin/double_pinyin.prism.bin",
  "./src/vendor/rime-contrib/double-pinyin/double_pinyin.schema.yaml",
  "./src/vendor/rime-contrib/stroke/stroke.prism.bin",
  "./src/vendor/rime-contrib/stroke/stroke.reverse.bin",
  "./src/vendor/rime-contrib/stroke/stroke.schema.yaml",
  "./src/vendor/rime-contrib/stroke/stroke.table.bin",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE_URLS);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("xiaoheiwu-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

// Cache-first with background revalidate. App shell loads instantly from
// cache; network fetch in the background refreshes the cached copy so the
// next reload picks up changes (when CACHE_VERSION hasn't been bumped yet).
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);

      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            cache.put(request, response.clone()).catch(() => {});
          }
          return response;
        })
        .catch(() => null);

      if (cached) {
        networkFetch.catch(() => {});
        return cached;
      }

      const response = await networkFetch;
      if (response) {
        return response;
      }
      return new Response("Offline and not cached.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    })(),
  );
});
