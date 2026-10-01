// 书 → PDF 的分页排版（纯函数：不碰 DOM、不碰 canvas）。created 2026-09-30 by Claude Fable 5.1
//   user 2026-09-30「只要比高考作文和童话长一点的，导出长图都很费劲。老老实实做 pdf 吧」「先把 pdf 导出给做出来」。
//   和长图同一套规矩：每行几个字（行宽三档）定排版，行距跟档，折行 / 避头尾复用 long-image.wrapText，正文以汉字墨迹定基线、坐在写字线上；
//   不同的只有两件事：量字宽用**嵌进去的那款字体自己的前进宽**（不是 canvas 量系统字体——否则折行和 PDF 里的字对不上），以及按页切。
//   页面（v2.3.16，user 2026-09-30「同意sqrt2」「pdf出单页，拼版是以后的问题」；提案 §10.5）：
//     三档共用一个比例 **1 : √2**（文库本 / 32 开 / A 系列；v2.3.14 的 16 : 9 错在把 PDF 当手机屏——手机那条信道是长图）。
//     宽 = (字数 + 两边各 2.2 字) × 字号，高 = 宽 × √2；上 2.4 字、下 2.6 字（含页码）——留白是 bookmaker micro 开本折成字数。
//     字号 = **9 pt 实体字号**（micro 的字号；直接打印就是书的大小）→ 页面 58 × 83 / 78 × 110 / 103 × 146 mm，相邻两档正好差一次对折。
//     每页行数不是 knob，由比例推出：版心高 = (行数 − 1) × 行距 + 1 字（bookmaker 同一条式子）→ 11 / 17 / 25 行。
//     单页、左右对称（不分订口 / 切口）；拼版是以后的事。
//   版式：封面图一页（有的话；铺满整页、等比、裁掉多出来的）→ 书名页 → 每个正文页另起一页（章起新页）、图片页独占一页；页脚页码；每个有名字的正文页一条书签。
import type { PdfDoc, PdfImage, PdfOp, PdfPage, PdfOutlineItem, Rgb } from "./pdf.ts";
import type { TtfFont } from "./ttf.ts";
import { wrapText, type ExportTypeset } from "./long-image.ts";
import type { TextMeasurer, TextStyle } from "../image/codec.ts";
import { statsForText } from "../doc-model.ts";

export type PdfSection =
  | { kind: "text"; heading: string | null; text: string }
  | { kind: "image"; heading: null; image: PdfImage };
export interface PdfBookLook { paper: string; ink: string; inkSoft: string; muted: string; rule: string | null }
export interface PdfBookSpec {
  title: string; date: string | null; cover: PdfImage | null;
  /** 封面页 + 书名页。整本 / 整篇才有；false = 第一页就是正文（这一页 / 这一支）。缺省 true。 */
  front?: boolean;
  sections: PdfSection[]; look: PdfBookLook; typeset: ExportTypeset; font: TtfFont;
}
export interface PdfBookPlan { doc: PdfDoc; cjk: number; en: number; textPages: number; imagePages: number; pageCount: number; pageW: number; pageH: number }

/** 正文字号（pt）= 实体字号：按 100% 打印出来就是这么大（屏上阅读器贴屏宽显示，20 字档的页宽 78 mm ≈ 手机屏宽）。 */
export const PDF_FONT_PT = 9;
/** 页面宽高比（宽 : 高 = 1 : √2）。 */
export const PDF_PAGE_RATIO = Math.SQRT2;
/** 留白（单位 = 字）：左右各 SIDE，上 TOP，下 BOTTOM（含页码）。 */
export const PDF_MARGIN_EM = { side: 2.2, top: 2.4, bottom: 2.6 } as const;
/** 这一档的页面几何（pt）与每页行数。纯算术，不要字体。 */
export function pdfPageGeometry(typeset: ExportTypeset): { w: number; h: number; side: number; top: number; bottom: number; lineHeight: number; linesPerPage: number } {
  const F = PDF_FONT_PT, r1 = (v: number): number => Math.round(v * 10) / 10;
  const side = r1(PDF_MARGIN_EM.side * F), w = r1(typeset.charsPerLine * F + 2 * side), h = r1(w * PDF_PAGE_RATIO);
  const top = r1(PDF_MARGIN_EM.top * F), bottom = r1(PDF_MARGIN_EM.bottom * F);
  const lineHeight = F * (typeset.lineHeightRatio + (typeset.rubyBand ?? 0));
  const linesPerPage = Math.max(1, Math.floor((h - top - bottom - F) / lineHeight + 1e-6) + 1);
  return { w, h, side, top, bottom, lineHeight, linesPerPage };
}

