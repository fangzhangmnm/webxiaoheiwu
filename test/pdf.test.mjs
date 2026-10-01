// PDF 引擎（src/export/ttf.ts + pdf.ts）：TTF 解析 / 子集、PDF 结构。要一款真的 glyf TrueType 字体：
//   环境变量 XHW_TEST_FONT → 内置字体 vendor/fonts/sans.ttf.gz（v2.3.15 进仓，所以平时不会 SKIP）→ 开发机 OneDrive 里那份。created 2026-09-30 by Claude Fable 5.1
import { describe, it, eq, assert } from "./runner.mjs";
const throws = (fn, re) => { try { fn(); } catch (e) { if (re && !re.test(e.message)) throw new Error(`threw the wrong thing: ${e.message}`); return true; } throw new Error("expected a throw"); };
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { parseTtf, NotTrueTypeError } from "../src/export/ttf.ts";
import { writePdf, jpegInfo } from "../src/export/pdf.ts";
import { planPdfBook, pdfPageGeometry, parseCssColor, estimatePdfPages, PDF_FONT_PT } from "../src/export/pdf-book.ts";
import { typesetFor, CHARS_PRESETS } from "../src/export/long-image.ts";

const CANDIDATES = [process.env.XHW_TEST_FONT, new URL("../vendor/fonts/sans.ttf.gz", import.meta.url).pathname, "/mnt/c/Users/15617/OneDrive/Lib/Fonts/LXGWNeoXiHei.ttf"].filter(Boolean).map((p) => decodeURIComponent(p));
const FONT = CANDIDATES.find((p) => existsSync(p));
const u16 = (b, o) => (b[o] << 8) | b[o + 1], u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const tablesOf = (b) => { const t = {}; for (let i = 0; i < u16(b, 4); i++) { const r = 12 + 16 * i; t[String.fromCharCode(b[r], b[r + 1], b[r + 2], b[r + 3])] = { off: u32(b, r + 8), len: u32(b, r + 12) }; } return t; };

