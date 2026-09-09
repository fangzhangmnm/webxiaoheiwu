// service-worker.js 策略路由 mock 测（无浏览器/真机）：vm 载入 SW + mock self/caches/fetch/Response，
// 驱动 fetch 事件，断言 prod=cache-first、dev=network-first、prod 跳 /dev/、.glb/.gltf passthrough、
// 导航离线回退 index.html。修「/dev/ 无 SW → 闪退离线打不开」(docs/20260704-pwa-offline-dev-sw.md)
// 的回归守护 + .glb passthrough 红线守护（世界归 IDB sync，SW 不碰）。抄 WebPaint test/sw-strategy.test.mjs（RealHome 版去掉 .glb passthrough 断言）。
import { describe, it, assert, eq } from "./runner.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const SW_PATH = fileURLToPath(new URL("../service-worker.js", import.meta.url));
const ORIGIN = "https://x.test";

class MockResponse {
  constructor(body, init = {}) {
    this.body = body;
    this.status = init.status ?? 200;
    this.ok = this.status >= 200 && this.status < 400;
    this._h = init.headers ?? {};
  }
  clone() { return this; }
  get headers() {
    const h = this._h;
    if (h && typeof h.get === "function" && typeof h.forEach === "function") return h;   // 真 Headers（withNoStore 产出）
    return { get: (k) => h[k] ?? null, forEach: (fn) => { for (const k of Object.keys(h)) fn(h[k], k); } };
  }
}

// scopePath = SW 脚本自己的 pathname（决定 SCOPE_IS_DEV）。返回驱动句柄。
function loadSW(scopePath) {
  const handlers = {};
  const store = new Map();
  const cache = {
    match: async (reqOrStr) => store.get(typeof reqOrStr === "string" ? reqOrStr : reqOrStr.url) ?? null,
    put: async (reqOrStr, resp) => { store.set(typeof reqOrStr === "string" ? reqOrStr : reqOrStr.url, resp); },
  };
  let fetchImpl = async () => { throw new Error("offline"); };
  const ctxObj = {
    self: {
      location: { pathname: scopePath, origin: ORIGIN },
      addEventListener: (type, fn) => { handlers[type] = fn; },
      skipWaiting: async () => {},
      clients: { matchAll: async () => [], claim: async () => {} },
      registration: { scope: ORIGIN + "/" },
    },
    caches: { open: async () => cache, keys: async () => [], delete: async () => true, match: cache.match },
    fetch: (req) => fetchImpl(req),
    Response: MockResponse,
    Headers,   // #60-A withNoStore 用；真 SW 全局有
    URL, AbortController, setTimeout, clearTimeout,
    __NETWORK_FIRST_TIMEOUT_MS: 50,
    console: { warn() {}, log() {}, error() {} },
  };
  vm.createContext(ctxObj);
  vm.runInContext(readFileSync(SW_PATH, "utf8"), ctxObj);
  return {
    handlers, store,
    seed: (url, resp) => store.set(url, resp),
    setFetch: (fn) => { fetchImpl = fn; },
  };
}

// 驱动一次 fetch 事件 → 返回 SW 给出的 Response（早退/未 respondWith → null）。
async function drive(handlers, { url, mode = "navigate" }) {
  let p = null;
  const event = { request: { url, method: "GET", mode }, respondWith: (pr) => { p = pr; } };
  handlers.fetch(event);
  return p ? await p : null;
}