/** CSS 颜色串（`#rgb` / `#rrggbb` / `rgb()` / `rgba()`）→ 0..1 的 RGB；认不出 → 黑。 */
export function parseCssColor(s: string): Rgb {
  const t = s.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(t);
  if (m) return [...m[1]!].map((c) => parseInt(c + c, 16) / 255) as Rgb;
  m = /^#([0-9a-f]{6})/i.exec(t);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1]!.slice(i, i + 2), 16) / 255) as Rgb;
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(t);
  if (m) return [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255];
  return [0, 0, 0];
}

/** 用字体自己的度量量字宽（给 wrapText）。没有的字按 .notdef 的宽算。 */
export function fontMeasurer(font: TtfFont): TextMeasurer {
  const k = 1 / font.unitsPerEm; const cache = new Map<number, number>();
  const adv = (cp: number): number => { let w = cache.get(cp); if (w === undefined) { w = font.advance(font.glyphId(cp)) * k; cache.set(cp, w); } return w; };
  const guo = font.inkOf(font.glyphId(0x56fd));
  return {
    width: (text: string, style: TextStyle) => { let w = 0; for (const ch of text) w += adv(ch.codePointAt(0)!); return w * style.sizePx; },
    ascent: (style: TextStyle) => ({ asc: font.ascender * k * style.sizePx, desc: -font.descender * k * style.sizePx }),
    ink: (style: TextStyle) => (guo ? { asc: guo[3] * k * style.sizePx, desc: Math.max(0, -guo[1] * k * style.sizePx) } : { asc: 0.8 * style.sizePx, desc: 0.07 * style.sizePx }),
  };
}

