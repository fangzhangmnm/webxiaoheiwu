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
import { layoutCoverTitle } from "./cover-title.ts";

export type PdfSection =
  | { kind: "text"; heading: string | null; text: string; /** 在目录树里的层级（0 = 最外层）：书签按它嵌套。缺省 0。 */ level?: number; /** 子节目录：正文后面空一行列出来，每行链到那一节的第一页、行尾印页码。target = sections 里的序号。 */ toc?: PdfTocEntry[] }
  | { kind: "image"; heading: null; image: PdfImage };
export interface PdfTocEntry { label: string; target: number }
export interface PdfBookLook { paper: string; ink: string; inkSoft: string; muted: string; rule: string | null; /** 目录链接的颜色（编辑器里子节目录那种）；不给 = 墨色 */ link?: string }
/** 封面的配色（书架封面那一套 --cover-*）。 */
export interface CoverLook { paper: string; ink: string; inkSoft: string; spine: string; spineEdge: string }
export const DEFAULT_COVER_LOOK: CoverLook = { paper: "#e9e3d5", ink: "#43382c", inkSoft: "#857b6a", spine: "#d2c9b5", spineEdge: "#c2b8a2" };
/** 书名压在封面图上时，字底下那块纸的不透明度（书架封面底栏同一个数）。user 2026-10-01「标题的字下面还是垫一个半透明吧」——取代 v2.3.23 的白描边。 */
export const COVER_PAD_ALPHA = 0.78;
/** 注音字体：封面书名每个字头上给拼音留的高度（字的倍数）。 */
export const COVER_RUBY = 0.42;
export interface PdfBookSpec {
  title: string; date: string | null; cover: PdfImage | null;
  /** 封面页（v2.3.23 起一页：封面图铺满或一张纸，书名印在上面——和书架上那张封面同一套排法）。整本 / 整篇才有；false = 第一页就是正文（这一页 / 这一支）。缺省 true。 */
  front?: boolean;
  /** 封面配色；不给 = 书架封面的浅色那套。 */
  coverLook?: CoverLook;
  /** 书（没有封面图时画装订线）还是 txt 稿（一张纸，没有装订线）。缺省 book。 */
  coverKind?: "book" | "draft";
  /** 书名是没起名的消歧码 → 用淡色印（和书架一样）。 */
  titleSoft?: boolean;
  /** 封面上印的名字；不给 = title（「这一支」带封面时封面上只印页名）。 */
  coverTitle?: string;
  /** 落款（导出时间之类的一小段字）：印在最后一页的左下角。不给 = 不印。 */
  stamp?: string;
  sections: PdfSection[]; look: PdfBookLook; typeset: ExportTypeset; font: TtfFont;
}
export interface PdfBookPlan { doc: PdfDoc; cjk: number; en: number; textPages: number; imagePages: number; pageCount: number; pageW: number; pageH: number }

/** 折行时带给注音字体的前后文长度（字）。萌神的词表最长四五个字。 */
export const CONTEXT_CHARS = 6;
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

/** CSS 颜色串（`#rgb` / `#rrggbb` / `rgb()` / `rgba()` / `color(srgb r g b)`）→ 0..1 的 RGB；认不出 → 黑。 */
export function parseCssColor(s: string): Rgb {
  const t = s.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(t);
  if (m) return [...m[1]!].map((c) => parseInt(c + c, 16) / 255) as Rgb;
  m = /^#([0-9a-f]{6})/i.exec(t);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1]!.slice(i, i + 2), 16) / 255) as Rgb;
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(t);
  if (m) return [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255];
  m = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i.exec(t);   // 浏览器把 color-mix() 算出来的颜色报成这种写法（0..1）
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
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
    // 注音字体的「国」连头上的拼音一起是一个字形：墨迹上沿高过 0.95 字 → 按汉字本体 0.8 字算（和 codec.createTextMeasurer().ink 同一条规矩）
    ink: (style: TextStyle) => (guo ? { asc: (guo[3] * k > 0.95 ? 0.8 : guo[3] * k) * style.sizePx, desc: Math.max(0, -guo[1] * k * style.sizePx) } : { asc: 0.8 * style.sizePx, desc: 0.07 * style.sizePx }),
  };
}

/** 不排版、不要字体，估一下这份东西出 PDF 大约多少页（导出面板在生成之前报给用户：user 2026-10-01「导出 PDF 前先报「约 N 页」 做」）。
 *  算法 = 和 planPdfBook 同一套行数规矩，只是字宽靠估：汉字 / 全角 1 格，其余半格；每段 ⌈格数 ÷ 每行字数⌉ 行；章节名每行占 2 行 + 空 1 行；
 *  子节目录正文后空 1 行、一节一行；每节另起一页，⌈行数 ÷ 每页行数⌉ 页；图片页一页；整本 / 整篇加 1 页封面。
 *  纯汉字的稿子和真排出来一样；夹英文、避头尾会差一点，所以界面上写「约」。 */
