// 图片解码 / 编码接缝（app 域唯一；ADR-0013 管线家规抄 WeebPaint：解码边界 = 浏览器解码器 + canvas **读出一次**，之后全字节；重采样 = gallery 包的面积平均；编码 = vendored jpeg-js / UPNG）。
// created 2026-09-10 by Claude Fable 5.1（user 2026-09-10「weebpaint 管线如果不贵就可以」：jpeg-js 22 KB + UPNG 48 KB + fflate，惰性 import，不加图的用户零成本）。
//   【硬原则】库外不许再为图片建 canvas / 调 createImageBitmap——字节进出一律走这里。
import type { RgbaImage } from "@internal/gallery";

export type { RgbaImage };

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  w = Math.max(1, w | 0); h = Math.max(1, h | 0);
  return (typeof OffscreenCanvas !== "undefined") ? new OffscreenCanvas(w, h) : (() => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; })();
}
type Decoded = ImageBitmap | HTMLImageElement;
async function decodeBlob(blob: Blob): Promise<Decoded> {
  // 方向：from-image = 按 EXIF 摆正（现代浏览器默认即如此；显式写上，老引擎不认这个选项就退回无选项）。
  try { return await createImageBitmap(blob, { imageOrientation: "from-image" } as ImageBitmapOptions); } catch { /* fall through */ }
  try { return await createImageBitmap(blob); } catch { /* fall through */ }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob); const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image decode failed")); };
    img.src = url;
  });
}
/** 解码边界：浏览器解码 + canvas 读出**一次** → straight RGBA 字节。GIF 取首帧。 */
export async function decodeToRgba(blob: Blob): Promise<RgbaImage> {
  const src = await decodeBlob(blob);
  const w = src.width || (src as HTMLImageElement).naturalWidth, h = src.height || (src as HTMLImageElement).naturalHeight;
  const c = makeCanvas(w, h);
  const cx = c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | null;
  if (!cx) throw new Error("2d context unavailable");
  cx.drawImage(src as CanvasImageSource, 0, 0);
  const img = cx.getImageData(0, 0, w, h);
  if ("close" in src) try { (src as ImageBitmap).close(); } catch { /* ignore */ }
  return { data: img.data, w, h };
}
/** 只读尺寸（不读像素）。 */
export async function probeSize(blob: Blob): Promise<{ w: number; h: number }> {
  const src = await decodeBlob(blob);
  const r = { w: src.width || (src as HTMLImageElement).naturalWidth, h: src.height || (src as HTMLImageElement).naturalHeight };
  if ("close" in src) try { (src as ImageBitmap).close(); } catch { /* ignore */ }
  return r;
}
/** JPEG 编码（vendored jpeg-js，惰性加载）。输入不透明 RGBA（alpha 忽略，调用方先拍平白底）。 */
export async function encodeJpeg(rgba: Uint8ClampedArray, w: number, h: number, quality: number): Promise<Uint8Array> {
  const { encode } = await import("../../vendor/jpeg-js/jpeg-encoder.mjs");
  return encode({ data: rgba, width: w, height: h }, quality).data;
}
/** PNG 编码（vendored UPNG，惰性加载）：colors=0 无损 RGBA8；>0 调色板量化（封面缩略图预算档）。 */
export async function encodePng(rgba: Uint8ClampedArray, w: number, h: number, colors: number): Promise<Uint8Array> {
  const { default: UPNG } = await import("../../vendor/upng/upng.esm.js");
  return new Uint8Array(UPNG.encode([new Uint8Array(rgba).buffer], w, h, colors));
}

