// 图片进门漏斗（单一入口：文件选择 / 多选 / 拖放 / 粘贴 / 替换图片都走这里；ADR-0013）。created 2026-09-10 by Claude Fable 5.1。
//   slimImage：字节 → 嗅探类型 → GIF 直通 | 解码 → 政策 → 只剥 metadata | 缩 + 白底 + JPEG q85（压大保原）。
//   makeCoverPng：任一图片页字节 → 封面 PNG（gallery 包 makeThumbAdaptive：≤256²、≤70 KB、白底），写进 Thumbnails/thumbnail.png 由 session 做。
import { areaResampleRgba, flattenWhiteInPlace, makeThumbAdaptive, withPngText, PNG_BLURB_KEYWORD, type RgbaImage } from "@internal/gallery";
import { sniffImageType, planImageImport, isFatGif, IMPORT_JPEG_QUALITY, EXT_FOR_TYPE, type ImageType } from "./policy.ts";
import { stripMetadata, readJpegOrientation } from "./metadata.ts";
import { decodeToRgba, encodeJpeg, encodePng } from "./codec.ts";

export class NotAnImageError extends Error { override name = "NotAnImageError"; constructor() { super("not a supported image (jpeg/png/webp/gif)"); } }

export interface SlimResult {
  bytes: Uint8Array; type: ImageType; ext: string;
  from: number; to: number;
  /** 像素被缩过 / 重编码过（状态行「已压缩 A → B」用）。 */
  scaled: boolean; reencoded: boolean;
  /** GIF 直通且 > 2 MB（UI 二次确认）。 */
  fatGif: boolean;
}
export async function slimImage(file: Blob, opts: { hd: boolean }): Promise<SlimResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes); if (!type) throw new NotAnImageError();
  if (type === "gif") return { bytes, type, ext: "gif", from: bytes.length, to: bytes.length, scaled: false, reencoded: false, fatGif: isFatGif(bytes.length) };
  const orientation = type === "jpeg" ? readJpegOrientation(bytes) : null;
  const img = await decodeToRgba(new Blob([bytes as unknown as BlobPart]));
  const plan = planImageImport({ type, w: img.w, h: img.h, orientation, hd: opts.hd });
  const stripped = stripMetadata(bytes, type);
  if (plan.kind !== "reencode") return { bytes: stripped, type, ext: EXT_FOR_TYPE[type], from: bytes.length, to: stripped.length, scaled: false, reencoded: false, fatGif: false };
  const scaled = plan.fw !== img.w || plan.fh !== img.h;
  const px = scaled ? areaResampleRgba(img.data, img.w, img.h, plan.fw, plan.fh) : new Uint8ClampedArray(img.data);
  flattenWhiteInPlace(px);
  const jpeg = await encodeJpeg(px, plan.fw, plan.fh, IMPORT_JPEG_QUALITY);
  if (plan.keepOriginalIfBigger && jpeg.length >= stripped.length) return { bytes: stripped, type, ext: EXT_FOR_TYPE[type], from: bytes.length, to: stripped.length, scaled: false, reencoded: false, fatGif: false };
  return { bytes: jpeg, type: "jpeg", ext: "jpg", from: bytes.length, to: jpeg.length, scaled, reencoded: true, fatGif: false };
}

/** 封面 PNG：白底、≤256²、≤70 KB（gallery 包阶梯）；可带腰封（iTXt Description）。GIF 取首帧。 */
export async function makeCoverPng(bytes: Uint8Array, blurb: string | null = null): Promise<Uint8Array> {
  const img: RgbaImage = await decodeToRgba(new Blob([bytes as unknown as BlobPart]));
  // 编码器同步接口：先把 UPNG 惰性加载好再进阶梯
  const { default: UPNG } = await import("../../vendor/upng/upng.esm.js");
  const enc = (rgba: Uint8ClampedArray, w: number, h: number, colors: number) => new Uint8Array(UPNG.encode([new Uint8Array(rgba).buffer], w, h, colors));
  const r = makeThumbAdaptive(img, { encodePng: enc, keepAlpha: false });
  return blurb ? withPngText(r.png, PNG_BLURB_KEYWORD, blurb) : r.png;
}
export { encodePng };