export function estimatePdfPages(sections: { kind: "text" | "image"; heading?: string | null; text?: string; toc?: { label: string }[] }[], typeset: ExportTypeset, front: boolean): number {
  const per = pdfPageGeometry(typeset).linesPerPage, chars = typeset.charsPerLine;
  const cells = (t: string): number => { let n = 0; for (const ch of t) n += (ch.codePointAt(0)! >= 0x2e80 ? 1 : 0.5); return n; };
  const linesOf = (t: string, width: number): number => Math.max(1, Math.ceil(cells(t) / Math.max(1, width) - 1e-9));
  let pages = front ? 1 : 0;
  for (const sec of sections) {
    if (sec.kind === "image") { pages++; continue; }
    const text = sec.text ?? "", toc = sec.toc ?? [];
    let lines = sec.heading != null ? 2 * linesOf(sec.heading, chars / 1.25) + 1 : 0;
    const tocOnly = text.trim() === "" && toc.length > 0;
    if (!tocOnly) for (const para of text.replace(/\r\n?/g, "\n").replace(/\s+$/, "").split("\n")) lines += linesOf(para, chars);
    if (toc.length) { if (!tocOnly) lines++; for (const e of toc) lines += linesOf(e.label, chars - 3); }
    pages += Math.max(1, Math.ceil(lines / per));
  }
  return pages;
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

  const cLink = parseCssColor(look.link ?? look.ink);
  const pages: PdfPage[] = []; const outline: PdfOutlineItem[] = []; const numbered: number[] = [];   // numbered = 印页码的页
  const sectionPage: number[] = [];   // 每一节的第一页（页序）
  const tocPending: { page: PdfPage; y: number; target: number }[] = [];   // 目录行的页码和链接：目标页要等全部排完才知道，先记着
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

  // ── 封面（一页）：封面图铺满整页，或一张纸（书 = 左边一条装订线）；书名和日期印在上面，排法 = 书架上那张封面（cover-title.ts）──
  //    user 2026-10-01「然后封面要不要和书架的封面对齐？就是也有字」「好，两个做」。v2.3.14–22 是「封面图一页 + 书名页一页」。
  if (spec.front !== false) {
    const cl = spec.coverLook ?? DEFAULT_COVER_LOOK, hasImg = !!spec.cover;
    newPage(false);
    if (spec.cover) fill(spec.cover, 0, 0, W, H);   // 铺满整页（靠页面边界裁）；图片页仍是完整放进版心
    else ops.push({ op: "rect", x: 0, y: 0, w: W, h: H, color: parseCssColor(cl.paper) });
    const lay = layoutCoverTitle({ title: spec.coverTitle ?? spec.title, date: spec.date, W, H, spine: !hasImg && spec.coverKind !== "draft", width: (t, s) => m.width(t, st(s)), ink: (s) => m.ink(st(s)), wrap: (t, maxW, s) => wrapText(t, maxW, st(s), m), ruby: font.contextual ? COVER_RUBY : 0 });
    if (lay.spineW) { ops.push({ op: "rect", x: 0, y: 0, w: lay.spineW, h: H, color: parseCssColor(cl.spine) }); ops.push({ op: "line", x1: lay.spineW, y1: 0, x2: lay.spineW, y2: H, color: parseCssColor(cl.spineEdge), width: W * 0.004 }); }
    const cTitle = parseCssColor(spec.titleSoft ? cl.inkSoft : cl.ink);
    const cellOp = (c: typeof lay.cells[number], color: Rgb): PdfOp => ({ op: "text", x: c.x, y: c.y, text: c.text, size: c.size, color, ...(c.rotate ? { rotate: c.rotate } : {}), ...(c.before ? { before: c.before } : {}), ...(c.after ? { after: c.after } : {}) });
    const cDate = parseCssColor(hasImg ? cl.ink : cl.inkSoft);
    // 有图：字底下先垫半透明的纸（一列一块 / 一段一块 / 日期一块），字才看得清；没图的封面本来就是纸，不垫
    if (hasImg) for (const r of lay.pads) ops.push({ op: "rect", x: r.x, y: r.y, w: r.w, h: r.h, color: parseCssColor(cl.paper), alpha: COVER_PAD_ALPHA });
    for (const c of lay.cells) ops.push(cellOp(c, cTitle));
    if (lay.date) ops.push(cellOp(lay.date, cDate));
  }

  // ── 各页 ──
  let cjk = 0, en = 0, textPages = 0, imagePages = 0;
  for (let si = 0; si < spec.sections.length; si++) {
    const sec = spec.sections[si]!;
    if (sec.kind === "image") { imagePages++; newPage(); sectionPage[si] = pages.length - 1; contain(sec.image, SIDE, TOP, inner, bodyBottom - TOP); continue; }
    textPages++; const s = statsForText(sec.text); cjk += s.cjk; en += s.en;
    newPage(); sectionPage[si] = pages.length - 1;   // 章起新页
    y = lineTop;
    if (sec.heading != null) {
      outline.push({ title: sec.heading, page: pages.length - 1, ...(sec.level ? { level: sec.level } : {}) });
      // 章节名占整数行（正文行格不乱）：每行章节名 = 2 个正文行，底下再空 1 行
      const size = 1.25 * F; const hl = wrapText(sec.heading, inner, st(size), m);
      for (const line of hl) { centered(line, size, y + LH * 1.5, cInk); y += 2 * LH; }
      y += LH;
    }
    const tocOnly = sec.text.trim() === "" && !!sec.toc?.length;   // 一页纯目录：不为空正文留那一行，目录紧跟章节名
    for (const para of tocOnly ? [] : sec.text.replace(/\r\n?/g, "\n").replace(/\s+$/, "").split("\n")) {
      const lines = wrapText(para, inner, st(F), m);
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li]!;
        // 注音字体：一个词被折行拆开时，给它前后文（上一行的尾、下一行的头），多音字才选得对
        const ctx = font.contextual ? { ...(li > 0 ? { before: lines[li - 1]!.slice(-CONTEXT_CHARS) } : {}), ...(li + 1 < lines.length ? { after: lines[li + 1]!.slice(0, CONTEXT_CHARS) } : {}) } : {};
        if (!fits()) { newPage(); y = lineTop; }
        if (cRule) ops.push({ op: "line", x1: SIDE, y1: y + ruleY, x2: W - SIDE, y2: y + ruleY, color: cRule, width: 0.03 * F });
        if (line !== "") ops.push({ op: "text", x: SIDE, y: y + bodyBase, text: line, size: F, color: cBody, ...ctx });
        y += LH;
      }
    }
    // ── 子节目录（user 2026-10-01「导出的时候要不要也加子叶的页面内链接…不然的话目录是空的就很奇怪」「好，两个做」）：和编辑器里一样——正文后面空一行，一节一行；
    //    正文是空的（一页纯目录）就不空那一行。标签折行时页码和链接跟第一行；右边留三个字给页码。
    const toc = (sec.toc ?? []).filter((e) => e.target >= 0 && e.target < spec.sections.length && e.target !== si);
    if (toc.length) {
      const ruled = (): void => { if (cRule) ops.push({ op: "line", x1: SIDE, y1: y + ruleY, x2: W - SIDE, y2: y + ruleY, color: cRule, width: 0.03 * F }); };
      if (sec.text.trim() !== "") { if (!fits()) { newPage(); y = lineTop; } ruled(); y += LH; }
      for (const e of toc) {
        const lines = wrapText(e.label, inner - 3 * F, st(F), m);
        lines.forEach((line, li) => {
          if (!fits()) { newPage(); y = lineTop; }
          ruled();
          if (line !== "") ops.push({ op: "text", x: SIDE, y: y + bodyBase, text: line, size: F, color: cLink });
          if (li === 0) tocPending.push({ page: pages[pages.length - 1]!, y, target: e.target });
          y += LH;
        });
      }
    }
  }
  // 目录行的页码 + 链接（现在每一节在哪一页都知道了）
  for (const t of tocPending) {
    const pi = sectionPage[t.target]; if (pi == null) continue;
    const n = numbered.indexOf(pi), label = n >= 0 ? String(n + 1) : "";
    if (label) t.page.ops.push({ op: "text", x: W - SIDE - m.width(label, st(F)), y: t.y + bodyBase, text: label, size: F, color: cMuted });
    (t.page.links ??= []).push({ x: SIDE, y: t.y, w: inner, h: LH, page: pi });
  }
  // ── 页码（正文 / 图片页；封面与书名页不印）──
  numbered.forEach((pi, i) => { const p = pages[pi]!; const label = String(i + 1), size = 0.75 * F; p.ops.push({ op: "text", x: (W - m.width(label, st(size))) / 2, y: H - 1.0 * F, text: label, size, color: cMuted }); });

  // 落款：最后一页左下角一行小字（页码在正中，小字占不到那里：14 字档最窄，0.55 字号的二十来个字符 ≈ 55 pt，离中线还有余）
  if (spec.stamp && pages.length) pages[pages.length - 1]!.ops.push({ op: "text", x: SIDE, y: H - 1.0 * F, text: spec.stamp, size: 0.55 * F, color: cMuted });
  return { doc: { title: spec.title, pages, outline }, cjk, en, textPages, imagePages, pageCount: pages.length, pageW: W, pageH: H };
}
