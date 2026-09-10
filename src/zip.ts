// 明文 zip 读写 = vendored zip.js（gildas-lormeau UMD → window.zip）。只给加密容器的外壳用；加解密走 .7z（sevenzip.ts）。
// created 2026-09-03 by Claude Fable 5.1（抄 WeebPaint src/backend/zip.ts；本仓**惰性注入** classic <script>：不加密的用户零加载）。

import { loadClassicScript } from "./load-script.ts";

type ZipLib = any;   // vendored UMD 无 .d.ts；实例只在本文件内流转
const VENDOR_JS = "./vendor/zip-js/zip-full.min.js";

async function Z(): Promise<ZipLib> {
  const g = globalThis as unknown as { zip?: ZipLib };
  if (!g.zip) await loadClassicScript(VENDOR_JS, () => !!(globalThis as unknown as { zip?: ZipLib }).zip);
  if (!g.zip) throw new Error("zip.js failed to load (window.zip missing)");
  // useCompressionStream:false = 走 zip.js 自带的 JS deflate（各浏览器同字节）；工程 zip 的确定性靠它 + 钉时间戳（ADR-0008）。
  try { g.zip.configure({ useWebWorkers: false, useCompressionStream: false }); } catch { /* idempotent */ }
  return g.zip;
}

function toZipReader(z: ZipLib, data: Blob | Uint8Array | ArrayBuffer | string) {
  if (data instanceof Blob) return new z.BlobReader(data);
  if (data instanceof Uint8Array) return new z.Uint8ArrayReader(data);
  if (data instanceof ArrayBuffer) return new z.Uint8ArrayReader(new Uint8Array(data));
  if (typeof data === "string") return new z.TextReader(data);
  throw new TypeError("zip: unsupported data type");
}

/** 已知压过的媒体走 STORE，其余 DEFLATE（ADR-0008 §6）。 */
const STORE_ONLY_RE = /\.(jpe?g|png|webp|gif|mp4|ora|zip|7z)$/i;
export const levelForPath = (path: string): number => (STORE_ONLY_RE.test(path) ? 0 : 6);
export interface ZipPackOpts {
  /** 每个 entry 的压缩档；不给 = 全 STORE（加密外壳的旧行为）。工程 zip 传 levelForPath。 */
  levelFor?: (path: string) => number;
  /** entry 时间戳；工程 zip 钉 1980-01-01 UTC 让同内容同字节（抄 WeebPaint ora）。不给 = now。 */
  lastModDate?: Date;
}
/** 一个 entry 的**已压缩**字节 + 写 local header 所需的三个数（ADR-0015 增量重打：未改的 entry 用 passThrough 原样塞回，不再 deflate）。 */
export interface RawEntry { data: Uint8Array; method: number; size: number; crc: number }
export interface ZipEntryIn { path: string; data: Uint8Array | string; /** 给了就 passThrough：忽略 data 与 level，原样写 raw（同内容同字节：raw 就是上次的确定性输出）。 */ raw?: RawEntry }
export async function zipPack(entries: ZipEntryIn[], opts: ZipPackOpts = {}): Promise<Blob> {
  const z = await Z();
  const writer = new z.ZipWriter(new z.BlobWriter("application/zip"));
  for (const { path, data, raw } of entries) {
    const o: Record<string, unknown> = raw ? { passThrough: true, compressionMethod: raw.method, uncompressedSize: raw.size, signature: raw.crc } : { level: opts.levelFor ? opts.levelFor(path) : 0 };
    if (opts.lastModDate) o.lastModDate = opts.lastModDate;
    await writer.add(path, raw ? new z.Uint8ArrayReader(raw.data) : toZipReader(z, data), o);
  }
  return await writer.close();
}
/** 只读已压缩字节（不 inflate；给 packProject 收割刚 deflate 过的 entry 用）。paths 不给 = 全部。 */
export async function zipReadRaw(blob: Blob, paths?: Iterable<string>): Promise<Record<string, RawEntry>> {
  const z = await Z();
  const want = paths ? new Set(paths) : null;
  const reader = new z.ZipReader(new z.BlobReader(blob));
  try {
    const out: Record<string, RawEntry> = {};
    for (const e of await reader.getEntries()) {
      if (e.directory || (want && !want.has(e.filename))) continue;
      out[e.filename] = { data: await e.getData(new z.Uint8ArrayWriter(), { passThrough: true }), method: e.compressionMethod, size: e.uncompressedSize, crc: e.signature };
    }
    return out;
  } finally { await reader.close(); }
}
/** 解包 + 每个 entry 的已压缩字节（unpackProject 用它把 raw 留进 rawCache）。 */
export async function zipUnpackRaw(blob: Blob): Promise<Record<string, { data: Uint8Array; raw: RawEntry }>> {
  const z = await Z();
  const reader = new z.ZipReader(new z.BlobReader(blob));
  try {
    const out: Record<string, { data: Uint8Array; raw: RawEntry }> = {};
    for (const e of await reader.getEntries()) {
      if (e.directory) continue;
      const raw: RawEntry = { data: await e.getData(new z.Uint8ArrayWriter(), { passThrough: true }), method: e.compressionMethod, size: e.uncompressedSize, crc: e.signature };
      out[e.filename] = { data: await e.getData(new z.Uint8ArrayWriter()), raw };
    }
    return out;
  } finally { await reader.close(); }
}

/** 只读一个 entry 的字节（按名；找不到 → null）。给 makePeek 抽封面用：不解整本书。 */
export async function zipReadEntry(blob: Blob, path: string): Promise<Uint8Array | null> {
  const z = await Z();
  const reader = new z.ZipReader(new z.BlobReader(blob));
  try {
    const entries = await reader.getEntries();
    const e = entries.find((x: { filename: string; directory: boolean }) => !x.directory && x.filename === path);
    return e ? await e.getData(new z.Uint8ArrayWriter()) : null;
  } finally { await reader.close(); }
}
export async function zipUnpack(blob: Blob): Promise<Record<string, Uint8Array>> {
  const z = await Z();
  const reader = new z.ZipReader(new z.BlobReader(blob));
  try {
    const entries = await reader.getEntries();
    const out: Record<string, Uint8Array> = {};
    for (const e of entries) { if (e.directory) continue; out[e.filename] = await e.getData(new z.Uint8ArrayWriter()); }
    return out;
  } finally { await reader.close(); }
}
