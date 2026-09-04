// ASR worker：模型包的下载/校验/缓存/挂载 + sherpa-onnx WASM 解码，全部在 worker 里跑（Quest 上 3–8 s 的 SHA-256/解码不冻编辑器）。
// 主线程只经 src/asr/engine.ts 发消息。created 2026-09-03 by Claude Fable 5.1
//
//   · 信任根 = 内嵌 manifest（packs.generated.ts）：分片从「模型源 URL / 用户自传文件」来都先对 chunks[].sha256 再入缓存；对不上整包拒收。
//   · 缓存 = Cache Storage `pwa-models`（家族共享名；key 是本 origin 下的合成路径 /__pwa-models__/<slug>/<chunk>，永不真的去 fetch 它）。
//     可再生派生缓存（user 2026-09-03 批）；redline-guard 白名单在此文件。
//   · 挂载 = 按文件预分配 buffer → 从缓存逐片拷入 → FS.createDataFile(canOwn=true) 零拷贝进 MEMFS → 建识别器 → unlink。
//   · 黄线区：本文件是 app 里唯一允许 fetch 非相对 URL 的地方（模型源，只读、校验）。
import { Sha256 } from "./sha256.ts";
import { PACK_MANIFESTS, type PackManifest } from "./packs.generated.ts";
import type { AsrRequest, AsrResponse, PackProgress, PackStatus, LoadResult, DecodeResult, AsrLang } from "./protocol.ts";
import { MODEL_CACHE_NAME, ASR_WASM_DIR } from "../config.ts";

// sherpa-onnx 的 emscripten 胶水 + JS 包装（importScripts 挂全局）
declare const SherpaOnnx: (opts: Record<string, unknown>) => Promise<SherpaModule>;
declare function createOnlineRecognizer(m: SherpaModule, cfg: unknown): Recognizer;
declare const OfflineRecognizer: new (cfg: unknown, m: SherpaModule) => Recognizer;
interface SherpaModule { FS: EmFS; HEAPU8: Uint8Array }
interface EmFS { mkdir(p: string): void; createDataFile(parent: string, name: string, data: Uint8Array, r: boolean, w: boolean, own: boolean): void; unlink(p: string): void }
interface Stream { acceptWaveform(rate: number, samples: Float32Array): void; inputFinished?(): void; free(): void }
interface Recognizer {
  handle: number; createStream(): Stream; decode(s: Stream): void; getResult(s: Stream): { text: string }; free(): void;
  isReady?(s: Stream): boolean; setConfig?(cfg: unknown): void;
}

const WASM_BASE = new URL("../" + ASR_WASM_DIR, self.location.href).href;   // dist/asr-worker-*.js → ../vendor/sherpa-onnx-wasm/
const post = (m: AsrResponse) => (self as unknown as Worker).postMessage(m);
const keyOf = (slug: string, name: string) => `${self.location.origin}/__pwa-models__/${slug}/${name}`;
const manifestOf = (slug: string): { packId: string; manifest: PackManifest } => {
  const p = PACK_MANIFESTS[slug];
  if (!p) throw new Error(`unknown pack: ${slug}`);
  return p;
};

let modulePromise: Promise<SherpaModule> | null = null;
function ensureModule(): Promise<SherpaModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      importScripts(WASM_BASE + "sherpa-onnx-wasm-web.js", WASM_BASE + "sherpa-onnx-asr.js");
      return SherpaOnnx({ locateFile: (p: string) => WASM_BASE + p, print: (s: string) => console.log("[sherpa]", s), printErr: (s: string) => console.warn("[sherpa]", s) });
    })().catch((e) => { modulePromise = null; throw e; });
  }
  return modulePromise;
}

// ── 缓存面 ──
async function cachedChunkSizes(slug: string, m: PackManifest): Promise<number[]> {
  const cache = await caches.open(MODEL_CACHE_NAME);
  const sizes: number[] = [];
  for (const c of m.chunks) {
    const r = await cache.match(keyOf(slug, c.name));
    sizes.push(r ? Number(r.headers.get("content-length") ?? 0) : 0);
  }
  return sizes;
}
async function putChunk(slug: string, name: string, bytes: Uint8Array): Promise<void> {
  const cache = await caches.open(MODEL_CACHE_NAME);
  await cache.put(keyOf(slug, name), new Response(bytes, { headers: { "content-length": String(bytes.length), "content-type": "application/octet-stream" } }));
}
async function markVerified(slug: string, packId: string): Promise<void> {
  const cache = await caches.open(MODEL_CACHE_NAME);
  await cache.put(keyOf(slug, "verified.json"), new Response(JSON.stringify({ packId, at: new Date().toISOString() }), { headers: { "content-type": "application/json" } }));
}
async function status(slug: string): Promise<PackStatus> {
  const { packId, manifest: m } = manifestOf(slug);
  const cache = await caches.open(MODEL_CACHE_NAME);
  const sizes = await cachedChunkSizes(slug, m);
  const complete = sizes.every((n, i) => n === m.chunks[i]!.bytes);
  const marker = await cache.match(keyOf(slug, "verified.json"));
  const verified = marker ? ((await marker.json()) as { packId?: string }).packId === packId : false;
  return { slug, ready: complete && verified, bytesCached: sizes.reduce((a, b) => a + b, 0), bytesTotal: m.totalBytes };
}

