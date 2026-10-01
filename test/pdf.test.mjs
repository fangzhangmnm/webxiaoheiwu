// PDF 引擎（src/export/ttf.ts + pdf.ts）：TTF 解析 / 子集、PDF 结构。要一款真的 glyf TrueType 字体：
//   环境变量 XHW_TEST_FONT → 内置字体 vendor/fonts/sans.ttf.gz（v2.3.15 进仓，所以平时不会 SKIP）→ 开发机 OneDrive 里那份。created 2026-09-30 by Claude Fable 5.1
import { describe, it, eq, assert } from "./runner.mjs";
const throws = (fn, re) => { try { fn(); } catch (e) { if (re && !re.test(e.message)) throw new Error(`threw the wrong thing: ${e.message}`); return true; } throw new Error("expected a throw"); };
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { parseTtf, NotTrueTypeError } from "../src/export/ttf.ts";
import { writePdf, jpegInfo } from "../src/export/pdf.ts";
import { planPdfBook, pdfPageGeometry, PDF_FONT_PT } from "../src/export/pdf-book.ts";
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
  it("章节名占整数行：有章节名的页少 3 行", () => {
    const ts = typesetFor(20), geo = pdfPageGeometry(ts);
    const plan = planPdfBook({ title: "t", date: null, cover: null, sections: [{ kind: "text", heading: "h", text: guo.repeat(20 * geo.linesPerPage) }], look, typeset: ts, font });
    const first = plan.doc.pages[1].ops.filter((o) => o.op === "text" && o.size === PDF_FONT_PT);
    eq(first.length, geo.linesPerPage - 3); eq(plan.pageCount, 3);
  });
});
