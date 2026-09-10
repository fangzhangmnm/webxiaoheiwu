// node 测试用 zip.js 装载器（抄 WeebPaint test/zip-node.mjs；src/zip.ts 的 Z() 在 call-time 查 globalThis.zip，预挂好就不走 loadClassicScript）。
import fs from "node:fs";
export function ensureZipLoaded() {
  globalThis.window = globalThis.window || globalThis;
  if (globalThis.zip && globalThis.zip.ZipWriter) return;
  const code = fs.readFileSync(new URL("../vendor/zip-js/zip-full.min.js", import.meta.url), "utf8");
  const exp = {};
  new Function("exports", "module", "define", code).call(globalThis, exp, { exports: exp }, undefined);
  if (!exp.ZipWriter) throw new Error("vendored zip.js failed to load");
  globalThis.zip = exp; globalThis.window.zip = exp;
}
