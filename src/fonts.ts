// 内置字体：全量、gzip 压着放在 vendor/fonts/（出处与许可证见该目录 README）。created 2026-09-30 by Claude Fable 5.1；2026-10-01 加第二款。
//   sans   = 思源黑体 / Noto Sans SC Regular（兜底；user 2026-09-30「先做黑体…编辑器也统一用这个」「还是全量兜底吧，别的语言也兜底，就用全量但是压缩」）。
//            一份字节三处用：编辑器（FontFace，CSS `--font-editor` 第一位）、长图（canvas 认同一个 family）、PDF（ttf.ts 取子集嵌进去）。开机就装，不挡启动。
//   pinyin = 萌神手写体（汉字头上带拼音的注音字体；user 2026-10-01「萌神拼音也vendor进去吧，导出的时候还蛮需要的」）。**只给导出用**（长图 / PDF），
//            编辑器不用它；12 MB，选了才取、才装。
//   不留字节：装进文档那一路用完就放手；PDF 要字节时再取一次（SW / HTTP 缓存里有）。
import { gunzipSync } from "../vendor/fflate/fflate.esm.js";

export type FontId = "sans" | "pinyin";
/** CSS / canvas 里用的 family 名。按角色起名，不带品牌。 */
export const FONT_FAMILY: Record<FontId, string> = { sans: "XHW Sans", pinyin: "XHW Pinyin" };
export const SANS_FAMILY = FONT_FAMILY.sans;

async function gunzip(b: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== "undefined") {
    try { return new Uint8Array(await new Response(new Blob([b as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()); }
    catch { /* 流式解不了就同步解 */ }
  }
  return gunzipSync(b);
}
/** 取字体字节（TTF）。拿不到（文件不在 / 离线且没缓存）→ null。每次调用都重新取——调用方自己决定留不留。 */
export async function loadFontBytes(id: FontId): Promise<Uint8Array | null> {
  try {
    const r = id === "pinyin" ? await fetch("./vendor/fonts/pinyin.ttf.gz") : await fetch("./vendor/fonts/sans.ttf.gz");   // 相对路径写成字面量（红线守卫认这个）
    if (!r.ok) return null;
    const b = new Uint8Array(await r.arrayBuffer());
    return b[0] === 0x1f && b[1] === 0x8b ? await gunzip(b) : b;   // 有的主机会替 .gz 加 Content-Encoding 先解掉：看魔数，别解两次
  } catch { return null; }
}
const installed = new Map<FontId, Promise<boolean>>();
/** 把字体装进文档。每款只做一次；装好 → true，拿不到 / 浏览器不支持 → false（装失败的下次调用会重试）。 */
export function installFont(id: FontId): Promise<boolean> {
  let p = installed.get(id);
  if (!p) {
    p = (async () => {
      if (typeof FontFace === "undefined" || typeof document === "undefined") return false;
      const bytes = await loadFontBytes(id); if (!bytes) return false;
      try {
        const face = new FontFace(FONT_FAMILY[id], bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
        await face.load(); document.fonts.add(face);
        return true;
      } catch (e) { console.warn("[fonts] built-in font failed to load", id, e); return false; }
    })();
    installed.set(id, p);
    void p.then((ok) => { if (!ok) installed.delete(id); });
  }
  return p;
}
export const loadSansBytes = (): Promise<Uint8Array | null> => loadFontBytes("sans");
export const installSansFont = (): Promise<boolean> => installFont("sans");
