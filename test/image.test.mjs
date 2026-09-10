// 图片减肥漏斗的纯函数面：嗅探 / 政策 / metadata 剥离 / EXIF 方向 / 进门页名；UPNG 在 node 里真编码一次。created 2026-09-10 by Claude Fable 5.1
import { describe, it, eq, assert } from "./runner.mjs";
import { sniffImageType, planImageImport, importPageName, isFatGif, IMPORT_EDGE_MAX, IMPORT_EDGE_MAX_HD } from "../src/image/policy.ts";
import { stripJpeg, stripPng, stripWebp, stripMetadata, readJpegOrientation } from "../src/image/metadata.ts";

const cat = (...parts) => { let n = 0; for (const p of parts) n += p.length; const o = new Uint8Array(n); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; };
const seg = (marker, payload) => { const len = payload.length + 2; return cat(new Uint8Array([0xff, marker, len >> 8, len & 0xff]), payload); };
const A = (s) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
function jpegWith({ orientation = 6, extra = [] } = {}) {
  // Exif APP1：TIFF little-endian，IFD0 一条 0x0112 SHORT
  const tiff = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0, 0, 0, 0, 0]);
  const app1 = seg(0xe1, cat(A("Exif\0\0"), tiff));
  const app0 = seg(0xe0, cat(A("JFIF\0"), new Uint8Array([1, 1, 0, 0, 1, 0, 1, 0, 0])));
  const icc = seg(0xe2, cat(A("ICC_PROFILE\0"), new Uint8Array([1, 1, 9, 9, 9])));
  const com = seg(0xfe, A("shot at home, GPS inside"));
  const xmp = seg(0xe1, cat(A("http://ns.adobe.com/xap/1.0/\0"), A("<x:xmpmeta/>")));
  const dqt = seg(0xdb, new Uint8Array(65));
  const sos = seg(0xda, new Uint8Array([1, 1, 0, 0, 63, 0]));
  return cat(new Uint8Array([0xff, 0xd8]), app0, app1, xmp, icc, com, ...extra, dqt, sos, new Uint8Array([1, 2, 3, 0xff, 0x00, 4]), new Uint8Array([0xff, 0xd9]));
}
const markers = (b) => { const out = []; let p = 2; while (p + 4 <= b.length) { if (b[p] !== 0xff) break; const m = b[p + 1]; const len = (b[p + 2] << 8) | b[p + 3]; out.push(m.toString(16)); if (m === 0xda) break; p += 2 + len; } return out.join(","); };

