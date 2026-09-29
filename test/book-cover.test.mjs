// 书库封面的排版规则 + 名字里的日期前缀。created 2026-09-29 by Claude Fable 5.1
//   user 2026-09-29「封面上印书名，想一想英文怎么办，以及对 yyyymmdd-name 和 yyyymmdd name 都识别」
import { describe, it, eq, assert } from "./runner.mjs";
const { splitDatedName } = await import("../src/doc-model.ts");
const { planCover, coverHtml, paperHtml } = await import("../src/ui/book-cover.ts");

describe("doc-model · splitDatedName（名字里的日期前缀）", () => {
  it("空格和连字符两种写法都认；下划线、全角空格也认", () => {
    for (const s of ["20250127 樱川中学科学部", "20250127-樱川中学科学部", "20250127_樱川中学科学部", "20250127　樱川中学科学部", "20250127  樱川中学科学部"]) {
      const r = splitDatedName(s); eq(r.date, "20250127", s); eq(r.title, "樱川中学科学部", s);
    }
  });
  it("日期码名（没起名的稿）整个算名字，不拆", () => {
    for (const s of ["20260929-5c5c", "20260929-5C5C", "20260929-5c5c-1a2b", "20260929-5c5c 2"]) { const r = splitDatedName(s); eq(r.date, null, s); eq(r.title, s, s); }
  });
  it("不像日期的八位数不拆；没有日期前缀原样；日期后面没有名字原样", () => {
    eq(splitDatedName("20251301 x").date, null, "13 月"); eq(splitDatedName("20250132 x").date, null, "32 日");
    eq(splitDatedName("樱川中学科学部").title, "樱川中学科学部"); eq(splitDatedName("樱川中学科学部").date, null);
    eq(splitDatedName("20250127").date, null); eq(splitDatedName("20250127").title, "20250127");
    eq(splitDatedName("202501271 x").date, null, "九位数");
  });
  it("名字里再有连字符 / 空格不受影响", () => {
    const r = splitDatedName("20260301-The Long Goodbye - part 2"); eq(r.date, "20260301"); eq(r.title, "The Long Goodbye - part 2");
  });
});

describe("ui/book-cover · 竖排还是横排、字号档、纵中横", () => {
  it("汉字为主 → 竖排；拉丁字母为主 → 横排", () => {
    eq(planCover("20240718 花璃同人").vertical, true); eq(planCover("20250216 樱川 AI参考").vertical, true); eq(planCover("かなカナ").vertical, true);
    eq(planCover("20260120 Scifi").vertical, false); eq(planCover("20260301-The Long Goodbye").vertical, false);
    eq(planCover("第3章 The Beginning of Everything").vertical, false, "两个汉字压不过一长串英文");
  });
  it("日期码名：横排、等宽、不单独印日期", () => {
    const p = planCover("20260929-5c5c"); eq(p.vertical, false); eq(p.coded, true); eq(p.date, null);
    assert(coverHtml("20260929-5c5c", "draft").includes("coded")); assert(!coverHtml("20260929-5c5c", "draft").includes("xhw-cover-date"));
  });
  it("字数越多字号档越小", () => {
    eq(planCover("花璃同人").size, "xl"); eq(planCover("樱川中学科学部").size, "l"); eq(planCover("一篇名字特别特别长的随笔草稿").size, "m"); eq(planCover("一篇名字特别特别长的随笔草稿标题用来看折行还要更长一点").size, "s");
    eq(planCover("Scifi").size, "xl"); eq(planCover("The Long Goodbye").size, "l");
  });
  it("竖排里一两个字符的拉丁 / 数字小串立起来（纵中横），更长的不包", () => {
    const h = coverHtml("20250808-夏音与第3个AI", "book");
    assert(h.includes('<span class="tcy">3</span>'), h); assert(h.includes('<span class="tcy">AI</span>'), h);
    assert(!coverHtml("樱川 ABC参考", "book").includes("tcy"), "三个字母不包");
    assert(!coverHtml("20260120 Scifi", "book").includes("tcy"), "横排不包");
  });
  it("书有装订线的 class、稿没有；日期单独一个元素；名字里的尖括号被转义", () => {
    const b = coverHtml("20240718 花璃同人", "book"), d = coverHtml("20251224_雪夜", "draft");
    assert(/class="xhw-cover book v /.test(b), b); assert(/class="xhw-cover draft v /.test(d), d);
    assert(b.includes('<span class="xhw-cover-date">20240718</span>')); assert(d.includes('<span class="xhw-cover-date">20251224</span>'));
    const x = coverHtml('a<b>"c"&d', "draft"); assert(x.includes("a&lt;b&gt;&quot;c&quot;&amp;d"), x);
  });
});

describe("ui/book-cover · 两层：纸只有颜色，字在上面那一层", () => {
  it("纸（占位）不印字，只分书 / 稿两种颜色", () => {
    eq(paperHtml("book"), '<span class="xhw-paper book"></span>');
    eq(paperHtml("draft"), '<span class="xhw-paper draft"></span>');
  });
  it("印字那一层和底下有没有封面图无关：同一个名字永远出同一段 HTML", () => {
    eq(coverHtml("20250127 樱川中学科学部", "book"), coverHtml("20250127 樱川中学科学部", "book"));
    assert(!/xhw-paper/.test(coverHtml("樱川", "book")), "印字层里不带纸");
  });
});
