// 长图导出的排版（纯函数：不碰 DOM、不碰 canvas）。created 2026-09-30 by Claude Fable 5.1
//   user 2026-09-30「先做图片导出吧，这个今晚就能用」「我觉得很多时候贴长图反而朋友更可能看？包括封面和插画整合啥的」「wysiwyg，就用编辑器的行宽，我们这边导出也一样」。
//   所见即所得：字体 / 字号 / 行高 / 行宽全从编辑器**此刻**的样子量来（look），只按 1080 宽等比放大——你屏幕上怎么折行，图上就怎么折行；
//   写字线开着图上也有线。换字体（将来 vendor 自己的字体）只是换 look.family。
//   一张图 = 封面（graph.json cover 有来源页就铺高清图，没有就只印书名 + 日期）+ 各页（章节名 + 正文 + 插图页原位）；
//   太长按「约三屏一张」切开：只在行与行之间切、章节名不落单、一张图片不拆。
//   输出是显示列表（SceneOp），量字宽与落像素归 image/codec.ts（app 唯一 canvas 点）。
import type { SceneOp, TextMeasurer, TextStyle } from "../image/codec.ts";
import { statsForText } from "../doc-model.ts";

export interface ImageRef { blob: Blob; w: number; h: number }
export type LongImageSection =
  | { kind: "text"; heading: string | null; text: string }
  | { kind: "image"; heading: string | null; image: ImageRef };
/** 编辑器此刻的样子（app 层从 computed style 量来）。innerWidth = 正文框的 CSS 宽（折行的尺子）；lineHeight = paper.lineHeight()；ruleY = 写字线在一行里的位置（CSS px），rule = 线色或 null（没开写字线）。 */
export interface LongImageLook { family: string; fontPx: number; lineHeight: number; innerWidth: number; paper: string; ink: string; inkSoft: string; muted: string; rule: string | null; ruleY: number }
export interface LongImageSpec {
  title: string; date: string | null;
  cover: ImageRef | null;
  sections: LongImageSection[];
  look: LongImageLook;
  /** 图宽（默认 1080 = 手机长图的通行宽度）。 */
  width?: number;
  /** 「一屏」多高（默认 1920）与每张最多几屏（默认 3）：超过就在行间切开。 */
  screenHeight?: number; screensPerSlice?: number;
  /** 页脚「第 i / n 张」的文案（只在切成多张时印）。 */
  sliceLabel: (i: number, n: number) => string;
}
export interface LongImageSlice { w: number; h: number; ops: SceneOp[] }
export interface LongImagePlan { slices: LongImageSlice[]; cjk: number; en: number; textPages: number; imagePages: number }

type RowKind = "text" | "heading" | "image" | "space" | "cover";
/** 一行 = 一个不可拆的高度块；ops 在切片时才按最终 y 生成。 */
interface Row { kind: RowKind; h: number; ops: (y: number) => SceneOp[] }