describe("service-worker · 策略路由 (prod cache-first / dev network-first)", () => {
  it("prod：在线命中缓存 → 服缓存（cache-first）", async () => {
    const sw = loadSW("/service-worker.js");
    sw.seed(`${ORIGIN}/index.html`, new MockResponse("CACHED"));
    sw.setFetch(async () => new MockResponse("NET"));
    const r = await drive(sw.handlers, { url: `${ORIGIN}/index.html` });
    eq(r.body, "CACHED", "prod 应优先服缓存");
  });

  it("prod：离线 + 有缓存 → 服缓存", async () => {
    const sw = loadSW("/service-worker.js");
    sw.seed(`${ORIGIN}/index.html`, new MockResponse("CACHED"));
    sw.setFetch(async () => { throw new Error("offline"); });
    const r = await drive(sw.handlers, { url: `${ORIGIN}/index.html` });
    eq(r.body, "CACHED", "离线服缓存");
  });

  it("prod：离线导航 + 无该 url 缓存 → 回退缓存的 index.html", async () => {
    const sw = loadSW("/service-worker.js");
    sw.seed("./index.html", new MockResponse("INDEX"));   // navFallback 用相对键
    sw.setFetch(async () => { throw new Error("offline"); });
    const r = await drive(sw.handlers, { url: `${ORIGIN}/some/route`, mode: "navigate" });
    eq(r.body, "INDEX", "导航离线回退 index.html 壳");
  });

  it("prod：跳过 /dev/ 请求（不 respondWith，留给 dev SW）", async () => {
    const sw = loadSW("/service-worker.js");
    sw.setFetch(async () => new MockResponse("NET"));
    const r = await drive(sw.handlers, { url: `${ORIGIN}/dev/index.html` });
    eq(r, null, "prod 根 SW 应放行 /dev/");
  });

  it("dev：在线 → 永远抓网最新（network-first，不服旧缓存）", async () => {
    const sw = loadSW("/dev/service-worker.js");
    sw.seed(`${ORIGIN}/dev/index.html`, new MockResponse("OLD"));
    sw.setFetch(async () => new MockResponse("NET"));
    const r = await drive(sw.handlers, { url: `${ORIGIN}/dev/index.html` });
    eq(r.body, "NET", "dev 在线必须拿最新（改完即见）");
  });

  it("dev：离线 + 有缓存 → 回退缓存（崩溃可离线重开）", async () => {
    const sw = loadSW("/dev/service-worker.js");
    sw.seed(`${ORIGIN}/dev/index.html`, new MockResponse("CACHED"));
    sw.setFetch(async () => { throw new Error("offline"); });
    const r = await drive(sw.handlers, { url: `${ORIGIN}/dev/index.html` });
    eq(r.body, "CACHED", "dev 离线回退缓存");
  });

  it("dev：离线导航 + 无该 url 缓存 → 回退 index.html 壳", async () => {
    const sw = loadSW("/dev/service-worker.js");
    sw.seed("./index.html", new MockResponse("INDEX"));
    sw.setFetch(async () => { throw new Error("offline"); });
    const r = await drive(sw.handlers, { url: `${ORIGIN}/dev/whatever`, mode: "navigate" });
    eq(r.body, "INDEX", "dev 导航离线回退 index.html");
  });

  it("dev：在线写穿缓存（下次离线能回退到刚抓的最新）", async () => {
    const sw = loadSW("/dev/service-worker.js");
    sw.setFetch(async () => new MockResponse("FRESH"));
    await drive(sw.handlers, { url: `${ORIGIN}/dev/index.html` });   // 在线一次 → cache.put
    assert(sw.store.get(`${ORIGIN}/dev/index.html`)?.body === "FRESH", "network-first 应顺手刷缓存");
  });

  // #60-A 同款（2026-09-09，对账 WeebPaint v0.14.4）：导航响应带 Cache-Control: no-store（WebKit 据此不把页面放进 bfcache——登录 redirect 离场时
  //   旧页不再冻着 IDB 锁）；子资源不带。只是 Safari 上的额外一层，承重在 store 0.12.1 闸门 + app pagehide 写门控。
  it("导航响应带 Cache-Control: no-store（prod 缓存命中 / dev 抓网 / 离线回退壳）；子资源不带", async () => {
    const prod = loadSW("/service-worker.js");
    prod.seed(`${ORIGIN}/index.html`, new MockResponse("CACHED", { headers: { etag: "e1" } }));
    prod.setFetch(async () => new MockResponse("NET"));
    const r1 = await drive(prod.handlers, { url: `${ORIGIN}/index.html`, mode: "navigate" });
    assert(r1.body === "CACHED" && r1.headers.get("Cache-Control") === "no-store", "prod 导航：缓存命中也带 no-store");
    assert(r1.headers.get("etag") === "e1", "原有头照抄");
    const sub = await drive(prod.handlers, { url: `${ORIGIN}/index.html`, mode: "no-cors" });
    assert(sub.headers.get("Cache-Control") === null, "子资源不加头");
    const dev = loadSW("/dev/service-worker.js");
    dev.setFetch(async () => new MockResponse("NET"));
    const r2 = await drive(dev.handlers, { url: `${ORIGIN}/dev/`, mode: "navigate" });
    assert(r2.body === "NET" && r2.headers.get("Cache-Control") === "no-store", "dev 导航：抓网响应也带");
    const off = loadSW("/service-worker.js");
    off.seed("./index.html", new MockResponse("INDEX"));
    off.setFetch(async () => { throw new Error("offline"); });
    const r3 = await drive(off.handlers, { url: `${ORIGIN}/some/route`, mode: "navigate" });
    assert(r3.body === "INDEX" && r3.headers.get("Cache-Control") === "no-store", "离线回退壳也带");
  });
});
