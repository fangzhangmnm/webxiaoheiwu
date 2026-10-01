// 书 → PDF 的分页排版（纯函数：不碰 DOM、不碰 canvas）。created 2026-09-30 by Claude Fable 5.1
//   user 2026-09-30「只要比高考作文和童话长一点的，导出长图都很费劲。老老实实做 pdf 吧」「先把 pdf 导出给做出来」。
//   和长图同一套规矩：每行几个字（行宽三档）定排版，行距跟档，折行 / 避头尾复用 long-image.wrapText，正文以汉字墨迹定基线、坐在写字线上；
//   不同的只有两件事：量字宽用**嵌进去的那款字体自己的前进宽**（不是 canvas 量系统字体——否则折行和 PDF 里的字对不上），以及按页切。
//   页面 = 手机比例的「掌中书」：宽 = 字数 × 字号 + 两边各 1.6 字，高 = 宽 × 16/9；字号 16 pt（PDF 是矢量，读的时候贴屏宽，字号只定比例）。
//   ⚠ 这组比例是临时值，user 2026-09-30「pdf 之后可能得好好 grill 一下，你给的比例都不对。等会讨论」——定了再改这里，别当成已拍板。
//   版式：封面图一页（有的话）→ 书名页 → 每个正文页另起一页（章起新页）、图片页独占一页；页脚页码；每个有名字的正文页一条书签。
import type { PdfDoc, PdfImage, PdfOp, PdfPage, PdfOutlineItem, Rgb } from "./pdf.ts";
import type { TtfFont } from "./ttf.ts";
import { wrapText, type ExportTypeset } from "./long-image.ts";
import type { TextMeasurer, TextStyle } from "../image/codec.ts";
import { statsForText } from "../doc-model.ts";

export type PdfSection =
  | { kind: "text"; heading: string | null; text: string }
  | { kind: "image"; heading: null; image: PdfImage };
export interface PdfBookLook { paper: string; ink: string; inkSoft: string; muted: string; rule: string | null }
export interface PdfBookSpec { title: string; date: string | null; cover: PdfImage | null; sections: PdfSection[]; look: PdfBookLook; typeset: ExportTypeset; font: TtfFont }
export interface PdfBookPlan { doc: PdfDoc; cjk: number; en: number; textPages: number; imagePages: number; pageCount: number; pageW: number; pageH: number }

/** 正文字号（pt）。PDF 是矢量：阅读器贴屏宽显示，这个数只定页面比例和打印出来的大小。 */
export const PDF_FONT_PT = 16;

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
  const F = PDF_FONT_PT, inner = spec.typeset.charsPerLine * F, SIDE = Math.round(1.6 * F * 10) / 10;
  const W = inner + 2 * SIDE, H = Math.round(W * 16 / 9);
  const TOP = 2.2 * F, BOTTOM = 2.6 * F, bodyBottom = H - BOTTOM;
  const LHbase = F * spec.typeset.lineHeightRatio, LH = LHbase + F * (spec.typeset.rubyBand ?? 0);
  const st = (size: number): TextStyle => ({ family: "", sizePx: size, color: "" });
  const ink = m.ink(st(F));
  const bodyBase = LH - (LHbase - (ink.asc + ink.desc)) / 2 - ink.desc;   // 汉字墨迹在基准行高里居中、整体贴行底（和长图同一条规矩）
  const ruleY = bodyBase + 0.18 * F;
  const paper = parseCssColor(look.paper), cInk = parseCssColor(look.ink), cBody = parseCssColor(look.inkSoft), cMuted = parseCssColor(look.muted), cRule = look.rule ? parseCssColor(look.rule) : null;

  const pages: PdfPage[] = []; const outline: PdfOutlineItem[] = []; const numbered: number[] = [];   // numbered = 印页码的页
  let ops: PdfOp[] = [], y = 0;
  const newPage = (withNumber = true): void => { ops = [{ op: "rect", x: 0, y: 0, w: W, h: H, color: paper }]; pages.push({ w: W, h: H, ops }); if (withNumber) numbered.push(pages.length - 1); y = TOP; };
  const centered = (text: string, size: number, baseY: number, color: Rgb): void => { ops.push({ op: "text", x: (W - m.width(text, st(size))) / 2, y: baseY, text, size, color }); };
  /** 图片放进一个框里（等比，居中）。 */
  const contain = (img: PdfImage, bx: number, by: number, bw: number, bh: number): void => { const s = Math.min(bw / img.w, bh / img.h); const w = img.w * s, h = img.h * s; ops.push({ op: "image", x: bx + (bw - w) / 2, y: by + (bh - h) / 2, w, h, image: img }); };

  // ── 封面 + 书名页 ──
  if (spec.cover) { newPage(false); contain(spec.cover, 0, 0, W, H); }
  newPage(false);
  { const size = 1.6 * F, lh = size * 1.45; const lines = wrapText(spec.title, inner, st(size), m); let ty = H * 0.36;
    for (const line of lines) { centered(line, size, ty, cInk); ty += lh; }
    if (spec.date) centered(spec.date, 0.7 * F, ty + 0.2 * F, cMuted); }

  // ── 各页 ──
  let cjk = 0, en = 0, textPages = 0, imagePages = 0;
  for (const sec of spec.sections) {
    if (sec.kind === "image") { imagePages++; newPage(); contain(sec.image, SIDE, TOP, inner, bodyBottom - TOP); continue; }
    textPages++; const s = statsForText(sec.text); cjk += s.cjk; en += s.en;
    newPage();   // 章起新页
    if (sec.heading != null) {
      outline.push({ title: sec.heading, page: pages.length - 1 });
      const size = 1.25 * F, lh = size * 1.4; y += 0.6 * F;
      for (const line of wrapText(sec.heading, inner, st(size), m)) { centered(line, size, y + lh * 0.75, cInk); y += lh; }
      y += 0.9 * F;
    }
    for (const para of sec.text.replace(/\r\n?/g, "\n").replace(/\s+$/, "").split("\n")) {
      for (const line of wrapText(para, inner, st(F), m)) {
        if (y + LH > bodyBottom) newPage();
        if (cRule) ops.push({ op: "line", x1: SIDE, y1: y + ruleY, x2: W - SIDE, y2: y + ruleY, color: cRule, width: 0.5 });
        if (line !== "") ops.push({ op: "text", x: SIDE, y: y + bodyBase, text: line, size: F, color: cBody });
        y += LH;
      }
    }
  }
  // ── 页码（正文 / 图片页；封面与书名页不印）──
  numbered.forEach((pi, i) => { const p = pages[pi]!; const label = String(i + 1), size = 0.65 * F; p.ops.push({ op: "text", x: (W - m.width(label, st(size))) / 2, y: H - 1.1 * F, text: label, size, color: cMuted }); });

  return { doc: { title: spec.title, pages, outline }, cjk, en, textPages, imagePages, pageCount: pages.length, pageW: W, pageH: H };
}