describe("export/ttf + pdf" + (FONT ? "" : "（SKIP：没有可用的 TrueType 字体）"), () => {
  if (!FONT) { it("skip: no TrueType font available (set XHW_TEST_FONT)", () => {}); return; }
  const raw = readFileSync(FONT); const bytes = new Uint8Array(FONT.endsWith(".gz") ? gunzipSync(raw) : raw); const font = parseTtf(bytes);
  it("解析：字形号 / 前进宽 / 墨迹框；没有的字 → 0", () => {
    const g = font.glyphId("国".codePointAt(0)); assert(g > 0, "国 has a glyph");
    eq(font.advance(g), font.unitsPerEm, "汉字一字一格");
    const ink = font.inkOf(g); assert(ink && ink[3] > ink[1] && ink[3] < font.unitsPerEm, "墨迹框在字身里");
    assert(font.advance(font.glyphId("a".codePointAt(0))) < font.unitsPerEm, "拉丁字母比汉字窄");
    eq(font.glyphId(0x1f600), 0, "emoji 不在这款字体里"); assert(/^[A-Za-z0-9\-]+$/.test(font.psName), font.psName);
  });
  it("子集：字形号不动、用到的字形字节原样、没用到的清空、sfnt 校验和成立、只含 PDF 要的表", () => {
    const g1 = font.glyphId("国".codePointAt(0)), g2 = font.glyphId("气".codePointAt(0)), g3 = font.glyphId("永".codePointAt(0));
    const sub = font.subset([g1, g2]); assert(sub.length < bytes.length / 20, `subset is small: ${sub.length}`);
    const t = tablesOf(sub); eq(Object.keys(t).filter((k) => !["cvt ", "fpgm", "prep"].includes(k)).sort().join(","), "glyf,head,hhea,hmtx,loca,maxp");
    const T0 = tablesOf(bytes); const long0 = u16(bytes, T0.head.off + 50) === 1;
    const span0 = (g) => long0 ? [u32(bytes, T0.loca.off + 4 * g), u32(bytes, T0.loca.off + 4 * g + 4)] : [u16(bytes, T0.loca.off + 2 * g) * 2, u16(bytes, T0.loca.off + 2 * g + 2) * 2];
    const span1 = (g) => [u32(sub, t.loca.off + 4 * g), u32(sub, t.loca.off + 4 * g + 4)];
    for (const g of [g1, g2]) { const [a0, e0] = span0(g), [a1] = span1(g); for (let k = 0; k < e0 - a0; k++) if (bytes[T0.glyf.off + a0 + k] !== sub[t.glyf.off + a1 + k]) throw new Error(`glyph ${g} bytes differ at ${k}`); }
    const [a3, e3] = span1(g3); eq(e3 - a3, 0, "没用到的字形是空的");
    eq(u16(sub, t.head.off + 50), 1, "long loca");
    let sum = 0; for (let i = 0; i + 3 < sub.length; i += 4) sum = (sum + u32(sub, i)) >>> 0; eq(sum, 0xb1b0afba, "整个文件的校验和 = 魔数");
  });
  it("CFF 字体响亮拒绝", () => { throws(() => parseTtf(new Uint8Array([0x4f, 0x54, 0x54, 0x4f, 0, 1, 0, 0, 0, 0, 0, 0])), /CFF/); assert(new NotTrueTypeError("x") instanceof Error); });
  it("写 PDF：头尾、xref 每个偏移都指到对象头、页数、字形统计、缺字报告、书签", () => {
    const stats = { glyphs: 0, missing: [], fontBytes: 0 };
    const pdf = writePdf({ title: "气球冒险家", pages: [
      { w: 300, h: 500, ops: [{ op: "rect", x: 0, y: 0, w: 300, h: 500, color: [1, 1, 0.95] }, { op: "text", x: 20, y: 60, text: "从前，有一个人。Hello 😀", size: 16, color: [0.1, 0.1, 0.1] }, { op: "line", x1: 20, y1: 66, x2: 280, y2: 66, color: [0.8, 0.8, 0.8], width: 0.5 }] },
      { w: 300, h: 500, ops: [{ op: "text", x: 20, y: 60, text: "第二页", size: 16, color: [0, 0, 0] }] },
    ], outline: [{ title: "第一章", page: 0 }, { title: "第二章", page: 1 }] }, font, { stats });
    const s = new TextDecoder("latin1").decode(pdf);
    assert(s.startsWith("%PDF-1.7"), "header"); assert(s.trimEnd().endsWith("%%EOF"), "trailer");
    const xrefAt = Number(/startxref\n(\d+)/.exec(s)[1]); assert(s.slice(xrefAt, xrefAt + 4) === "xref", "startxref points at xref");
    const lines = s.slice(xrefAt).split("\n"); const count = Number(lines[1].split(" ")[1]);
    for (let i = 1; i < count; i++) { const off = Number(lines[2 + i].slice(0, 10)); assert(s.slice(off, off + 12).startsWith(`${i} 0 obj`), `object ${i} offset`); }
    eq((s.match(/\/Type \/Page /g) ?? []).length, 2); assert(/\/Count 2/.test(s)); assert(/\/Type \/Outlines/.test(s) && /\/CIDToGIDMap \/Identity/.test(s) && /\/FontFile2/.test(s));
    eq(stats.missing.join(""), "😀"); assert(stats.glyphs > 10 && stats.fontBytes > 1000 && stats.fontBytes < 400000, JSON.stringify({ g: stats.glyphs, b: stats.fontBytes }));
    assert(pdf.length < 600000, `pdf size ${pdf.length}`);
  });
  it("jpegInfo 读宽高和通道；不是 JPEG → null", async () => {
    const { encode } = await import("../vendor/jpeg-js/jpeg-encoder.mjs");
    const jpg = encode({ data: new Uint8ClampedArray(7 * 5 * 4).fill(200), width: 7, height: 5 }, 80).data;
    eq(JSON.stringify(jpegInfo(jpg)), JSON.stringify({ h: 5, w: 7, components: 3 })); eq(jpegInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null);
  });
});