async function download(slug: string, base: string, progress: (p: PackProgress) => void): Promise<PackStatus> {
  const { packId, manifest: m } = manifestOf(slug);
  const sizes = await cachedChunkSizes(slug, m);
  let done = sizes.reduce((a, n, i) => a + (n === m.chunks[i]!.bytes ? n : 0), 0);
  progress({ done, total: m.totalBytes });
  for (let i = 0; i < m.chunks.length; i++) {
    const c = m.chunks[i]!;
    if (sizes[i] === c.bytes) continue;
    const res = await fetch(`${base}/packs/${slug}/${c.name}`, { cache: "no-store" });
    if (!res.ok || !res.body) throw new Error(`fetch ${c.name}: HTTP ${res.status}`);
    const reader = res.body.getReader(); const sha = new Sha256(); const buf = new Uint8Array(c.bytes); let got = 0;
    for (;;) {
      const { value, done: end } = await reader.read(); if (end) break;
      if (got + value.length > c.bytes) throw new Error(`${c.name}: larger than manifest says`);
      sha.update(value); buf.set(value, got); got += value.length;
      progress({ done: done + got, total: m.totalBytes });
    }
    if (got !== c.bytes) throw new Error(`${c.name}: got ${got} bytes, expected ${c.bytes}`);
    const h = sha.hex();
    if (h !== c.sha256) throw new Error(`${c.name}: sha256 mismatch (source tampered or corrupted)`);
    await putChunk(slug, c.name, buf);
    done += got;
  }
  await markVerified(slug, packId);
  return status(slug);
}

