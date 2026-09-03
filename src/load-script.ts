// 惰性注入 vendored classic <script>（UMD 全局挂载型库：zip.js / 7z-wasm）。created 2026-09-03 by Claude Fable 5.1
// 同一 URL 只注入一次；已挂载（ready() 为真）直接返回。SW 的 fetch handler 对同源 GET 运行时缓存 → 用过一次即离线可用。
const _inflight = new Map<string, Promise<void>>();
export function loadClassicScript(url: string, ready: () => boolean): Promise<void> {
  if (ready()) return Promise.resolve();
  let p = _inflight.get(url);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = url;
      s.onload = () => resolve();
      s.onerror = () => { _inflight.delete(url); reject(new Error(`script failed to load: ${url} (offline and never cached?)`)); };
      document.head.appendChild(s);
    });
    _inflight.set(url, p);
  }
  return p;
}