export function planPdfBook(spec: PdfBookSpec): PdfBookPlan {
  const { font, look } = spec; const m = fontMeasurer(font);
  const F = PDF_FONT_PT, inner = spec.typeset.charsPerLine * F, geo = pdfPageGeometry(spec.typeset);
  const W = geo.w, H = geo.h, SIDE = geo.side, TOP = geo.top, bodyBottom = H - geo.bottom;
  const LHbase = F * spec.typeset.lineHeightRatio, LH = geo.lineHeight;
  const HALF_LEAD = (LH - F) / 2;   // 行盒里字上下各半个行间；一页的头一行把上半个行间让给天头、末一行把下半个让给地脚（版心高 = (行数 − 1) × 行距 + 1 字）
  const st = (size: number): TextStyle => ({ family: "", sizePx: size, color: "" });
  const ink = m.ink(st(F));
  const bodyBase = LH - (LHbase - (ink.asc + ink.desc)) / 2 - ink.desc;   // 汉字墨迹在基准行高里居中、整体贴行底（和长图同一条规矩）
  const ruleY = bodyBase + 0.18 * F;
  const paper = parseCssColor(look.paper), cInk = parseCssColor(look.ink), cBody = parseCssColor(look.inkSoft), cMuted = parseCssColor(look.muted), cRule = look.rule ? parseCssColor(look.rule) : null;

  const pages: PdfPage[] = []; const outline: PdfOutlineItem[] = []; const numbered: number[] = [];   // numbered = 印页码的页
  let ops: PdfOp[] = [], y = 0;
  let lineTop = 0;   // 这一页正文行盒的起点（y 从这里起每行加 LH）；一页最多 geo.linesPerPage 行
  const newPage = (withNumber = true): void => { ops = [{ op: "rect", x: 0, y: 0, w: W, h: H, color: paper }]; pages.push({ w: W, h: H, ops }); if (withNumber) numbered.push(pages.length - 1); y = TOP; lineTop = TOP - HALF_LEAD; };
  /** 行盒 [y, y + LH) 的字（去掉下半个行间）还在版心里吗。 */
  const fits = (): boolean => y + LH - HALF_LEAD <= bodyBottom + 0.01;
  const centered = (text: string, size: number, baseY: number, color: Rgb): void => { ops.push({ op: "text", x: (W - m.width(text, st(size))) / 2, y: baseY, text, size, color }); };
  /** 图片放进一个框里（等比，居中）。 */
  /** 图片铺满一个框（等比放大到盖住整个框、居中，多出来的被页面边界裁掉——PDF 页面外的内容不显示也不打印）。封面用：user 2026-10-01「导出pdf的时候封面用fill」。 */
  const fill = (img: PdfImage, bx: number, by: number, bw: number, bh: number): void => { const s = Math.max(bw / img.w, bh / img.h); const w = img.w * s, h = img.h * s; ops.push({ op: "image", x: bx + (bw - w) / 2, y: by + (bh - h) / 2, w, h, image: img }); };
  const contain = (img: PdfImage, bx: number, by: number, bw: number, bh: number): void => { const s = Math.min(bw / img.w, bh / img.h); const w = img.w * s, h = img.h * s; ops.push({ op: "image", x: bx + (bw - w) / 2, y: by + (bh - h) / 2, w, h, image: img }); };

  // ── 封面 + 书名页 ──
  if (spec.front !== false) {
    if (spec.cover) { newPage(false); fill(spec.cover, 0, 0, W, H); }   // 封面铺满整页（只用于整页框：靠页面边界裁）；图片页仍是完整放进版心
    newPage(false);
    const size = 1.6 * F, lh = size * 1.45; const lines = wrapText(spec.title, inner, st(size), m); let ty = H * 0.36;
    for (const line of lines) { centered(line, size, ty, cInk); ty += lh; }
    if (spec.date) centered(spec.date, 0.7 * F, ty + 0.2 * F, cMuted);
  }

  // ── 各页 ──
  let cjk = 0, en = 0, textPages = 0, imagePages = 0;
  for (const sec of spec.sections) {
    if (sec.kind === "image") { imagePages++; newPage(); contain(sec.image, SIDE, TOP, inner, bodyBottom - TOP); continue; }
    textPages++; const s = statsForText(sec.text); cjk += s.cjk; en += s.en;
    newPage();   // 章起新页
    y = lineTop;
    if (sec.heading != null) {
      outline.push({ title: sec.heading, page: pages.length - 1 });
      // 章节名占整数行（正文行格不乱）：每行章节名 = 2 个正文行，底下再空 1 行
      const size = 1.25 * F; const hl = wrapText(sec.heading, inner, st(size), m);
      for (const line of hl) { centered(line, size, y + LH * 1.5, cInk); y += 2 * LH; }
      y += LH;
    }
    for (const para of sec.text.replace(/\r\n?/g, "\n").replace(/\s+$/, "").split("\n")) {
      for (const line of wrapText(para, inner, st(F), m)) {
        if (!fits()) { newPage(); y = lineTop; }
        if (cRule) ops.push({ op: "line", x1: SIDE, y1: y + ruleY, x2: W - SIDE, y2: y + ruleY, color: cRule, width: 0.03 * F });
        if (line !== "") ops.push({ op: "text", x: SIDE, y: y + bodyBase, text: line, size: F, color: cBody });
        y += LH;
      }
    }
  }
  // ── 页码（正文 / 图片页；封面与书名页不印）──
  numbered.forEach((pi, i) => { const p = pages[pi]!; const label = String(i + 1), size = 0.75 * F; p.ops.push({ op: "text", x: (W - m.width(label, st(size))) / 2, y: H - 1.0 * F, text: label, size, color: cMuted }); });

  return { doc: { title: spec.title, pages, outline }, cjk, en, textPages, imagePages, pageCount: pages.length, pageW: W, pageH: H };
}