// 页面几何（v2.3.16，user 2026-09-30「同意sqrt2」）：三档共用 1 : √2、9 pt 实体字号、每页行数由比例推出
describe("export/pdf-book 页面几何", () => {
  const mm = (pt) => pt * 25.4 / 72;
  it("parseCssColor：#rgb / #rrggbb / rgb() / color(srgb …)（浏览器算 color-mix 的结果）；认不出 → 黑", () => {
    const f = (c) => parseCssColor(c).map((v) => v.toFixed(3)).join();
    eq(f("#fff"), "1.000,1.000,1.000"); eq(f("#7a3d14"), [0x7a, 0x3d, 0x14].map((v) => (v / 255).toFixed(3)).join()); eq(f("rgb(255, 0, 51)"), "1.000,0.000,0.200");
    eq(f("color(srgb 0.514 0.283 0.122)"), "0.514,0.283,0.122"); eq(f("color-mix(in srgb, red 50%, black)"), "0.000,0.000,0.000");
  });
  it("三档：宽高比 √2、页面 58.4×82.6 / 77.5×109.6 / 102.9×145.5 mm、每页 11 / 17 / 25 行", () => {
    eq(PDF_FONT_PT, 9); eq(CHARS_PRESETS.join(","), "14,20,28");
    const g = CHARS_PRESETS.map((c) => pdfPageGeometry(typesetFor(c)));
    for (const x of g) assert(Math.abs(x.h / x.w - Math.SQRT2) < 0.002, `ratio ${x.h / x.w}`);
    eq(g.map((x) => `${mm(x.w).toFixed(1)}x${mm(x.h).toFixed(1)}`).join(" "), "58.4x82.6 77.5x109.6 102.9x145.5");
    eq(g.map((x) => x.linesPerPage).join(","), "11,17,25");
    // 相邻两档差一次对折：大一档的宽 ≈ 小一档的高
    assert(Math.abs(g[1].w / g[0].h - 1) < 0.07 && Math.abs(g[2].w / g[1].h - 1) < 0.07, "tiers are one fold apart");
  });
  if (!FONT) return;
  const raw = readFileSync(FONT); const font = parseTtf(new Uint8Array(FONT.endsWith(".gz") ? gunzipSync(raw) : raw));
  const look = { paper: "#f5f3ee", ink: "#1b1b1b", inkSoft: "#3a3833", muted: "#8a8478", rule: "#d8d2c4" };
  const guo = String.fromCharCode(0x56fd);
  for (const chars of CHARS_PRESETS) it(`${chars} 字档：满页正好 linesPerPage 行、每行不超过 ${chars} 字、字和线都在版心里`, () => {
    const ts = typesetFor(chars), geo = pdfPageGeometry(ts);
    const plan = planPdfBook({ title: "t", date: null, cover: null, sections: [{ kind: "text", heading: null, text: guo.repeat(chars * geo.linesPerPage * 3) }], look, typeset: ts, font });
    eq(plan.pageW, geo.w); eq(plan.pageH, geo.h);
    eq(plan.pageCount, 1 + 3, "书名页 + 正好三页满排");
    for (const pg of plan.doc.pages.slice(1)) {
      const body = pg.ops.filter((o) => o.op === "text" && o.size === PDF_FONT_PT);
      eq(body.length, geo.linesPerPage, "lines on a full page");
      for (const o of body) { eq([...o.text].length, chars); assert(o.x >= geo.side - 0.01 && o.y > geo.top && o.y < geo.h - geo.bottom + 0.01, `baseline inside the type area: ${o.y}`); }
      for (const o of pg.ops.filter((o) => o.op === "line")) assert(o.y1 < geo.h - geo.bottom + PDF_FONT_PT * 0.5, `rule not in the footer: ${o.y1}`);
      const num = pg.ops.filter((o) => o.op === "text" && o.size !== PDF_FONT_PT); eq(num.length, 1, "one page number"); assert(num[0].y > geo.h - geo.bottom, "page number sits in the bottom margin");
    }
  });
  it("front: false（这一页 / 这一支）→ 没有封面页和书名页，第一页就是正文", () => {
    const ts = typesetFor(20), geo = pdfPageGeometry(ts); const img = { jpeg: new Uint8Array([0xff, 0xd8]), w: 10, h: 10, components: 3 };
    const mk = (front) => planPdfBook({ title: "book", date: "2026-10-01", cover: img, front, sections: [{ kind: "text", heading: "h", text: guo.repeat(40) }], look, typeset: ts, font });
    eq(mk(true).pageCount, 2, "封面页（图 + 书名）+ 正文"); eq(mk(undefined).pageCount, 2, "缺省 = 有");
    const p = mk(false); eq(p.pageCount, 1); assert(!p.doc.pages[0].ops.some((o) => o.op === "image"), "no cover image"); eq(p.doc.outline.length, 1); eq(p.doc.outline[0].page, 0);
    eq(p.doc.pages[0].ops.filter((o) => o.op === "text" && o.size === PDF_FONT_PT).length, 2); void geo;
  });
  it("封面铺满整页（fill）：等比、盖住整页、居中；图片页仍完整放进版心（contain）", () => {
    const ts = typesetFor(20), geo = pdfPageGeometry(ts);
    for (const [iw, ih] of [[1000, 500], [500, 2000], [707, 1000]]) {
      const img = { jpeg: new Uint8Array([0xff, 0xd8]), w: iw, h: ih, components: 3 };
      const plan = planPdfBook({ title: "t", date: null, cover: img, sections: [{ kind: "image", heading: null, image: img }], look, typeset: ts, font });
      const c = plan.doc.pages[0].ops.find((o) => o.op === "image");
      assert(c.x <= 0.01 && c.y <= 0.01 && c.x + c.w >= geo.w - 0.01 && c.y + c.h >= geo.h - 0.01, `cover covers the page: ${JSON.stringify(c, ["x", "y", "w", "h"])}`);
      assert(Math.abs(c.w / c.h - iw / ih) < 1e-6, "aspect kept"); assert(Math.abs((c.x + c.w / 2) - geo.w / 2) < 0.01 && Math.abs((c.y + c.h / 2) - geo.h / 2) < 0.01, "centered");
      assert(Math.abs(c.w - geo.w) < 0.01 || Math.abs(c.h - geo.h) < 0.01, "one side fits exactly (no more zoom than needed)");
      const p = plan.doc.pages[1].ops.find((o) => o.op === "image");
      assert(p.x >= geo.side - 0.01 && p.x + p.w <= geo.w - geo.side + 0.01 && p.y >= geo.top - 0.01 && p.y + p.h <= geo.h - geo.bottom + 0.01, "image page stays inside the type area");
    }
  });
  it("子节目录：正文后空一行、一节一行（链接色）、行尾页码 = 那一节的页码、整行是链到那一页的链接；纯目录页不空那一行", () => {
    const ts = typesetFor(20), geo = pdfPageGeometry(ts); const lk = { ...look, link: "#7a3d14" };
    const long = guo.repeat(20 * geo.linesPerPage * 2);   // 子节一占两页多（有章节名）
    const sections = [
      { kind: "text", heading: "目录", text: "", toc: [{ label: "甲", target: 1 }, { label: "乙", target: 2 }] },
      { kind: "text", heading: "甲", text: long, toc: [] },
      { kind: "text", heading: "乙", text: guo.repeat(5) },
    ];
    const plan = planPdfBook({ title: "t", date: null, cover: null, front: false, sections, look: lk, typeset: ts, font });
    const p0 = plan.doc.pages[0]; const texts = p0.ops.filter((o) => o.op === "text");
    const rowA = texts.find((o) => o.text === "甲" && o.size === PDF_FONT_PT), rowB = texts.find((o) => o.text === "乙" && o.size === PDF_FONT_PT);
    assert(rowA && rowB && rowB.y - rowA.y > 0 && Math.abs((rowB.y - rowA.y) - geo.lineHeight) < 0.01, "one line per entry");
    eq(rowA.color.map((v) => v.toFixed(2)).join(), [0x7a, 0x3d, 0x14].map((v) => (v / 255).toFixed(2)).join(), "link colour");
    // 纯目录页：章节名 3 行之后紧跟目录（不空一行）
    const firstBodyY = plan.doc.pages[1].ops.filter((o) => o.op === "text" && o.size === PDF_FONT_PT)[0].y;
    assert(Math.abs(rowA.y - firstBodyY) < 0.01, `toc starts where body would: ${rowA.y} vs ${firstBodyY}`);
    // 乙在第几页：目录 1 页 + 甲 3 页 → 乙 = 第 5 页（页序 4）
    const bPage = plan.doc.outline.find((o) => o.title === "乙").page; assert(bPage >= 3, String(bPage));
    eq(JSON.stringify(p0.links.map((l) => l.page)), JSON.stringify([1, bPage]));
    for (const l of p0.links) { assert(Math.abs(l.x - geo.side) < 0.01 && Math.abs(l.w - 20 * PDF_FONT_PT) < 0.01 && Math.abs(l.h - geo.lineHeight) < 0.01, JSON.stringify(l)); }
    const nums = texts.filter((o) => /^\d+$/.test(o.text) && o.size === PDF_FONT_PT).map((o) => o.text);
    eq(nums.join(), `2,${bPage + 1}`, "page numbers printed at the row ends");
    for (const o of texts.filter((o) => /^\d+$/.test(o.text) && o.size === PDF_FONT_PT)) assert(o.x > geo.w / 2 && o.x < geo.w - geo.side, "right-aligned inside the type area");
    // 有正文的页：正文和目录之间空一行
    const plan2 = planPdfBook({ title: "t", date: null, cover: null, front: false, sections: [{ kind: "text", heading: null, text: guo.repeat(3), toc: [{ label: "甲", target: 1 }] }, { kind: "text", heading: "甲", text: guo }], look: lk, typeset: ts, font });
    const b = plan2.doc.pages[0].ops.filter((o) => o.op === "text" && o.size === PDF_FONT_PT && !/^\d+$/.test(o.text));
    eq(b.length, 2); assert(Math.abs((b[1].y - b[0].y) - 2 * geo.lineHeight) < 0.01, "one blank line between body and toc");
    // 写成 PDF：有链接注记，目标是真的页对象
    const pdf = new TextDecoder("latin1").decode(writePdf(plan.doc, font));
    const m = [...pdf.matchAll(/\/Subtype \/Link \/Rect \[[^\]]+\] \/Border \[0 0 0\] \/Dest \[(\d+) 0 R \/Fit\]/g)].map((r) => Number(r[1]));
    eq(m.length, 2); for (const id of m) assert(new RegExp(`\\n${id} 0 obj\\n<< /Type /Page `).test(pdf), `link target ${id} is a page object`);
    assert(m[0] !== m[1], "two different target pages");
  });
  it("封面页（v2.3.23）：一页；有图 = 图铺满 + 书名描边；没图 = 纸 + 装订线 + 书名不描边；txt 稿没有装订线；竖排一字一个 op", () => {
    const ts = typesetFor(20), geo = pdfPageGeometry(ts); const img = { jpeg: new Uint8Array([0xff, 0xd8]), w: 600, h: 900, components: 3 };
    const title = String.fromCodePoint(0x6c14, 0x7403, 0x5192, 0x9669, 0x5bb6);   // 气球冒险家
    const mk = (extra) => planPdfBook({ title, date: "20250829", cover: null, sections: [{ kind: "text", heading: null, text: guo }], look, typeset: ts, font, ...extra });
    const withImg = mk({ cover: img }), paper = mk({}), draft = mk({ coverKind: "draft" });
    for (const p of [withImg, paper, draft]) eq(p.pageCount, 2);
    const t = (p) => p.doc.pages[0].ops.filter((o) => o.op === "text");
    const cells = t(withImg).filter((o) => o.text !== "20250829");
    eq(cells.map((o) => o.text).join(""), title, "one op per character, in reading order");
    // 有图：字底下垫半透明的纸（书名一列一块 + 日期一块），画在图之后、字之前；没有描边
    { const ops = withImg.doc.pages[0].ops, pads = ops.filter((o) => o.op === "rect" && o.alpha != null);
      eq(pads.length, 2, "one pad for the title, one for the date"); assert(pads.every((o) => o.alpha === 0.78 && o.radius > 0), "translucent and rounded");
      const iImg = ops.findIndex((o) => o.op === "image"), iPad = ops.findIndex((o) => o.op === "rect" && o.alpha != null), iTxt = ops.findIndex((o) => o.op === "text");
      assert(iImg < iPad && iPad < iTxt, "image, then pads, then text");
      const col = pads[0]; for (const c of cells) assert(c.x >= col.x - 0.01 && c.x + c.size <= col.x + col.w + 0.01 && c.y <= col.y + col.h && c.y - c.size * 0.9 >= col.y - 0.01, "every title glyph sits on the pad");
      const bytes = new TextDecoder("latin1").decode(writePdf(withImg.doc, font)); assert(/\/ExtGState << \/GS78 << \/ca 0\.78 >> >>/.test(bytes), "transparency state declared on the page");
      assert(!/\/ExtGState/.test(new TextDecoder("latin1").decode(writePdf(paper.doc, font))), "no transparency when there is no image"); }
    assert(cells.every((o, i) => i === 0 || (Math.abs(o.x - cells[0].x) < 0.01 && o.y > cells[i - 1].y)), "one column, top to bottom");
    assert(cells[0].x > geo.w * 0.7, "the column sits at the right");
    eq(t(withImg).filter((o) => o.text === "20250829").length, 1); assert(withImg.doc.pages[0].ops.some((o) => o.op === "image"));
    assert(!paper.doc.pages[0].ops.some((o) => o.op === "image") && !paper.doc.pages[0].ops.some((o) => o.op === "rect" && o.alpha != null), "paper cover: no image, no pads");
    const rects = (p) => p.doc.pages[0].ops.filter((o) => o.op === "rect");
    eq(rects(paper).length, 3, "page bg + cover paper + spine"); assert(rects(paper)[2].w < geo.w * 0.06 && rects(paper)[2].x === 0, "spine on the left");
    eq(rects(draft).length, 2, "a draft is a plain sheet: no spine");
    // 写成 PDF：描边 + 旋转的指令不让写出器出错
    const rot = mk({ title: title + "\uff08ABCDEF\uff09", cover: img }); assert(t(rot).some((o) => o.rotate === 90), "brackets / long latin runs are rotated");
    assert(writePdf(rot.doc, font).length > 1000);
  });
  it("estimatePdfPages（导出前报「约 N 页」）：纯汉字和真排的页数一样（三档、带章节名 / 目录 / 图片页 / 封面）；夹英文的差不出一成", () => {
    const img = { jpeg: new Uint8Array([0xff, 0xd8]), w: 10, h: 10, components: 3 };
    for (const chars of CHARS_PRESETS) {
      const ts = typesetFor(chars), geo = pdfPageGeometry(ts);
      const sections = [
        { kind: "text", heading: "目录", text: "", toc: [{ label: "甲", target: 1 }, { label: "乙", target: 3 }] },
        { kind: "text", heading: "甲", text: (guo.repeat(chars * 3 + 5) + "\n").repeat(geo.linesPerPage), toc: [{ label: "乙", target: 3 }] },
        { kind: "image", heading: null, image: img },
        { kind: "text", heading: "乙", text: guo.repeat(7) + "\n\n" + guo.repeat(chars * geo.linesPerPage * 2) },
        { kind: "text", heading: null, text: guo },
      ];
      for (const front of [true, false]) {
        const real = planPdfBook({ title: "t", date: null, cover: null, front, sections, look, typeset: ts, font }).pageCount;
        eq(estimatePdfPages(sections, ts, front), real, `${chars} 字档 front=${front}`);
      }
    }
    const ts = typesetFor(20); const mixed = ("这是一段夹着 English words 和数字 12345 的正文，标点，也不少。Another sentence follows here. ").repeat(60);
    const real = planPdfBook({ title: "t", date: null, cover: null, front: true, sections: [{ kind: "text", heading: "混排", text: mixed }], look, typeset: ts, font }).pageCount;
    const est = estimatePdfPages([{ kind: "text", heading: "混排", text: mixed }], ts, true);
    assert(Math.abs(est - real) <= Math.max(1, real * 0.1), `est ${est} vs real ${real}`);
  });
  it("落款（导出时间）印在最后一页左下角；coverTitle 只换封面上的名字；created 写进文档信息", () => {
    const ts = typesetFor(14), geo = pdfPageGeometry(ts); const img = { jpeg: new Uint8Array([0xff, 0xd8]), w: 600, h: 900, components: 3 };
    const plan = planPdfBook({ title: "书 · 第一章", coverTitle: "第一章", date: null, cover: img, stamp: "2026-10-01 03:12 导出", sections: [{ kind: "text", heading: null, text: guo.repeat(14 * geo.linesPerPage * 2) }], look, typeset: ts, font });
    const last = plan.doc.pages.at(-1).ops.filter((o) => o.op === "text"); const st = last.find((o) => o.text === "2026-10-01 03:12 导出");
    assert(st && Math.abs(st.x - geo.side) < 0.01 && st.y > geo.h - geo.bottom && st.size < PDF_FONT_PT, JSON.stringify(st));
    const num = last.find((o) => /^\d+$/.test(o.text)); const stEnd = st.x + [...st.text].length * st.size; assert(stEnd < num.x || [...st.text].length * st.size * 0.6 + st.x < num.x, "does not run into the page number");
    for (const pg of plan.doc.pages.slice(0, -1)) assert(!pg.ops.some((o) => o.op === "text" && /导出/.test(o.text)), "only on the last page");
    eq(plan.doc.pages[0].ops.filter((o) => o.op === "text").map((o) => o.text).join(""), "第一章", "cover prints coverTitle"); eq(plan.doc.title, "书 · 第一章");
    const d = new Date(2026, 9, 1, 3, 12, 5); plan.doc.created = d;
    assert(/\/CreationDate \(D:20261001031205[+-]\d\d'\d\d'\)/.test(new TextDecoder("latin1").decode(writePdf(plan.doc, font))), "CreationDate");
  });
  it("书签有层级：按 level 嵌套（父 / 子 / 兄弟链 + Count），和目录树同一个结构；不给 level = 平铺", () => {
    const ts = typesetFor(20); const mk = (levels) => planPdfBook({ title: "t", date: null, cover: null, front: false, sections: levels.map((lv, i) => ({ kind: "text", heading: "H" + i, text: guo, ...(lv ? { level: lv } : {}) })), look, typeset: ts, font });
    const plan = mk([0, 1, 2, 1, 0, 1]);   // H0 > (H1 > H2, H3), H4 > H5
    eq(plan.doc.outline.map((o) => o.level ?? 0).join(), "0,1,2,1,0,1");
    const pdf = new TextDecoder("latin1").decode(writePdf(plan.doc, font));
    const objs = [...pdf.matchAll(/\n(\d+) 0 obj\n<< \/Title <([0-9A-F]+)> \/Parent (\d+) 0 R([^\n]*)>>/g)].map((m) => ({ id: +m[1], title: m[2], parent: +m[3], rest: m[4] }));
    eq(objs.length, 6); const title = (i) => "FEFF" + [..."H" + i].map((c) => c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")).join("");
    const by = (i) => objs.find((o) => o.title === title(i)); const root = by(0).parent;
    eq(by(4).parent, root); eq(by(1).parent, by(0).id); eq(by(2).parent, by(1).id); eq(by(3).parent, by(0).id); eq(by(5).parent, by(4).id);
    assert(new RegExp(`/First ${by(1).id} 0 R /Last ${by(3).id} 0 R /Count 3`).test(by(0).rest), by(0).rest); assert(new RegExp(`/Next ${by(4).id} 0 R`).test(by(0).rest));
    assert(new RegExp(`/Next ${by(3).id} 0 R`).test(by(1).rest) && new RegExp(`/Prev ${by(1).id} 0 R`).test(by(3).rest) && !/\/First/.test(by(3).rest));
    assert(new RegExp(`${root} 0 obj\\n<< /Type /Outlines /First ${by(0).id} 0 R /Last ${by(4).id} 0 R /Count 6`).test(pdf), "root links the two top-level items");
    const flat = new TextDecoder("latin1").decode(writePdf(mk([0, 0, 0]).doc, font)); assert(!/\/Title <[0-9A-F]+> \/Parent \d+ 0 R[^\n]*\/First/.test(flat), "no level → flat");
  });
  it("章节名占整数行：有章节名的页少 3 行", () => {
    const ts = typesetFor(20), geo = pdfPageGeometry(ts);
    const plan = planPdfBook({ title: "t", date: null, cover: null, sections: [{ kind: "text", heading: "h", text: guo.repeat(20 * geo.linesPerPage) }], look, typeset: ts, font });
    const first = plan.doc.pages[1].ops.filter((o) => o.op === "text" && o.size === PDF_FONT_PT);
    eq(first.length, geo.linesPerPage - 3); eq(plan.pageCount, 3);
  });
});

