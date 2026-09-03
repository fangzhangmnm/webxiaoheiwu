// .7z 加密原语 = vendored 7z-wasm（真 7-Zip 编译成 wasm；vendor/7z-wasm/）。抄 WeebPaint src/sevenzip.ts。
// created 2026-09-03 by Claude Fable 5.1
// 容器 payload 用它做（AES-256 + 强 KDF + 加密头 -mhe）→ 用户拿 7-Zip 输密码就能直接恢复（anti-abandonware，ADR-0012）。
// **惰性加载**：wasm 1.6MB，绝不在 boot 拉；首次加解密才注入脚本 + fetch wasm（SW 运行时缓存 → 之后离线可用）。
// node 测试经 setSevenZipLoader 注入 node 版 loader。

import { loadClassicScript } from "./load-script.ts";
import type { SevenZipModuleFactory } from "../vendor/7z-wasm/index.d.ts";

interface SevenZipConfig { factory: SevenZipModuleFactory; wasmBinary: ArrayBuffer }
type SevenZipLoader = () => Promise<SevenZipConfig>;

const VENDOR_JS = "./vendor/7z-wasm/7zz.umd.js";
const VENDOR_WASM = "./vendor/7z-wasm/7zz.wasm";

let _loader: SevenZipLoader = _defaultBrowserLoader;
let _cached: SevenZipConfig | null = null;

export function setSevenZipLoader(fn: SevenZipLoader): void { _loader = fn; _cached = null; }

async function _defaultBrowserLoader(): Promise<SevenZipConfig> {
  const g = globalThis as unknown as { SevenZip?: SevenZipModuleFactory };
  await loadClassicScript(VENDOR_JS, () => !!g.SevenZip);
  const factory = g.SevenZip;
  if (!factory) throw new Error("7z-wasm factory not mounted (window.SevenZip)");
  const resp = await fetch(VENDOR_WASM);
  if (!resp.ok) throw new Error("7z-wasm wasm failed to load: " + resp.status);
  return { factory, wasmBinary: await resp.arrayBuffer() };
}

async function _instance() {
  if (!_cached) _cached = await _loader();
  const { factory, wasmBinary } = _cached;
  return await factory({ print: () => {}, printErr: () => {}, wasmBinary });
}

type SevenZipData = Uint8Array | ArrayBuffer | string;
interface WrongPasswordError extends Error { code?: string }
const _UTF8 = new TextEncoder();
function _toU8(d: SevenZipData): Uint8Array {
  if (d instanceof Uint8Array) return d;
  if (d instanceof ArrayBuffer) return new Uint8Array(d);
  if (typeof d === "string") return _UTF8.encode(d);
  throw new TypeError("7z: unsupported data type");
}

/** 打包加密 .7z：-t7z AES-256 · -mhe=on 加密头 · -mx=0 STORE。 */
export async function pack7z(entries: { path: string; data: SevenZipData }[], password: string): Promise<Uint8Array> {
  if (!password) throw new Error("cannot encrypt without a password");
  const sz = await _instance();
  const names: string[] = [];
  for (const { path, data } of entries) { sz.FS.writeFile("/" + path, _toU8(data)); names.push("/" + path); }
  try { sz.callMain(["a", "-t7z", "-mx=0", "-mhe=on", "-p" + password, "-bso0", "-bse0", "/out.7z", ...names]); }
  catch { /* Emscripten exit() may throw ExitStatus; judge by output */ }
  let out: Uint8Array | null = null;
  try { out = sz.FS.readFile("/out.7z"); } catch { out = null; }
  if (!out || !out.length) throw new Error("7z pack failed (no output)");
  return out;
}

/** 解 .7z → { path: Uint8Array }。密码错 / 文件坏 → throw code=WRONG_PASSWORD（-mhe 加密头：错密码连目录都列不出）。 */
export async function unpack7z(bytes: SevenZipData, password: string): Promise<Record<string, Uint8Array>> {
  const sz = await _instance();
  sz.FS.writeFile("/in.7z", _toU8(bytes));
  sz.FS.mkdir("/out");
  try { sz.callMain(["x", "-p" + password, "-y", "-bso0", "-bse0", "/in.7z", "-o/out"]); } catch { /* judge by output */ }
  let files: string[];
  try { files = sz.FS.readdir("/out").filter((n: string) => n !== "." && n !== ".."); } catch { files = []; }
  const out: Record<string, Uint8Array> = {};
  for (const name of files) {
    try {
      const stat = sz.FS.stat("/out/" + name);
      if (sz.FS.isDir(stat.mode)) continue;
      out[name] = sz.FS.readFile("/out/" + name);
    } catch { /* skip */ }
  }
  if (!Object.keys(out).length) {
    const e: WrongPasswordError = new Error("wrong password or corrupted file"); e.code = "WRONG_PASSWORD"; throw e;
  }
  return out;
}
