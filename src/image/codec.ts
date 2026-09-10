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