// 注音字体的上下文替换（v2.3.21）：vendor/fonts/pinyin.ttf.gz = 萌神手写体 2.0。期望值 = HarfBuzz（uharfbuzz 0.56.2）对同一份字体排出来的字形号，2026-10-01 录的；
//   换字体文件的话重录（开发机：对 9,289 字的语料逐字比过，零差异）。
const PINYIN = decodeURIComponent(new URL("../vendor/fonts/pinyin.ttf.gz", import.meta.url).pathname);
const HB_FIXTURE = [["银行行长走在行人道上，一行人行色匆匆。", [57410, 49346, 49343, 57800, 52594, 18001, 49343, 12234, 54494, 11783, 64516, 11751, 49343, 12234, 49343, 45507, 15017, 15017, 4080]], ["重庆很重要，重新开始，重量。", [55417, 22552, 23174, 55417, 50089, 64516, 55420, 27434, 22851, 19650, 64516, 55417, 55424, 4080]], ["音乐老师很快乐。", [59408, 11980, 43966, 22231, 23174, 23405, 11977, 4080]], ["他长大了，头发很长。", [12311, 57800, 19225, 12091, 64516, 19266, 15521, 23174, 57800, 4080]], ["我们还是觉得睡觉最好，觉得好看。", [24762, 12364, 54177, 27723, 50264, 23203, 38570, 50264, 28194, 19454, 64516, 50264, 23203, 19457, 38355, 4080]], ["朝阳区的朝霞，朝着太阳。", [28279, 58299, 15128, 38036, 28279, 58897, 64516, 28276, 38479, 19237, 58299, 4080]], ["了解了，受不了了。", [12094, 50333, 12091, 64516, 15542, 11797, 12094, 12091, 4080]], ["银行", [57410, 49346]], ["行", [49343]], ["行走", [49343, 52594]], ["着急地看着我，穿着衣服，着火了。", [38479, 23569, 18027, 38355, 38485, 24762, 64516, 40455, 38485, 49396, 28231, 64516, 38479, 34347, 12091, 4080]], ["一会儿开会，会计。", [11751, 12491, 13922, 22851, 12491, 64516, 12491, 51412, 4080]], ["数学老师数了数。", [27254, 20645, 43966, 22231, 27254, 12091, 27254, 4080]], ["这只小狗只吃肉。", [54182, 15599, 21058, 35809, 15599, 15673, 44261, 4080]], ["大夫说没关系，淹没。", [19225, 19241, 51646, 31809, 14065, 41880, 64516, 32745, 31809, 4080]], ["好学生好学。", [19454, 20645, 37159, 19454, 20645, 4080]], ["便宜，方便。", [12930, 20767, 64516, 27451, 12930, 4080]], ["差不多，出差，参差。", [22157, 11797, 19203, 64516, 14364, 22161, 64516, 15476, 22162, 4080]], ["都是首都。", [54903, 27723, 60454, 54906, 4080]], ["得到，跑得快，得去。", [23203, 14503, 64516, 52850, 23203, 23405, 64516, 23203, 15455, 4080]], ["的确，目的，我的。", [38039, 39226, 64516, 38276, 38040, 64516, 24762, 38036, 4080]]];
describe("export/ttf rclt（注音字体按词选读音）" + (existsSync(PINYIN) ? "" : "（SKIP：没有 vendor/fonts/pinyin.ttf.gz）"), () => {
  if (!existsSync(PINYIN)) { it("skip: pinyin font not vendored", () => {}); return; }
  const pin = parseTtf(new Uint8Array(gunzipSync(readFileSync(PINYIN))));
  it("字体有 rclt、查找表种类全认识", () => { assert(pin.contextual); eq(pin.shapeSkipped.join(), ""); assert(/Mengshen/.test(pin.psName), pin.psName); });
  it("每一行排出来的字形号和 HarfBuzz 一样；一个码点一个字形", () => {
    let changed = 0;
    for (const [line, want] of HB_FIXTURE) { const got = pin.shape(line); eq(got.length, [...line].length); eq(got.join(","), want.join(","), line); [...line].forEach((ch, i) => { if (got[i] !== pin.glyphId(ch.codePointAt(0))) changed++; }); }
    assert(changed >= 10, `rclt actually changed some glyphs: ${changed}`);
  });
  it("同一个字，上下文不同 → 字形不同；折行拆开的词靠 before / after 找回来", () => {
    const hang = String.fromCodePoint(0x884c), yin = String.fromCodePoint(0x94f6);   // 行、银
    const alone = pin.shape(hang)[0], inWord = pin.shape(yin + hang)[1];
    assert(alone === pin.glyphId(0x884c) && inWord !== alone, `${alone} vs ${inWord}`);
    // pdf-book：两行，上一行以「银」结尾、下一行以「行」开头 → 第二行的 op 带 before
    const ts = typesetFor(14); const text = String.fromCharCode(0x56fd).repeat(13) + yin + hang + String.fromCharCode(0x56fd).repeat(3);
    const plan = planPdfBook({ title: "t", date: null, cover: null, front: false, sections: [{ kind: "text", heading: null, text }], look: { paper: "#fff", ink: "#000", inkSoft: "#000", muted: "#888", rule: null }, typeset: ts, font: pin });
    const ops = plan.doc.pages[0].ops.filter((o) => o.op === "text" && o.size === PDF_FONT_PT);
    eq(ops.length, 2); eq([...ops[0].text].length, 14); assert(ops[0].text.endsWith(yin) && ops[1].text.startsWith(hang));
    assert(ops[1].before && ops[1].before.endsWith(yin) && ops[0].after && ops[0].after.startsWith(hang), JSON.stringify({ b: ops[1].before, a: ops[0].after }));
    eq(pin.shape(ops[1].before + ops[1].text)[[...ops[1].before].length], inWord, "带上前文 → 选回词里的读音");
    // 写出来的 PDF 能成、没有缺字
    const stats = { glyphs: 0, missing: [], fontBytes: 0 }; const pdf = writePdf(plan.doc, pin, { stats });
    assert(pdf.length > 1000 && stats.missing.length === 0 && stats.glyphs >= 4, JSON.stringify({ n: pdf.length, ...stats }));
  });
  it("annotate：换了读音的字后面补变体选择符（cmap 14），别的字不动；去掉选择符 = 原文；带前文也行", () => {
    const hang = String.fromCodePoint(0x884c), yin = String.fromCodePoint(0x94f6), VS = /[\u{E0100}-\u{E01EF}]/gu;
    const a = pin.annotate(yin + hang + hang + String.fromCodePoint(0x8d70));   // 银行行走
    eq(a.replace(VS, ""), yin + hang + hang + String.fromCodePoint(0x8d70)); eq([...a].length, 5, "exactly one selector added");
    const cps = [...a].map((c) => c.codePointAt(0)); assert(cps[2] >= 0xe01e0 && cps[2] <= 0xe01ef && cps[1] === 0x884c, cps.map((c) => c.toString(16)).join(" "));
    eq(pin.annotate(hang), hang, "alone = default reading, no selector");
    const b = pin.annotate(hang + String.fromCodePoint(0x91cc), yin);   // 上一行以「银」结尾，这一行「行里」
    eq([...b].length, 3); eq([...b][0], hang); assert([...b][1].codePointAt(0) === cps[2], "same selector as inside the word");
    for (const [line, want] of HB_FIXTURE) {   // 每一行：补了选择符的字 = 被 rclt 换掉的字
      const ann = [...pin.annotate(line)]; let k = 0, marked = 0, changed = 0;
      [...line].forEach((ch, i) => { eq(ann[k], ch); k++; const sel = ann[k] && ann[k].codePointAt(0) >= 0xe0100; if (sel) { k++; marked++; } if (want[i] !== pin.glyphId(ch.codePointAt(0))) { changed++; assert(sel, `no selector for ${ch} in ${line}`); } });
      eq(marked, changed, line);
    }
  });
  it("普通字体（黑体）没有 rclt：shape = 逐字查 cmap，pdf-book 不带前后文", () => {
    if (!FONT) return; const raw = readFileSync(FONT); const sans = parseTtf(new Uint8Array(FONT.endsWith(".gz") ? gunzipSync(raw) : raw));
    if (sans.contextual) return;   // 测试字体换成了别的注音字体就不测这条
    const s = String.fromCodePoint(0x94f6, 0x884c); eq(sans.shape(s).join(), [sans.glyphId(0x94f6), sans.glyphId(0x884c)].join());
  });
});
