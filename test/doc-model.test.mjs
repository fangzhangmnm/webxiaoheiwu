// doc-model 纯函数契约：文件名约定（user 三轮回退终形）/ 排序 / 字数 / 编码 / 采纳验真。created 2026-09-03 by Claude Fable 5.1
import { describe, it, eq, assert } from "./runner.mjs";
import { parseDocName, makeDocName, collisionCandidate, sanitizeTitle, compareDocNamesDesc, statsForText, decodeTextBytes, looksLikeTextDoc, isDocName, formatDate } from "../src/doc-model.ts";

describe("doc-model · 文件名", () => {
  it("裸日期合法（无标题）", () => { const p = parseDocName("20260519.txt"); eq(p.date, "20260519"); eq(p.title, ""); eq(p.stem, "20260519"); });
  it("日期 + 标题：空格后全部是标题（尾数字也是标题，不猜序号）", () => {
    const p = parseDocName("20260517 第一章 开局 1.txt"); eq(p.date, "20260517"); eq(p.title, "第一章 开局 1");
  });
  it("多空格 / 不合规名：never trust —— 不抛，整个 stem 当标题", () => {
    eq(parseDocName("20260517  双空格.txt").title, "双空格");
    const p = parseDocName("random notes.txt"); eq(p.date, null); eq(p.title, "random notes");
    eq(parseDocName("").title, "");
  });
  it("makeDocName：有标题带空格，无标题裸日期；标题去路径字符", () => {
    eq(makeDocName("20260903", "a/b:c"), "20260903 a-b-c.txt");
    eq(makeDocName("20260903", "   "), "20260903.txt");
    eq(sanitizeTitle("  多  空  格 \n x"), "多 空 格 x");
  });
  it("碰撞后缀只在 n≥1 追加", () => { eq(collisionCandidate("20260903 x.txt", 0), "20260903 x.txt"); eq(collisionCandidate("20260903 x.txt", 2), "20260903 x 2.txt"); });
  it("isDocName 只认根级 .txt", () => { assert(isDocName("a.txt")); assert(!isDocName("a.TXT.zip")); assert(!isDocName("sub/a.txt")); assert(!isDocName("a.bin")); });
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