/** 用户自传：单个整文件（= files 按序拼接的 .bin，size 必须等于 totalBytes）或多个 chunk-NNN 文件。 */
async function importFiles(slug: string, files: File[], progress: (p: PackProgress) => void): Promise<PackStatus> {
  const { packId, manifest: m } = manifestOf(slug);
  const byName = new Map(files.map((f) => [f.name, f] as const));
  const whole = files.length === 1 && files[0]!.size === m.totalBytes ? files[0]! : null;
  let offset = 0, done = 0;
  for (const c of m.chunks) {
    const blob = whole ? whole.slice(offset, offset + c.bytes) : byName.get(c.name);
    if (!blob) throw new Error(`missing ${c.name} (select the whole .bin or every chunk file)`);
    if (blob.size !== c.bytes) throw new Error(`${c.name}: size ${blob.size}, expected ${c.bytes}`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (new Sha256().update(bytes).hex() !== c.sha256) throw new Error(`${c.name}: sha256 mismatch (wrong or corrupted file)`);
    await putChunk(slug, c.name, bytes);
    offset += c.bytes; done += c.bytes; progress({ done, total: m.totalBytes });
  }
  await markVerified(slug, packId);
  return status(slug);
}

async function deletePack(slug: string): Promise<void> {
  if (loaded?.slug === slug) unload();
  const { manifest: m } = manifestOf(slug);
  const cache = await caches.open(MODEL_CACHE_NAME);
  for (const c of m.chunks) await cache.delete(keyOf(slug, c.name));
  await cache.delete(keyOf(slug, "verified.json"));
}

// ── 识别器 ──
let loaded: { slug: string; rec: Recognizer; kind: "offline" | "online"; lang: AsrLang; cfg: Record<string, unknown> } | null = null;

function unload(): void { if (loaded) { try { loaded.rec.free(); } catch { /* ignore */ } loaded = null; } }

function buildConfig(m: PackManifest, dir: string, lang: AsrLang): { kind: "offline" | "online"; cfg: Record<string, unknown> } {
  const cfg = JSON.parse(JSON.stringify(m.engineConfig)) as Record<string, unknown> & { type: "offline" | "online"; modelConfig: Record<string, unknown> };
  const mc = cfg.modelConfig;
  for (const k of Object.keys(mc)) {
    const v = mc[k];
    if (v && typeof v === "object") { const o = v as Record<string, unknown>; for (const kk of Object.keys(o)) if (typeof o[kk] === "string" && o[kk] && kk !== "language") o[kk] = `${dir}/${o[kk] as string}`; }
  }
  mc.tokens = `${dir}/${mc.tokens as string}`;
  const sv = mc.senseVoice as { language?: string } | undefined;
  if (sv) sv.language = lang;
  const kind = cfg.type; delete (cfg as { type?: unknown }).type;
  return { kind, cfg };
}

async function load(slug: string, lang: AsrLang): Promise<LoadResult> {
  const Module = await ensureModule();
  if (loaded?.slug === slug) { setLang(lang); return { slug, alreadyLoaded: true, createMs: 0, wasmHeapMB: Math.round(Module.HEAPU8.length / 1048576) }; }
  const st = await status(slug);
  if (!st.ready) throw new Error("pack-missing");
  unload();
  const { manifest: m } = manifestOf(slug);
  const cache = await caches.open(MODEL_CACHE_NAME);
  const bufs = m.files.map((f) => new Uint8Array(f.bytes));
  let offset = 0;
  for (const c of m.chunks) {
    const r = await cache.match(keyOf(slug, c.name));
    if (!r) throw new Error("pack-missing");
    const bytes = new Uint8Array(await r.arrayBuffer());
    let pos = 0;
    while (pos < bytes.length) {
      const abs = offset + pos;
      const fi = m.files.findIndex((f) => abs >= f.offset && abs < f.offset + f.bytes);
      if (fi < 0) throw new Error(`chunk ${c.name} overflows manifest`);
      const f = m.files[fi]!, n = Math.min(f.offset + f.bytes - abs, bytes.length - pos);
      bufs[fi]!.set(bytes.subarray(pos, pos + n), abs - f.offset); pos += n;
    }
    offset += bytes.length;
  }
  const dir = `/packs/${slug}`;
  try { Module.FS.mkdir("/packs"); } catch { /* exists */ }
  try { Module.FS.mkdir(dir); } catch { /* exists */ }
  m.files.forEach((f, i) => Module.FS.createDataFile(dir, f.path, bufs[i]!, true, true, true));
  const { kind, cfg } = buildConfig(m, dir, lang);
  const t0 = performance.now();
  const rec = kind === "online" ? createOnlineRecognizer(Module, cfg) : new OfflineRecognizer(cfg, Module);
  const createMs = Math.round(performance.now() - t0);
  for (const f of m.files) { try { Module.FS.unlink(`${dir}/${f.path}`); } catch { /* ignore */ } }
  if (!rec.handle) throw new Error("recognizer creation failed (see [sherpa] console output)");
  loaded = { slug, rec, kind, lang, cfg };
  return { slug, alreadyLoaded: false, createMs, wasmHeapMB: Math.round(Module.HEAPU8.length / 1048576) };
}

function setLang(lang: AsrLang): void {
  if (!loaded || loaded.lang === lang) return;
  const mc = loaded.cfg.modelConfig as { senseVoice?: { language?: string } };
  if (mc.senseVoice && loaded.rec.setConfig) { mc.senseVoice.language = lang; loaded.rec.setConfig(loaded.cfg); }
  loaded.lang = lang;
}

function decode(samples: Float32Array, lang: AsrLang): DecodeResult {
  if (!loaded) throw new Error("no model loaded");
  setLang(lang);
  const { rec, kind } = loaded;
  const t0 = performance.now();
  const s = rec.createStream();
  let text = "";
  try {
    if (kind === "offline") { s.acceptWaveform(16000, samples); rec.decode(s); text = rec.getResult(s).text; }
    else {
      const step = 1600;
      for (let i = 0; i < samples.length; i += step) { s.acceptWaveform(16000, samples.subarray(i, Math.min(i + step, samples.length))); while (rec.isReady!(s)) rec.decode(s); }
      s.acceptWaveform(16000, new Float32Array(8000)); s.inputFinished!(); while (rec.isReady!(s)) rec.decode(s);
      text = rec.getResult(s).text;
    }
  } finally { s.free(); }
  return { text, computeMs: Math.round(performance.now() - t0), audioMs: Math.round(samples.length / 16) };
}

// ── 消息泵（严格串行：wasm 单线程，请求排队） ──
let chain: Promise<unknown> = Promise.resolve();
self.onmessage = (e: MessageEvent<AsrRequest>) => {
  const req = e.data;
  const progress = (p: PackProgress) => post({ id: req.id, progress: p });
  chain = chain.then(async () => {
    try {
      let result: unknown;
      switch (req.op) {
        case "status": result = await status(req.slug); break;
        case "download": result = await download(req.slug, req.base, progress); break;
        case "import": result = await importFiles(req.slug, req.files, progress); break;
        case "delete": await deletePack(req.slug); result = null; break;
        case "load": result = await load(req.slug, req.lang); break;
        case "decode": result = decode(req.samples, req.lang); break;
        case "unload": unload(); result = null; break;
      }
      post({ id: req.id, ok: true, result });
    } catch (err) {
      post({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
};
