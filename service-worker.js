// SW（v2，抄 WeebPaint service-worker.js，家族 content-hash 形）：整个站只剩 1 个 hash-named bundle，缓存失效自动通过文件名差异解决。
// created 2026-09-03 by Claude Fable 5.1
//   - install：fetch index.html → 抠出当前 bundle 文件名 → precache 入口 + bundle + statics（含 RIME 词典 ~20MB：Quest 离线写作是产品前提）
//   - cache name = "xiaoheiwu-<bundleHash>"。新 bundle = 新 cache name；activate 清老的（含 v1 的 "xiaoheiwu-v81-…"）。
//   - prod(scope=/)：cache-first + 后台 revalidate（ETag 变了通知 page）；dev(scope 含 /dev/)：network-first（改完即见，离线回退缓存）。
//   - 7z-wasm / zip.js 不预缓存：用到才下，fetch handler 运行时缓存 → 用过一次即离线可用。

const STATIC_PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./styles.css",
  "./vendor/msal/msal-browser.min.js",
  "./vendor/my-rime/worker.js",
  "./vendor/my-rime/dist/rime.js",
  "./vendor/my-rime/dist/rime.wasm",
  "./vendor/my-rime/dist/rime.data",
  "./vendor/rime-contrib/luna-pinyin/luna_pinyin.prism.bin",
  "./vendor/rime-contrib/luna-pinyin/luna_pinyin.reverse.bin",
  "./vendor/rime-contrib/luna-pinyin/luna_pinyin.schema.yaml",
  "./vendor/rime-contrib/luna-pinyin/luna_pinyin.table.bin",
  "./vendor/rime-contrib/double-pinyin/double_pinyin.prism.bin",
  "./vendor/rime-contrib/double-pinyin/double_pinyin.schema.yaml",
  "./vendor/rime-contrib/stroke/stroke.prism.bin",
  "./vendor/rime-contrib/stroke/stroke.reverse.bin",
  "./vendor/rime-contrib/stroke/stroke.schema.yaml",
  "./vendor/rime-contrib/stroke/stroke.table.bin",
];

let CACHE_NAME = "xiaoheiwu-boot";
const SCOPE_IS_DEV = self.location.pathname.includes("/dev/");

async function getCurrentBundleUrl() {
  const res = await fetch("./index.html", { cache: "no-store" });
  if (!res.ok) throw new Error("install: index.html fetch failed " + res.status);
  const html = await res.text();
  // <script type="module" src="./dist/xiaoheiwu-<hash>.mjs"></script>（bundle 名与 scripts/build.sh 一致）
  const m = html.match(/src="(\.\/dist\/xiaoheiwu-[a-z0-9-]+\.mjs)"/i);
  if (!m) throw new Error("install: entry ./dist/xiaoheiwu-*.mjs not found in index.html");
  return { html, bundleUrl: m[1] };
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const { bundleUrl } = await getCurrentBundleUrl();
    const bundleHash = bundleUrl.match(/xiaoheiwu-([a-z0-9-]+)\.mjs/i)?.[1] || "boot";
    CACHE_NAME = `xiaoheiwu-${bundleHash}`;
    const cache = await caches.open(CACHE_NAME);
    const urls = [...STATIC_PRECACHE, bundleUrl, bundleUrl + ".map"];
    await Promise.all(urls.map((u) =>
      fetch(u, { cache: "no-store" })
        .then((r) => (r.ok ? cache.put(u, r) : null))
        .catch((err) => console.warn("[SW] precache miss", u, err.message)),
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("xiaoheiwu-") && k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

let updateAnnounced = false;
async function notifyUpdate(url) {
  if (updateAnnounced) return;
  updateAnnounced = true;
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const c of clients) c.postMessage({ type: "asset-updated", url });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!SCOPE_IS_DEV && url.pathname.includes("/dev/")) return;
  event.respondWith(SCOPE_IS_DEV ? networkFirst(req) : cacheFirst(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req, { ignoreSearch: true });
  const networkPromise = fetch(req).then((resp) => {
    if (resp && resp.ok) {
      if (cached) {
        const cE = cached.headers.get("etag"), fE = resp.headers.get("etag");
        const cL = cached.headers.get("content-length"), fL = resp.headers.get("content-length");
        const changed = (cE && fE && cE !== fE) || (!cE && cL && fL && cL !== fL);
        if (changed) notifyUpdate(req.url).catch(() => {});
      }
      cache.put(req, resp.clone()).catch(() => {});
    }
    return resp;
  }).catch(() => null);
  if (cached) { networkPromise.catch(() => {}); return cached; }
  const resp = await networkPromise;
  if (resp) return resp;
  return navFallback(req, cache);
}

// dev：network-first 带超时（半开 TCP / 强制门户下 fetch 会永远挂着——WeebPaint v417/v421 教训：超时只用来把「永远挂」变「有界失败」）。
const NETWORK_FIRST_TIMEOUT_MS = self.__NETWORK_FIRST_TIMEOUT_MS ?? 60000;
async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), NETWORK_FIRST_TIMEOUT_MS);
    let resp;
    try { resp = await fetch(req, { signal: ac.signal }); } finally { clearTimeout(timer); }
    if (resp && resp.ok) cache.put(req, resp.clone()).catch(() => {});
    return resp;
  } catch {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    return navFallback(req, cache);
  }
}

async function navFallback(req, cache) {
  if (req.mode === "navigate") {
    const fallback = await cache.match("./index.html");
    if (fallback) return fallback;
  }
  return new Response("offline & not cached", { status: 503 });
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "skip-waiting") self.skipWaiting();
});
