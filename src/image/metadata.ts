// 图片 metadata 剥离 + EXIF 方向读取（纯函数，零解码；ADR-0013「隐私剥干净，小图不重编码」）。created 2026-09-10 by Claude Fable 5.1。
//   JPEG：剥 APP1（EXIF / XMP）…APP15 与 COM；**保** APP0（JFIF）、APP2 ICC_PROFILE（色彩，无隐私）、APP14 Adobe（色彩变换旗，剥了 CMYK 会反色）。SOS 之后原样。
//   PNG：剥 tEXt / iTXt / zTXt / eXIf / tIME；色彩块（iCCP / sRGB / gAMA / cHRM）保留。CRC 不用重算（整块搬）。
//   WebP：剥 EXIF / XMP chunk，VP8X 旗位同步清掉，RIFF 总长回写。简单格式（无 VP8X）没有 metadata。
//   GIF：无 EXIF；原样（动图直通）。
import type { ImageType } from "./policy.ts";

const be16 = (b: Uint8Array, p: number): number => (b[p]! << 8) | b[p + 1]!;
const le32 = (b: Uint8Array, p: number): number => (b[p]! | (b[p + 1]! << 8) | (b[p + 2]! << 16) | (b[p + 3]! << 24)) >>> 0;
const ascii = (b: Uint8Array, p: number, n: number): string => String.fromCharCode(...b.subarray(p, p + n));

/** JPEG 段表（到 SOS 为止）。 */
function jpegSegments(b: Uint8Array): { marker: number; start: number; end: number }[] {
  const out: { marker: number; start: number; end: number }[] = [];
  let p = 2;
  while (p + 4 <= b.length) {
    if (b[p] !== 0xff) break;
    const marker = b[p + 1]!;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) { p += 2; continue; }   // 无长度的标记
    const len = be16(b, p + 2);
    const end = p + 2 + len;
    if (end > b.length) break;
    out.push({ marker, start: p, end });
    if (marker === 0xda) break;   // SOS：之后是熵编码数据，原样
    p = end;
  }
  return out;
}
const KEEP_APP = (b: Uint8Array, s: { marker: number; start: number; end: number }): boolean => {
  if (s.marker === 0xe0) return true;                                                     // APP0 JFIF
  if (s.marker === 0xe2 && ascii(b, s.start + 4, 12) === "ICC_PROFILE\0") return true;   // APP2 ICC
  if (s.marker === 0xee && ascii(b, s.start + 4, 5) === "Adobe") return true;             // APP14 Adobe
  return false;
};
export function stripJpeg(b: Uint8Array): Uint8Array {
  const segs = jpegSegments(b);
  const drop = segs.filter((s) => ((s.marker >= 0xe1 && s.marker <= 0xef) || s.marker === 0xfe) && !KEEP_APP(b, s));
  if (drop.length === 0) return b;
  let n = b.length; for (const s of drop) n -= s.end - s.start;
  const out = new Uint8Array(n); let o = 0, p = 0;
  for (const s of drop) { out.set(b.subarray(p, s.start), o); o += s.start - p; p = s.end; }
  out.set(b.subarray(p), o);
  return out;
}
/** EXIF Orientation（1–8）；没有 / 解析不了 → null。 */
export function readJpegOrientation(b: Uint8Array): number | null {
  for (const s of jpegSegments(b)) {
    if (s.marker !== 0xe1 || ascii(b, s.start + 4, 6) !== "Exif\0\0") continue;
    const t = s.start + 10;   // TIFF header
    if (t + 8 > s.end) return null;
    const little = ascii(b, t, 2) === "II"; if (!little && ascii(b, t, 2) !== "MM") return null;
    const r16 = (p: number) => (little ? b[p]! | (b[p + 1]! << 8) : be16(b, p));
    const r32 = (p: number) => (little ? le32(b, p) : ((b[p]! << 24) | (b[p + 1]! << 16) | (b[p + 2]! << 8) | b[p + 3]!) >>> 0);
    const ifd = t + r32(t + 4); if (ifd + 2 > s.end) return null;
    const count = r16(ifd);
    for (let i = 0; i < count; i++) {
      const e = ifd + 2 + i * 12; if (e + 12 > s.end) return null;
      if (r16(e) === 0x0112) { const v = r16(e + 8); return v >= 1 && v <= 8 ? v : null; }
    }
    return null;
  }
  return null;
}

const PNG_DROP = new Set(["tEXt", "iTXt", "zTXt", "eXIf", "tIME"]);
export function stripPng(b: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [b.subarray(0, 8)]; let p = 8, dropped = false;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  while (p + 12 <= b.length) {
    const len = dv.getUint32(p); const type = ascii(b, p + 4, 4); const end = p + 12 + len;
    if (end > b.length) { parts.push(b.subarray(p)); p = b.length; break; }
    if (PNG_DROP.has(type)) dropped = true; else parts.push(b.subarray(p, end));
    p = end; if (type === "IEND") break;
  }
  if (p < b.length) parts.push(b.subarray(p));
  if (!dropped) return b;
  let n = 0; for (const x of parts) n += x.length; const out = new Uint8Array(n); let o = 0; for (const x of parts) { out.set(x, o); o += x.length; }
  return out;
}

export function stripWebp(b: Uint8Array): Uint8Array {
  if (b.length < 12 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return b;
  const chunks: { type: string; start: number; end: number }[] = []; let p = 12;
  while (p + 8 <= b.length) { const type = ascii(b, p, 4); const size = le32(b, p + 4); const end = p + 8 + size + (size & 1); if (end > b.length) break; chunks.push({ type, start: p, end }); p = end; }
  const drop = chunks.filter((c) => c.type === "EXIF" || c.type === "XMP ");
  if (drop.length === 0) return b;
  const parts: Uint8Array[] = []; let q = 12;
  for (const c of drop) { parts.push(b.subarray(q, c.start)); q = c.end; } parts.push(b.subarray(q));
  let n = 12; for (const x of parts) n += x.length;
  const out = new Uint8Array(n); out.set(b.subarray(0, 12), 0); let o = 12; for (const x of parts) { out.set(x, o); o += x.length; }
  const size = n - 8; out[4] = size & 0xff; out[5] = (size >>> 8) & 0xff; out[6] = (size >>> 16) & 0xff; out[7] = (size >>> 24) & 0xff;   // RIFF 总长回写
  const vp8x = chunks.find((c) => c.type === "VP8X");
  if (vp8x && vp8x.start === 12) out[20] = out[20]! & ~0x0c;   // VP8X flags：清 EXIF(0x08) / XMP(0x04)
  return out;
}

/** 按类型剥（GIF 原样）。剥不动 / 不认识 → 原字节。 */
export function stripMetadata(b: Uint8Array, type: ImageType): Uint8Array {
  if (type === "jpeg") return stripJpeg(b);
  if (type === "png") return stripPng(b);
  if (type === "webp") return stripWebp(b);
  return b;
}
