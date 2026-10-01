// 把一段文字塞进图片文件的元数据里（不动像素）。created 2026-10-01 by Claude Fable 5.1
//   user 2026-10-01「能不能把文字给顺便嵌入到png里面，jpeg能嵌入吗」「就是导出剪切板的文字，然后也可以选择不嵌入」。
//   PNG：iTXt 块（UTF-8、不压缩），插在 IHDR 后面。关键字用标准的：Title / Software / Description（正文放 Description——规范里它就是「可能很长的描述」）。
//   JPEG：COM 段（注释，UTF-8），插在 SOI 和开头那几个 APPn 段后面；一段最多 65533 字节，长了分几段（按字符边界切，不把一个字切成两半）。
//   读回来：readEmbeddedText（测试用；将来想从长图取回文字也用它）。
//   注意：微信 / 微博这类平台转存图片时会重新压缩、把元数据剥掉；原图 / 文件方式发送才留得住。
const enc = new TextEncoder(), dec = new TextDecoder();
let crcTable: Uint32Array | null = null;
function crc32(parts: Uint8Array[]): number {
  if (!crcTable) { crcTable = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (const p of parts) for (let i = 0; i < p.length; i++) c = crcTable[(c ^ p[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const isPng = (b: Uint8Array): boolean => b.length > 33 && PNG_SIG.every((v, i) => b[i] === v);
const isJpeg = (b: Uint8Array): boolean => b.length > 4 && b[0] === 0xff && b[1] === 0xd8;
function concat(parts: Uint8Array[]): Uint8Array { const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; }
function iTXt(keyword: string, text: string): Uint8Array {
  const type = enc.encode("iTXt"), data = concat([enc.encode(keyword), new Uint8Array([0, 0, 0, 0, 0]), enc.encode(text)]);   // 关键字 \0 压缩标志 0 压缩方法 0 语言 \0 译名 \0 正文
  const head = new Uint8Array(4), tail = new Uint8Array(4); new DataView(head.buffer).setUint32(0, data.length); new DataView(tail.buffer).setUint32(0, crc32([type, data]));
  return concat([head, type, data, tail]);
}
/** PNG：在 IHDR 后面插 iTXt 块。entries 里正文为空的不写。不是 PNG → 原样返回。 */
export function embedTextPng(png: Uint8Array, entries: { keyword: "Title" | "Software" | "Description"; text: string }[]): Uint8Array {
  if (!isPng(png)) return png;
  const afterIhdr = 8 + 12 + new DataView(png.buffer, png.byteOffset + 8, 4).getUint32(0);
  const chunks = entries.filter((e) => e.text).map((e) => iTXt(e.keyword, e.text));
  return chunks.length ? concat([png.subarray(0, afterIhdr), ...chunks, png.subarray(afterIhdr)]) : png;
}
/** JPEG：插 COM 段。不是 JPEG / 正文为空 → 原样返回。 */
export function embedTextJpeg(jpg: Uint8Array, text: string): Uint8Array {
  if (!isJpeg(jpg) || !text) return jpg;
  let at = 2;   // 跳过开头的 APPn（JFIF / EXIF），注释放它们后面
  while (at + 4 <= jpg.length && jpg[at] === 0xff && jpg[at + 1]! >= 0xe0 && jpg[at + 1]! <= 0xef) at += 2 + ((jpg[at + 2]! << 8) | jpg[at + 3]!);
  const bytes = enc.encode(text), segs: Uint8Array[] = [];
  for (let o = 0; o < bytes.length;) {
    let e = Math.min(bytes.length, o + 65533);
    while (e < bytes.length && e > o && (bytes[e]! & 0xc0) === 0x80) e--;   // 别把一个字切成两半
    const len = e - o + 2; segs.push(new Uint8Array([0xff, 0xfe, len >> 8, len & 0xff]), bytes.subarray(o, e)); o = e;
  }
  return concat([jpg.subarray(0, at), ...segs, jpg.subarray(at)]);
}
/** 读回嵌进去的文字（PNG = Description 那一块；JPEG = 所有 COM 段接起来）。没有 → null。 */
export function readEmbeddedText(bytes: Uint8Array): string | null {
  if (isPng(bytes)) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let o = 8; o + 12 <= bytes.length;) {
      const len = dv.getUint32(o), type = dec.decode(bytes.subarray(o + 4, o + 8)), d = bytes.subarray(o + 8, o + 8 + len);
      if (type === "iTXt") { const z = d.indexOf(0); if (dec.decode(d.subarray(0, z)) === "Description" && d[z + 1] === 0) { const l = d.indexOf(0, z + 3), t = d.indexOf(0, l + 1); return dec.decode(d.subarray(t + 1)); } }
      if (type === "IDAT" || type === "IEND") break;
      o += 12 + len;
    }
    return null;
  }
  if (isJpeg(bytes)) {
    const parts: Uint8Array[] = [];
    for (let o = 2; o + 4 <= bytes.length && bytes[o] === 0xff;) {
      const m = bytes[o + 1]!; if (m === 0xda || m === 0xd9) break;
      const len = (bytes[o + 2]! << 8) | bytes[o + 3]!;
      if (m === 0xfe) parts.push(bytes.subarray(o + 4, o + 2 + len));
      o += 2 + len;
    }
    return parts.length ? dec.decode(concat(parts)) : null;
  }
  return null;
}
