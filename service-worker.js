// Bump CACHE_VERSION whenever any precached asset changes. The activate
// handler wipes older caches; skipWaiting + clientsClaim make the new SW
// take over on the next reload (no need to close all tabs).
const CACHE_VERSION = "v21-2026-05-17-idleoverlay";
const CACHE_NAME = `xiaoheiwu-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./src/app.js",
  "./src/auth.js",
  "./src/db.js",
  "./src/ime.js",
  "./src/onedrive.js",
  "./src/styles.css",
  "./src/sync.js",
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
// next reload picks up changes. When that background fetch turns up a new
// ETag (i.e. the file actually changed on the server), notify the page so
// it can show a non-blocking "new version available" hint — never reload
// automatically since the user might be mid-sentence.

let updateAnnouncedThisLoad = false;

async function notifyUpdate(url) {
  if (updateAnnouncedThisLoad) return;
  updateAnnouncedThisLoad = true;
  const clientsList = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clientsList) {
    client.postMessage({ type: "asset-updated", url });
  }
}

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
            if (cached) {
              const cachedEtag = cached.headers.get("etag");
              const freshEtag = response.headers.get("etag");
              const cachedLen = cached.headers.get("content-length");
              const freshLen = response.headers.get("content-length");
              const changed =
                (cachedEtag && freshEtag && cachedEtag !== freshEtag) ||
                (!cachedEtag && cachedLen && freshLen && cachedLen !== freshLen);
              if (changed) {
                notifyUpdate(request.url).catch(() => {});
              }
            }
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

// Allow page to push us to activate on demand (e.g. on its "refresh" click).
self.addEventListener("message", (event) => {
  if (event.data?.type === "skip-waiting") {
    self.skipWaiting();
  }
});