// ── 画一张场景（长图导出，2026-09-30 user「先做图片导出吧，这个今晚就能用」）：排版在 src/export/long-image.ts 算好一张显示列表，这里只负责量字宽与落像素——canvas 仍只在本文件。
//   字体 = 调用方给的 family 字符串（此刻是编辑器的系统字体栈；将来 vendor 自己的字体 = 先 FontFace 装上再给名字），本模块不认识字体文件。
export interface TextStyle { family: string; sizePx: number; weight?: number | string; color: string }
export type SceneOp =
  | { op: "rect"; x: number; y: number; w: number; h: number; color: string }
  | { op: "line"; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { op: "text"; x: number; y: number; text: string; style: TextStyle; align?: "left" | "center" | "right"; /** 顺时针转 90°（以 x, y 为轴） */ rotate?: 90; /** 先描一圈边再填 */ stroke?: { color: string; width: number } }   // y = 基线
  | { op: "image"; x: number; y: number; w: number; h: number; blob: Blob; crop?: { sx: number; sy: number; sw: number; sh: number } };
export interface TextMeasurer { width(text: string, style: TextStyle): number; ascent(style: TextStyle): { asc: number; desc: number }; /** 汉字本体的墨迹上下伸（量「国」；不看字体自报的 ascent——注音字体会把拼音带算进去，各平台取的表还不一样）。 */ ink(style: TextStyle): { asc: number; desc: number } }
const fontString = (st: TextStyle): string => `${st.weight ?? 400} ${st.sizePx}px ${st.family}`;
/** 量字宽（一个 8×8 的量尺 canvas，单字宽度有缓存）。ascent = 字体的上下伸（浏览器不给 fontBoundingBox 就按 CJK 常见比例估）。 */
export function createTextMeasurer(): TextMeasurer {
  const c = makeCanvas(8, 8); const cx = c.getContext("2d") as CanvasRenderingContext2D | null;
  if (!cx) throw new Error("2d context unavailable");
  const cache = new Map<string, number>();
  return {
    width(text, style) {
      const f = fontString(style); const short = text.length <= 2; const k = f + "\0" + text;
      if (short) { const hit = cache.get(k); if (hit !== undefined) return hit; }
      cx.font = f; const w = cx.measureText(text).width;
      if (short) cache.set(k, w);
      return w;
    },
    ascent(style) {
      cx.font = fontString(style);
      const mt = cx.measureText(String.fromCharCode(0x56fd) + "Ag") as TextMetrics & { fontBoundingBoxAscent?: number; fontBoundingBoxDescent?: number };
      const asc = mt.fontBoundingBoxAscent, desc = mt.fontBoundingBoxDescent;
      return asc && desc ? { asc, desc } : { asc: style.sizePx * 0.88, desc: style.sizePx * 0.24 };
    },
    ink(style) {
      cx.font = fontString(style);
      const mt = cx.measureText(String.fromCharCode(0x56fd));
      const asc = mt.actualBoundingBoxAscent, desc = mt.actualBoundingBoxDescent;
      // 「国」是方框字：上沿 = 汉字本体的顶。注音字体量到的上沿含拼音带 → 高过 0.95 em 就按常见本体高 0.8 em 截
      const a = Number.isFinite(asc) && asc > 0 ? Math.min(asc, style.sizePx * 0.8 + (asc > style.sizePx * 0.95 ? 0 : asc - style.sizePx * 0.8)) : style.sizePx * 0.8;
      return { asc: a, desc: Number.isFinite(desc) ? Math.max(0, desc) : style.sizePx * 0.07 };
    },
  };
}
/** 把显示列表画成一张 RGBA（bg 先铺满）。图片 op 经浏览器解码器 + drawImage（高质量重采样）；画完读出一次。 */
export async function paintScene(w: number, h: number, bg: string, ops: SceneOp[]): Promise<RgbaImage> {
  const c = makeCanvas(w, h);
  const cx = c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | null;
  if (!cx) throw new Error("2d context unavailable");
  cx.fillStyle = bg; cx.fillRect(0, 0, w, h);
  cx.imageSmoothingEnabled = true; (cx as CanvasRenderingContext2D & { imageSmoothingQuality?: string }).imageSmoothingQuality = "high";
  for (const o of ops) {
    if (o.op === "rect") { cx.fillStyle = o.color; cx.fillRect(o.x, o.y, o.w, o.h); }
    else if (o.op === "line") { cx.strokeStyle = o.color; cx.lineWidth = o.width; cx.beginPath(); cx.moveTo(o.x1, o.y1); cx.lineTo(o.x2, o.y2); cx.stroke(); }
    else if (o.op === "text") {
      cx.font = fontString(o.style); cx.fillStyle = o.style.color; cx.textAlign = o.align ?? "left"; cx.textBaseline = "alphabetic";
      if (o.rotate || o.stroke) {
        cx.save(); cx.translate(o.x, o.y); if (o.rotate === 90) cx.rotate(Math.PI / 2);
        if (o.stroke) { cx.lineJoin = "round"; cx.lineWidth = o.stroke.width * 2; cx.strokeStyle = o.stroke.color; cx.strokeText(o.text, 0, 0); }
        cx.fillText(o.text, 0, 0); cx.restore();
      } else cx.fillText(o.text, o.x, o.y);
    }
    else {
      const src = await decodeBlob(o.blob);
      if (o.crop) cx.drawImage(src as CanvasImageSource, o.crop.sx, o.crop.sy, o.crop.sw, o.crop.sh, o.x, o.y, o.w, o.h);
      else cx.drawImage(src as CanvasImageSource, o.x, o.y, o.w, o.h);
      if ("close" in src) try { (src as ImageBitmap).close(); } catch { /* ignore */ }
    }
  }
  const img = cx.getImageData(0, 0, w, h);
  return { data: img.data, w, h };
}
