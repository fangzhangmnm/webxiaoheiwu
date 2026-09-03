// 明文 zip 读写 = vendored zip.js（gildas-lormeau UMD → window.zip）。只给加密容器的外壳用；加解密走 .7z（sevenzip.ts）。
// created 2026-09-03 by Claude Fable 5.1（抄 WeebPaint src/backend/zip.ts；本仓**惰性注入** classic <script>：不加密的用户零加载）。

import { loadClassicScript } from "./load-script.ts";

type ZipLib = any;   // vendored UMD 无 .d.ts；实例只在本文件内流转
const VENDOR_JS = "./vendor/zip-js/zip-full.min.js";

async function Z(): Promise<ZipLib> {
  const g = globalThis as unknown as { zip?: ZipLib };
  if (!g.zip) await loadClassicScript(VENDOR_JS, () => !!(globalThis as unknown as { zip?: ZipLib }).zip);
  if (!g.zip) throw new Error("zip.js failed to load (window.zip missing)");
  try { g.zip.configure({ useWebWorkers: false }); } catch { /* idempotent */ }
  return g.zip;
}

function toZipReader(z: ZipLib, data: Blob | Uint8Array | ArrayBuffer | string) {
  if (data instanceof Blob) return new z.BlobReader(data);
  if (data instanceof Uint8Array) return new z.Uint8ArrayReader(data);
  if (data instanceof ArrayBuffer) return new z.Uint8ArrayReader(new Uint8Array(data));
  if (typeof data === "string") return new z.TextReader(data);
  throw new TypeError("zip: unsupported data type");
}

export async function zipPack(entries: { path: string; data: Uint8Array | string }[]): Promise<Blob> {
  const z = await Z();
  const writer = new z.ZipWriter(new z.BlobWriter("application/zip"));
  for (const { path, data } of entries) await writer.add(path, toZipReader(z, data), { level: 0 });
  return await writer.close();
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
