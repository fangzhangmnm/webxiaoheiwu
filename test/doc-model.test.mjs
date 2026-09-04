// doc-model 纯函数契约：文件名约定（user 三轮回退终形）/ 排序 / 字数 / 编码 / 采纳验真。created 2026-09-03 by Claude Fable 5.1
import { describe, it, eq, assert } from "./runner.mjs";
import { parseDocName, makeDocName, collisionCandidate, sanitizeTitle, compareDocNamesDesc, statsForText, decodeTextBytes, looksLikeTextDoc, isDocName, formatDate, splitDocPath, joinDocPath, sanitizeFolderName, hex4, isOpaqueStem } from "../src/doc-model.ts";

describe("doc-model · 文件名（有名保名，无名 yyyymmdd-hex4；2026-09-03 对齐 WeebPaint）", () => {
  it("有名保名：标题就是文件名，parse 回来 title = 整个 stem（老稿的日期前缀原样保留）", () => {
    eq(makeDocName("20260903", "第一章 开局", "", "abcd"), "第一章 开局.txt");
    const p = parseDocName("20260517 第一章 开局 1.txt"); eq(p.title, "20260517 第一章 开局 1"); eq(p.date, "20260517"); eq(p.stem, p.title);
    eq(parseDocName("random notes.txt").date, null); eq(parseDocName("random notes.txt").title, "random notes");
    eq(parseDocName("").title, "");
  });
  it("无名日期：空标题 → yyyymmdd-hex4；hex4 是 4 位十六进制", () => {
    eq(makeDocName("20260903", "   ", "", "1a2b"), "20260903-1a2b.txt");
    eq(makeDocName("20260903", "", "小说", "1a2b"), "小说/20260903-1a2b.txt");
    assert(/^[0-9a-f]{4}$/.test(hex4()));
    eq(parseDocName("20260903-1a2b.txt").date, "20260903");
  });
  it("isOpaqueStem：日期码名（可带碰撞后缀）= 加密稿藏标题的出生名（ADR-0007）；带标题的名不算", () => {
    assert(isOpaqueStem("20260904-1a2b")); assert(isOpaqueStem("20260904-1A2B 3")); assert(isOpaqueStem(parseDocName("小说/20260904-1a2b.txt").stem));
    assert(!isOpaqueStem("20260904 第一章")); assert(!isOpaqueStem("20260904-1a2b 第一章")); assert(!isOpaqueStem("第一章")); assert(!isOpaqueStem("20260904-1a2")); assert(!isOpaqueStem(""));
  });
  it("标题去路径字符、压空白", () => {
    eq(makeDocName("20260903", "a/b:c"), "a-b-c.txt");
    eq(sanitizeTitle("  多  空  格 \n x"), "多 空 格 x");
  });
  it("碰撞后缀只在 n≥1 追加", () => { eq(collisionCandidate("x.txt", 0), "x.txt"); eq(collisionCandidate("x.txt", 2), "x 2.txt"); });
  it("isDocName：任一夹下的 .txt（ADR-0006）；容器/空段/点头段不算", () => { assert(isDocName("a.txt")); assert(isDocName("sub/a.txt")); assert(!isDocName("a.TXT.zip")); assert(!isDocName("a.bin")); assert(!isDocName("/a.txt")); assert(!isDocName(".hid/a.txt")); });
  it("多文件夹：split/join/parse 带夹；sanitizeFolderName", () => {
    eq(splitDocPath("小说/20260903 x.txt").dir, "小说"); eq(splitDocPath("小说/20260903 x.txt").base, "20260903 x.txt"); eq(splitDocPath("a.txt").dir, "");
    eq(joinDocPath("", "a.txt"), "a.txt"); eq(joinDocPath("f", "a.txt"), "f/a.txt");
    const p = parseDocName("小说/第一章.txt"); eq(p.dir, "小说"); eq(p.title, "第一章");
    eq(collisionCandidate("小说/x.txt", 1), "小说/x 1.txt");
    eq(sanitizeFolderName(" a/b:c  d "), "a-b-c d"); eq(sanitizeFolderName("..x"), "x"); eq(sanitizeFolderName("   "), "");
  });
  it("formatDate", () => { eq(formatDate(new Date(2026, 8, 3).getTime()), "20260903"); });
});

describe("doc-model · 排序（zh-CN 自然序降序）", () => {
  it("新日期在前；第10章 在 第9章 之后（numeric）", () => {
    const names = ["20260509 第9章.txt", "20260517 a.txt", "20260509 第10章.txt"].sort(compareDocNamesDesc);
    eq(names[0], "20260517 a.txt"); eq(names[1], "20260509 第10章.txt"); eq(names[2], "20260509 第9章.txt");
  });
});

describe("doc-model · 字数", () => {
  it("CJK 按字、英文按词、标点不算", () => { const s = statsForText("你好，世界 hello world!"); eq(s.cjk, 4); eq(s.en, 2); });
});

describe("doc-model · 编码", () => {
  const enc = (s) => new TextEncoder().encode(s);
  it("UTF-8 / BOM", () => {
    eq(decodeTextBytes(enc("中文")).encoding, "utf-8");
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc("x")]); const r = decodeTextBytes(bom); eq(r.encoding, "utf-8-bom"); eq(r.text, "x");
  });
  it("GB18030 回退（GBK 的「中文」= D6 D0 CE C4）", () => {
    const r = decodeTextBytes(new Uint8Array([0xd6, 0xd0, 0xce, 0xc4])); eq(r.encoding, "gb18030"); eq(r.text, "中文");
  });
  it("采纳验真：文本放行、空文件放行、HTML 挡、二进制垃圾挡", () => {
    assert(looksLikeTextDoc(enc("正文"))); assert(looksLikeTextDoc(new Uint8Array(0)));
    assert(!looksLikeTextDoc(enc("<!DOCTYPE html><html>captive portal</html>")));
    assert(!looksLikeTextDoc(new Uint8Array([0x00, 0xff, 0xfe, 0x12, 0x00, 0x99])));
  });
});