describe("image/policy · 嗅探与政策（ADR-0013）", () => {
  it("魔数嗅探四种；其他 → null", () => {
    eq(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "jpeg"); eq(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "png");
    eq(sniffImageType(cat(A("RIFF"), new Uint8Array(4), A("WEBP"))), "webp"); eq(sniffImageType(A("GIF89a")), "gif"); eq(sniffImageType(A("<html>")), null); eq(sniffImageType(new Uint8Array(0)), null);
  });
  it("政策矩阵：GIF 直通；≤2048 剥；>2048 缩到 2048；HD 勾 4096；EXIF 方向≠1 即使小也重编码且不许压大保原", () => {
    eq(planImageImport({ type: "gif", w: 9000, h: 9000, orientation: null, hd: false }).kind, "passthrough");
    eq(planImageImport({ type: "png", w: 2048, h: 1000, orientation: null, hd: false }).kind, "strip");
    const big = planImageImport({ type: "jpeg", w: 4000, h: 3000, orientation: 1, hd: false }); eq(big.kind, "reencode"); eq(big.fw, IMPORT_EDGE_MAX); eq(big.fh, 1536); eq(big.keepOriginalIfBigger, true);
    const hd = planImageImport({ type: "jpeg", w: 4000, h: 3000, orientation: 1, hd: true }); eq(hd.kind, "strip");
    const hd2 = planImageImport({ type: "png", w: 8000, h: 2000, orientation: null, hd: true }); eq(hd2.kind, "reencode"); eq(hd2.fw, IMPORT_EDGE_MAX_HD); eq(hd2.fh, 1024);
    const rot = planImageImport({ type: "jpeg", w: 800, h: 600, orientation: 6, hd: false }); eq(rot.kind, "reencode"); eq(rot.fw, 800); eq(rot.fh, 600); eq(rot.keepOriginalIfBigger, false);
    eq(planImageImport({ type: "webp", w: 0, h: 0, orientation: null, hd: false }).kind, "strip", "尺寸不可信 → 不动像素");
    assert(isFatGif(2 * 1024 * 1024 + 1)); assert(!isFatGif(2 * 1024 * 1024));
  });
  it("进门页名：有名保名（扩展名以真实字节类型为准）、路径字符清洗、无名 → fallback.ext", () => {
    eq(importPageName("IMG_1234.jpg", "jpg", "x"), "IMG_1234.jpg"); eq(importPageName("photo.JPEG", "jpg", "x"), "photo.jpeg"); eq(importPageName("scan.png", "jpg", "x"), "scan.jpg", "重编码成 JPEG 后扩展名跟着变");
    eq(importPageName("C:\\Users\\me\\夏音 立绘.webp", "webp", "x"), "夏音 立绘.webp"); eq(importPageName("noext", "png", "x"), "noext.png"); eq(importPageName(null, "png", "20260910-ab12"), "20260910-ab12.png"); eq(importPageName("a/b:c?.gif", "gif", "x"), "b-c-.gif");
  });
});
describe("image/metadata · 剥离与方向", () => {
  it("JPEG：剥 APP1(EXIF+XMP)/COM，保 APP0/APP2 ICC；SOS 后原样；方向剥前 6 剥后 null", () => {
    const j = jpegWith({ orientation: 6 });
    eq(readJpegOrientation(j), 6); eq(markers(j), "e0,e1,e1,e2,fe,db,da");
    const s = stripJpeg(j); eq(markers(s), "e0,e2,db,da"); eq(readJpegOrientation(s), null);
    eq(Array.from(s.subarray(s.length - 8)).join(), Array.from(j.subarray(j.length - 8)).join(), "熵数据 + EOI 原样");
    eq(stripJpeg(s), s, "无可剥 → 原对象");
    eq(readJpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])), null);
  });
  it("PNG：剥 tEXt/iTXt/zTXt/eXIf/tIME，保 IHDR/iCCP/IDAT/IEND，块原样搬（CRC 不变）", () => {
    const chunk = (t, d) => cat(new Uint8Array([0, 0, 0, d.length]), A(t), d, new Uint8Array([9, 9, 9, 9]));
    const png = cat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", new Uint8Array(13)), chunk("tEXt", A("Author\0me")), chunk("iCCP", new Uint8Array(5)), chunk("eXIf", new Uint8Array(6)), chunk("IDAT", new Uint8Array(3)), chunk("tIME", new Uint8Array(7)), chunk("IEND", new Uint8Array(0)));
    const s = stripPng(png);
    const types = (b) => { const out = []; let p = 8; while (p + 12 <= b.length) { const len = (b[p] << 24 | b[p + 1] << 16 | b[p + 2] << 8 | b[p + 3]) >>> 0; out.push(String.fromCharCode(...b.subarray(p + 4, p + 8))); p += 12 + len; } return out.join(","); };
    eq(types(s), "IHDR,iCCP,IDAT,IEND"); eq(stripPng(s), s);
  });
  it("WebP：剥 EXIF/XMP chunk、清 VP8X 旗、RIFF 总长回写；简单格式原样", () => {
    const ch = (t, d) => cat(A(t), new Uint8Array([d.length, 0, 0, 0]), d, d.length & 1 ? new Uint8Array(1) : new Uint8Array(0));
    const vp8x = ch("VP8X", new Uint8Array([0x08 | 0x04 | 0x10, 0, 0, 0, 1, 0, 0, 1, 0, 0]));
    const body = cat(vp8x, ch("EXIF", new Uint8Array([1, 2, 3])), ch("VP8L", new Uint8Array([0x2f, 0, 0, 0, 0])), ch("XMP ", A("<x/>")));
    const webp = cat(A("RIFF"), new Uint8Array([(body.length + 4) & 0xff, (body.length + 4) >> 8, 0, 0]), A("WEBP"), body);
    const s = stripWebp(webp);
    const names = (b) => { const out = []; let p = 12; while (p + 8 <= b.length) { const sz = b[p + 4] | (b[p + 5] << 8); out.push(String.fromCharCode(...b.subarray(p, p + 4))); p += 8 + sz + (sz & 1); } return out.join(","); };
    eq(names(s), "VP8X,VP8L"); eq(s[20] & 0x0c, 0); eq(s[20] & 0x10, 0x10, "alpha 旗保留"); eq(s[4] | (s[5] << 8), s.length - 8);
    const simple = cat(A("RIFF"), new Uint8Array([20, 0, 0, 0]), A("WEBP"), ch("VP8 ", new Uint8Array(12))); eq(stripWebp(simple), simple);
    eq(stripMetadata(A("GIF89a"), "gif").length, 6);
  });
});
describe("image · vendored UPNG 在 node 里真编码", () => {
  it("2×2 RGBA 无损往返；256 色调色板档出 PNG 魔数", async () => {
    const { default: UPNG } = await import("../vendor/upng/upng.esm.js");
    const px = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0]);
    const png = new Uint8Array(UPNG.encode([px.buffer], 2, 2, 0)); eq(png[1], 0x50);
    const back = new Uint8Array(UPNG.toRGBA8(UPNG.decode(png.buffer))[0]); eq(Array.from(back).join(), Array.from(px).join());
    const pal = new Uint8Array(UPNG.encode([px.buffer], 2, 2, 256)); eq(pal[1], 0x50);
  });
});