const SIDE = 72, TOP = 48, BOTTOM = 40, FOOT = 44;
/** 行首不许出现（拉上一行末尾去，宁可略出界）；行尾不许出现（推到下一行去）。 */
// 避头尾字符表用码点拼（裸中文扫描认字面量；这些是标点不是文案）。
const cp = (...codes: number[]): Set<string> => new Set(codes.map((c) => String.fromCodePoint(c)));
/** 行首不许出现：、。，．：；！？」』）】〉》〕｝’”…‥ヽヾゝゞ々～ー , . : ; ! ? ) ] } % */
const NO_START = cp(0x3001, 0x3002, 0xFF0C, 0xFF0E, 0xFF1A, 0xFF1B, 0xFF01, 0xFF1F, 0x300D, 0x300F, 0xFF09, 0x3011, 0x3009, 0x300B, 0x3015, 0xFF5D, 0x2019, 0x201D, 0x2026, 0x2025, 0x30FD, 0x30FE, 0x309D, 0x309E, 0x3005, 0xFF5E, 0x30FC, 0x002C, 0x002E, 0x003A, 0x003B, 0x0021, 0x003F, 0x0029, 0x005D, 0x007D, 0x0025);
/** 行尾不许出现：「『（【〈《〔｛‘“ ( [ {{ */
const NO_END = cp(0x300C, 0x300E, 0xFF08, 0x3010, 0x3008, 0x300A, 0x3014, 0xFF5B, 0x2018, 0x201C, 0x0028, 0x005B, 0x007B);
const isSpace = (c: string): boolean => c === " " || c === "\t" || c === "　";
const isLatin = (c: string): boolean => /[A-Za-z0-9À-ɏ'’\-]/.test(c);

/** 按编辑器的规矩折一行：CJK 逐字可断、拉丁按词、超宽的词按字符断、断点处的空格丢掉、避头尾。 */
export function wrapText(text: string, maxW: number, style: TextStyle, m: TextMeasurer): string[] {
  if (text === "") return [""];
  // 词元：空白 / 拉丁词 / 其余单字
  const tokens: string[] = [];
  let i = 0; const chars = [...text];
  while (i < chars.length) {
    const c = chars[i]!;
    if (isSpace(c)) { tokens.push(c); i++; continue; }
    if (isLatin(c)) { let j = i + 1; while (j < chars.length && isLatin(chars[j]!)) j++; tokens.push(chars.slice(i, j).join("")); i = j; continue; }
    tokens.push(c); i++;
  }
  const lines: string[] = [];
  let cur = "", curW = 0, wrapped = false;   // wrapped：这一行是软折行开的头（textarea 语义：折行点的空格挂在上一行末尾，不带到下一行开头；段首的空格照留）
  const flush = () => { lines.push(cur); cur = ""; curW = 0; wrapped = true; };
  const push = (tok: string, w: number) => { cur += tok; curW += w; };
  for (let k = 0; k < tokens.length; k++) {
    const tok = tokens[k]!; const w = m.width(tok, style);
    if (cur === "" && wrapped && isSpace(tok)) continue;
    if (curW + w <= maxW || cur === "") {
      if (cur === "" && w > maxW && [...tok].length > 1) {   // 一个词比整行还宽：按字符断
        for (const ch of [...tok]) { const cw = m.width(ch, style); if (curW + cw > maxW && cur !== "") flush(); push(ch, cw); }
        continue;
      }
      push(tok, w); continue;
    }
    if (isSpace(tok)) { flush(); continue; }   // 断点处的空格不带到下一行
    if (NO_START.has(tok)) { push(tok, w); flush(); continue; }   // 避头：标点挂到本行末尾
    // 避尾：本行末尾是开引号 / 开括号 → 一起推到下一行
    const last = [...cur].pop();
    if (last !== undefined && NO_END.has(last) && [...cur].length > 1) { cur = [...cur].slice(0, -1).join(""); flush(); push(last, m.width(last, style)); push(tok, w); continue; }
    flush();
    if (w > maxW && [...tok].length > 1) { for (const ch of [...tok]) { const cw = m.width(ch, style); if (curW + cw > maxW && cur !== "") flush(); push(ch, cw); } }
    else push(tok, w);
  }
  lines.push(cur);
  return lines;
}

export function planLongImage(spec: LongImageSpec, m: TextMeasurer): LongImagePlan {
  const W = spec.width ?? 1080, inner = W - SIDE * 2;
  const s = inner / Math.max(1, spec.look.innerWidth);
  const F = spec.look.fontPx * s, LH = Math.max(1, Math.round(spec.look.lineHeight * s));
  const ruleW = Math.max(1, Math.round(s)), ruleY = Math.round(spec.look.ruleY * s);
  const look = spec.look;
  const body: TextStyle = { family: look.family, sizePx: F, color: look.inkSoft };
  const head: TextStyle = { family: look.family, sizePx: F * 1.25, weight: 600, color: look.ink };
  const titleStyle: TextStyle = { family: look.family, sizePx: F * 1.6, weight: 600, color: look.ink };
  const small: TextStyle = { family: look.family, sizePx: Math.max(18, F * 0.7), color: look.muted };
  const bodyM = m.ascent(body), headM = m.ascent(head), titleM = m.ascent(titleStyle), smallM = m.ascent(small);
  const baseline = (top: number, lh: number, met: { asc: number; desc: number }) => top + (lh - (met.asc + met.desc)) / 2 + met.asc;

  const rows: Row[] = [];
  const space = (h: number) => { if (h > 0) rows.push({ kind: "space", h: Math.round(h), ops: () => [] }); };
  const textRow = (line: string, style: TextStyle, met: { asc: number; desc: number }, lh: number, align: "left" | "center", ruled: boolean, kind: RowKind = "text") =>
    rows.push({ kind, h: lh, ops: (y) => {
      const ops: SceneOp[] = [];
      if (ruled && look.rule) ops.push({ op: "line", x1: SIDE, y1: y + ruleY + 0.5, x2: W - SIDE, y2: y + ruleY + 0.5, color: look.rule, width: ruleW });
      if (line !== "") ops.push({ op: "text", x: align === "center" ? W / 2 : SIDE, y: baseline(y, lh, met), text: line, style, align });
      return ops;
    } });
  const imageRow = (img: ImageRef, kind: RowKind, fullBleed: boolean) => {
    const w = fullBleed ? W : inner, x = fullBleed ? 0 : SIDE;
    let h = Math.round(w * img.h / img.w); let crop: { sx: number; sy: number; sw: number; sh: number } | undefined;
    const cap = fullBleed ? Math.round(W * 1.5) : Math.round(W * 2.4);
    if (h > cap) { const sh = img.w * cap / w; crop = { sx: 0, sy: (img.h - sh) / 2, sw: img.w, sh }; h = cap; }   // 太高的封面竖着裁中段；正文里的高图（漫画条）留到 2.4 倍宽
    rows.push({ kind, h, ops: (y) => [{ op: "image", x, y, w, h, blob: img.blob, ...(crop ? { crop } : {}) }] });
  };

  // ── 封面 / 书名 ──
  if (spec.cover) imageRow(spec.cover, "cover", true);
  space(spec.cover ? 40 : 72);
  for (const line of wrapText(spec.title, inner, titleStyle, m)) textRow(line, titleStyle, titleM, Math.round(titleStyle.sizePx * 1.4), "center", false, "cover");
  if (spec.date) { space(8); textRow(spec.date, small, smallM, Math.round(small.sizePx * 1.6), "center", false, "cover"); }
  space(spec.cover ? 40 : 56);

  // ── 各页 ──
  let cjk = 0, en = 0, textPages = 0, imagePages = 0, first = true;
  for (const sec of spec.sections) {
    if (sec.heading != null) {
      if (!first) space(LH * 0.5);
      for (const line of wrapText(sec.heading, inner, head, m)) textRow(line, head, headM, Math.round(head.sizePx * 1.4), "center", false, "heading");
      space(F * 0.5);
    }
    first = false;
    if (sec.kind === "text") {
      textPages++; const st = statsForText(sec.text); cjk += st.cjk; en += st.en;
      for (const para of sec.text.replace(/\r\n?/g, "\n").replace(/\s+$/, "").split("\n")) for (const line of wrapText(para, inner, body, m)) textRow(line, body, bodyM, LH, "left", true);
    } else {
      imagePages++; space(LH * 0.5); imageRow(sec.image, "image", false); space(LH * 0.5);
    }
  }

  // ── 切片：只在行间切；章节名后面至少跟两行；一张图不拆；片头片尾的空行剪掉 ──
  const maxBody = (spec.screensPerSlice ?? 3) * (spec.screenHeight ?? 1920) - TOP - BOTTOM - FOOT;
  const groups: Row[][] = []; let cur: Row[] = [], curH = 0;
  const trim = (g: Row[]) => { let a = 0, b = g.length; while (a < b && g[a]!.kind === "space") a++; while (b > a && g[b - 1]!.kind === "space") b--; return g.slice(a, b); };
  const flush = () => { const g = trim(cur); if (g.length) groups.push(g); cur = []; curH = 0; };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    let need = r.h;
    if (r.kind === "heading") { let j = i + 1, lines = 0; while (j < rows.length && lines < 2) { need += rows[j]!.h; if (rows[j]!.kind !== "space") lines++; j++; } }
    if (cur.length && curH + need > maxBody) flush();
    cur.push(r); curH += r.h;
  }
  flush();
  if (!groups.length) groups.push([]);
  const n = groups.length;
  const slices: LongImageSlice[] = groups.map((g, i) => {
    const h = TOP + g.reduce((a, r) => a + r.h, 0) + BOTTOM + FOOT;
    const ops: SceneOp[] = [];
    let y = TOP; for (const r of g) { ops.push(...r.ops(y)); y += r.h; }
    const foot = n > 1 ? `${spec.title} · ${spec.sliceLabel(i + 1, n)}` : spec.title;
    ops.push({ op: "text", x: W - SIDE, y: h - BOTTOM - FOOT + baseline(0, FOOT, smallM), text: foot, style: small, align: "right" });
    return { w: W, h, ops };
  });
  return { slices, cjk, en, textPages, imagePages };
}
