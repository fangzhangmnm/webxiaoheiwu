// 内置字体（兜底）：思源黑体 / Noto Sans SC Regular，全量、gzip 压着放在 vendor/fonts/sans.ttf.gz（出处与许可证见该目录 README）。
// created 2026-09-30 by Claude Fable 5.1。user 2026-09-30「先做黑体…编辑器也统一用这个」「还是全量兜底吧，别的语言也兜底，就用全量但是压缩」。
//   一份字节三处用：编辑器（FontFace 进文档，CSS `--font-editor` 第一位就是它）、长图（canvas 认同一个 family）、PDF（ttf.ts 取子集嵌进去）。
//   不挡启动：字体没到之前 CSS 自然落到后面的系统字体；到了浏览器自己重排，app 再把稿纸几何重量一遍（调用方的事）。
//   不留字节：装进文档那一路用完就放手（10 MB）；PDF 要字节时再取一次（SW / HTTP 缓存里有）。
import { gunzipSync } from "../vendor/fflate/fflate.esm.js";

/** CSS 里用的 family 名（styles.css `--font-editor` 的第一位）。按角色起名，不带品牌。 */
export const SANS_FAMILY = "XHW Sans";

async function gunzip(b: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== "undefined") {
    try { return new Uint8Array(await new Response(new Blob([b as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()); }
    catch { /* 流式解不了就同步解 */ }
  }
  return gunzipSync(b);
}
/** 取字体字节（TTF）。拿不到（文件不在 / 离线且没缓存）→ null。每次调用都重新取——调用方自己决定留不留。 */
export async function loadSansBytes(): Promise<Uint8Array | null> {
  try {
    const r = await fetch("./vendor/fonts/sans.ttf.gz");
    if (!r.ok) return null;
    const b = new Uint8Array(await r.arrayBuffer());
    return b[0] === 0x1f && b[1] === 0x8b ? await gunzip(b) : b;   // 有的主机会替 .gz 加 Content-Encoding 先解掉：看魔数，别解两次
  } catch { return null; }
}
let installed: Promise<boolean> | null = null;
/** 把字体装进文档。只做一次；装好 → true，拿不到 / 浏览器不支持 → false（界面照旧用系统字体）。 */
export function installSansFont(): Promise<boolean> {
  return (installed ??= (async () => {
    if (typeof FontFace === "undefined" || typeof document === "undefined") return false;
    const bytes = await loadSansBytes(); if (!bytes) return false;
    try {
      const face = new FontFace(SANS_FAMILY, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
      await face.load(); document.fonts.add(face);
      return true;
    } catch (e) { console.warn("[fonts] built-in font failed to load", e); return false; }
  })());
}
