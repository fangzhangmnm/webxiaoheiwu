// 把文字藏进图片文件（src/image/embed-text.ts）。created 2026-10-01 by Claude Fable 5.1
import { describe, it, eq, assert } from "./runner.mjs";
import { embedTextPng, embedTextJpeg, readEmbeddedText } from "../src/image/embed-text.ts";
import { sniffImageSize } from "../src/image/policy.ts";
import UPNG from "../vendor/upng/upng.esm.js";
import { encode as jpegEncode } from "../vendor/jpeg-js/jpeg-encoder.mjs";

const rgba = new Uint8Array(8 * 8 * 4).fill(200);
const png = new Uint8Array(UPNG.encode([rgba.buffer], 8, 8, 0));
const jpg = new Uint8Array(jpegEncode({ data: rgba, width: 8, height: 8 }, 80).data);
const text = "从前，有一个人造了一只巨大的气球。\n\nSecond page: English & 标点「」。\n";

describe("image/embed-text", () => {
  it("PNG：iTXt 块插在 IHDR 后面，读回来一字不差；图还是那张图（解码出的像素不变、每块 CRC 对得上）", () => {
    const out = embedTextPng(png, [{ keyword: "Title", text: "气球" }, { keyword: "Software", text: "x" }, { keyword: "Description", text }]);
    assert(out.length > png.length); eq(readEmbeddedText(out), text); eq(readEmbeddedText(png), null);
    const types = []; const dv = new DataView(out.buffer, out.byteOffset); for (let o = 8; o < out.length;) { const len = dv.getUint32(o); types.push(String.fromCharCode(...out.subarray(o + 4, o + 8))); o += 12 + len; }
    eq(types.slice(0, 4).join(), "IHDR,iTXt,iTXt,iTXt"); assert(types.includes("IDAT") && types.at(-1) === "IEND");
    const a = new Uint8Array(UPNG.toRGBA8(UPNG.decode(out.buffer.slice(out.byteOffset, out.byteOffset + out.length)))[0]), b = new Uint8Array(UPNG.toRGBA8(UPNG.decode(png.buffer.slice(png.byteOffset, png.byteOffset + png.length)))[0]);
    eq(a.join(), b.join(), "pixels untouched");
    eq(embedTextPng(png, [{ keyword: "Description", text: "" }]), png, "nothing to write → same bytes");
  });
  it("JPEG：注释段插在开头的 APPn 后面，读回来一字不差；长文字分段且不切坏一个字", () => {
    const out = embedTextJpeg(jpg, text); eq(readEmbeddedText(out), text); eq(readEmbeddedText(jpg), null);
    eq(out[0], 0xff); eq(out[1], 0xd8); assert(out.length === jpg.length + 4 + new TextEncoder().encode(text).length);
    let o = 2; while (out[o] === 0xff && out[o + 1] >= 0xe0 && out[o + 1] <= 0xef) o += 2 + ((out[o + 2] << 8) | out[o + 3]); eq(out[o + 1], 0xfe, "COM right after the APPn segments");
    const long = "气球冒险家".repeat(9000);   // 135,000 字节 → 三段
    const big = embedTextJpeg(jpg, long); eq(readEmbeddedText(big), long);
    let segs = 0; for (let p = 2; p + 4 <= big.length && big[p] === 0xff && big[p + 1] !== 0xda;) { const len = (big[p + 2] << 8) | big[p + 3]; if (big[p + 1] === 0xfe) { segs++; assert(len <= 65535); new TextDecoder("utf-8", { fatal: true }).decode(big.subarray(p + 4, p + 2 + len)); } p += 2 + len; }
    eq(segs, 3);
    eq(embedTextJpeg(jpg, ""), jpg); eq(embedTextJpeg(png, "x"), png, "not a JPEG → untouched"); eq(embedTextPng(jpg, [{ keyword: "Description", text: "x" }]), jpg, "not a PNG → untouched");
  });
  it("sniffImageSize：不解码，从文件头读宽高（PNG / JPEG / GIF / WebP）；读不出 → null；嵌了文字的图照样读得出", () => {
    eq(JSON.stringify(sniffImageSize(png)), JSON.stringify({ w: 8, h: 8 })); eq(JSON.stringify(sniffImageSize(jpg)), JSON.stringify({ w: 8, h: 8 }));
    const big = new Uint8Array(jpegEncode({ data: new Uint8Array(300 * 120 * 4).fill(90), width: 300, height: 120 }, 70).data);
    eq(JSON.stringify(sniffImageSize(big)), JSON.stringify({ w: 300, h: 120 })); eq(JSON.stringify(sniffImageSize(embedTextJpeg(big, "x".repeat(70000)))), JSON.stringify({ w: 300, h: 120 }));
    eq(JSON.stringify(sniffImageSize(embedTextPng(png, [{ keyword: "Description", text: "x" }]))), JSON.stringify({ w: 8, h: 8 }));
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x40, 0x01, 0xf0, 0x00, 0, 0, 0]); eq(JSON.stringify(sniffImageSize(gif)), JSON.stringify({ w: 320, h: 240 }));
    const webp = new Uint8Array(30); webp.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58]); webp.set([0x1f, 0x03, 0x00], 24); webp.set([0x57, 0x02, 0x00], 27);
    eq(JSON.stringify(sniffImageSize(webp)), JSON.stringify({ w: 800, h: 600 }));
    eq(sniffImageSize(new Uint8Array([1, 2, 3, 4])), null); eq(sniffImageSize(new TextEncoder().encode("not an image at all, just text")), null);
  });
});
