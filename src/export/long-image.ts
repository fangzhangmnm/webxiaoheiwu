// 长图导出的排版（纯函数：不碰 DOM、不碰 canvas）。created 2026-09-30 by Claude Fable 5.1
//   user 2026-09-30「先做图片导出吧，这个今晚就能用」「我觉得很多时候贴长图反而朋友更可能看？包括封面和插画整合啥的」「wysiwyg，就用编辑器的行宽，我们这边导出也一样」。
//   三个量各管一件事（user 2026-09-30「行宽应该是字数而不是px，这样只有行宽影响排版，字大小影响缩放？这样两个都可以调」）：
//     · charsPerLine 每行几个字 = 排版（折行只看它；高考作文格 20、纸书约 28、大字 14）；
//     · pxPerChar 像素/字 = 缩放（图宽 = 字数 × 像素/字 + 边距；只影响清晰度 / 文件大小，不改读者看到的字大小——图贴屏宽）。
//       不是用户选项（user「导出只有行宽一个选项」「清晰度不用用户knob。knob不要太多」「能不能更抠，或者对小行宽更抠」）：定死 PX_PER_CHAR = 30 → 14 字 504 宽、20 字 684、28 字 924——
//       小行宽自动更抠（字在屏上大，糊一点也清楚；28 字每个字在屏上小，反而要更多像素才不糊）；
//     · 行距跟档走（user 2026-09-30「行间距可以和三档一起变」）：14 → 1.9、20 → 1.75、28 → 1.6；编辑器的短行 / 标准不进图。
//   编辑器只贡献「样子」：字体 / 纸色墨色 / 写字线；不再抄它的字号档和框宽（那是每台设备的无障碍设置，抄进图 = 从 iPad 和 Win Mini 导出来的图不一样）。
//   一张图 = 封面（graph.json cover 有来源页就铺高清图，没有就只印书名 + 日期）+ 各页（章节名 + 正文 + 插图页原位）；
//   尽量一张（user 2026-09-30「长图能尽量不切图吗，三屏太难受了」）：只有超过单张上限（SINGLE_IMAGE_MAX_HEIGHT）才切，切法由调用方问过 user 再定；切只在行与行之间、章节名不落单、一张图片不拆。
//   边距 / 页脚 / 标题字号全按「字」为单位（1.4 字边距……），随像素/字等比。
//   输出是显示列表（SceneOp），量字宽与落像素归 image/codec.ts（app 唯一 canvas 点）。
import type { SceneOp, TextMeasurer, TextStyle } from "../image/codec.ts";
import { statsForText } from "../doc-model.ts";
import { layoutCoverTitle } from "./cover-title.ts";

export interface ImageRef { blob: Blob; w: number; h: number }
export type LongImageSection =
  | { kind: "text"; heading: string | null; text: string; /** 子节目录：正文后面空一行列出来（和编辑器里一样；图片里点不了，只是文字）。 */ toc?: { label: string }[] }
  | { kind: "image"; heading: string | null; image: ImageRef };
/** 编辑器贡献的「样子」（app 层从 computed style 量来）：字体栈、纸色 / 墨色、写字线颜色（null = 没开）。 */
export interface LongImageLook { family: string; paper: string; ink: string; inkSoft: string; muted: string; rule: string | null; /** 子节目录那种链接色；不给 = 墨色 */ link?: string }
/** 排版引擎的输入：每行几个字 + 像素/字 + 行距倍数。charsPerLine = 设置 → 行宽（user「导出跟编辑器的行宽走啊」），其余由档推出。 */
export interface ExportTypeset { charsPerLine: number; pxPerChar: number; lineHeightRatio: number; /** 注音带（em）：加在行距上面的那一截——汉字照旧坐在线上、离行底不变，拼音往上长（2026-09-30 萌神对齐）。缺省 0。 */ rubyBand?: number }
/** 像素/字定死（不是用户选项）：30 → 20 字/行 684 宽。 */
export const PX_PER_CHAR = 30;
/** 折行时带给注音字体的前后文长度（字）。 */
const CONTEXT_CHARS = 6;
/** 每行字数的离散选项（user「行宽还是三档吧。我这种有阅读写作障碍的用比手机还极端的第三档」「诗歌啊小故事啊，或者需要刻意自律篇幅的时候」「随便写一点看着就蛮多=点燃引擎」）：
 *  14 极端短行（诗 / 小故事 / 自律篇幅；user 数过「应该是 14」；800 字 ≈ 4 屏半）· 20 高考作文格 / 网文 app 默认区间（800 字 ≈ 2 屏）· 28 纸书 32 开（800 字 ≈ 1 屏）。 */
export const CHARS_PRESETS: readonly number[] = [14, 20, 28];
/** 每档的行距倍数（短行要松才好看；纸书密）。 */
const LINE_HEIGHT_BY_CHARS: Readonly<Record<number, number>> = { 14: 1.9, 20: 1.75, 28: 1.6 };
export const typesetFor = (charsPerLine: number): ExportTypeset => ({ charsPerLine, pxPerChar: PX_PER_CHAR, lineHeightRatio: LINE_HEIGHT_BY_CHARS[charsPerLine] ?? 1.75 });
/** 图宽 = 字数 × 像素/字 + 两边各 1.4 字。 */
export const widthFor = (ts: ExportTypeset): number => Math.round(ts.charsPerLine * ts.pxPerChar) + 2 * Math.round(1.4 * ts.pxPerChar);
export interface LongImageSpec {
  title: string; date: string | null;
  cover: ImageRef | null;
  /** 封面 + 书名 + 日期那一段。整本 / 整篇才有；false = 从第一页的章节名直接开始（这一页 / 这一支；user 2026-10-01「这一支的话是不是就应该没有书名和封面了」）。缺省 true。 */
  front?: boolean;
  /** 封面图上那层字的颜色（书架封面那一套）：墨色 + 一圈描边。不给 = 深褐字、白描边。 */
  coverLook?: { ink: string; halo: string };
  /** 正文字体是注音字体 → 封面书名每个字头上给拼音留位置。 */
  ruby?: boolean;
  /** 注音字体：把一行字换成「带读音标记」的同一行（多音字后面补变体选择符，见 ttf.ts annotate）。折行、量宽都用原文，只有画的时候用它的结果；
   *  before / after = 同一段里上一行的尾、下一行的头（词被折行拆开时靠它选对读音）。不给 = 原样画。 */
  annotate?: (before: string, line: string, after: string) => string;
  sections: LongImageSection[];
  look: LongImageLook;
  typeset: ExportTypeset;
  /** 页脚「第 i / n 张」的文案（只在切成多张时印）。 */
  sliceLabel: (i: number, n: number) => string;
}
/** hasImage：这张里有照片（封面 / 插图页）→ 调用方选 JPEG；纯文字 → 调色板 PNG（更小也更锐）。 */
export interface LongImageSlice { w: number; h: number; ops: SceneOp[]; hasImage: boolean }
/** totalHeight = 不切时一整张的高（决定要不要问 user 切法）；width = 图宽。 */
export interface LongImagePlan { slices: LongImageSlice[]; width: number; totalHeight: number; cjk: number; en: number; textPages: number; imagePages: number }
/** 单张上限（px 高）：手机图片管线的纹理上限 16384（Android 硬件位图 / iOS Metal），iOS Safari 画布面积 ≈ 16.7M px 在 750 宽下 ≈ 22k 不是瓶颈；留余量取 16000。超过 = 问 user 切法（user 2026-09-30「超上限了弹窗让用户决策吧」）。 */
export const SINGLE_IMAGE_MAX_HEIGHT = 16000;
/** 「一屏」= 宽 × 16/9（手机竖屏）。 */
export const screenHeightFor = (w: number): number => Math.round(w * 16 / 9);
/** 社交切片：约三屏一张（朋友圈 / 小红书 feed 那种），user 明确选了才用。 */
export const socialSliceHeightFor = (w: number): number => 3 * screenHeightFor(w);

type RowKind = "text" | "heading" | "image" | "space" | "cover";
/** 一行 = 一个不可拆的高度块；ops 在切片时才按最终 y 生成。 */
interface Row { kind: RowKind; h: number; ops: (y: number) => SceneOp[] }

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

export function planLongImage(spec: LongImageSpec, m: TextMeasurer, opts: { maxSliceHeight?: number } = {}): LongImagePlan {
  const look = spec.look, F = spec.typeset.pxPerChar;
  const inner = Math.round(spec.typeset.charsPerLine * F);   // 折行的尺子 = 字数 × 像素/字（汉字一字一格；拉丁字母约两个算一个）
  const SIDE = Math.round(1.4 * F), TOP = Math.round(1.4 * F), BOTTOM = Math.round(1.1 * F), FOOT = Math.round(1.3 * F);   // 边距 / 页脚以「字」为单位
  const W = inner + 2 * SIDE;
  const LHbase = Math.max(1, Math.round(F * spec.typeset.lineHeightRatio));
  const LH = LHbase + Math.round(F * (spec.typeset.rubyBand ?? 0));   // 注音带只往上加
  const body: TextStyle = { family: look.family, sizePx: F, color: look.inkSoft };
  const head: TextStyle = { family: look.family, sizePx: F * 1.25, weight: 600, color: look.ink };
  const titleStyle: TextStyle = { family: look.family, sizePx: F * 1.6, weight: 600, color: look.ink };
  const small: TextStyle = { family: look.family, sizePx: Math.max(12, F * 0.6), color: look.muted };
  const bodyM = m.ascent(body), headM = m.ascent(head), titleM = m.ascent(titleStyle), smallM = m.ascent(small);
  const baseline = (top: number, lh: number, met: { asc: number; desc: number }) => top + (lh - (met.asc + met.desc)) / 2 + met.asc;
  // 正文基线以**汉字墨迹**为准（user 2026-09-30「萌神的话字体高度要重新算」）：墨迹框在基准行高里上下居中、整体贴行底——换字体汉字位置不变，注音带在上面
  const ink = m.ink(body);
  const bodyBase = LH - Math.round((LHbase - (ink.asc + ink.desc)) / 2) - Math.round(ink.desc);
  const ruleW = Math.max(1, Math.round(F / 36)), ruleY = Math.round(bodyBase + 0.18 * F);   // 写字线 = 基线之下 0.18 字（paper.ts 同一条规矩）

  const rows: Row[] = [];
  const space = (h: number) => { if (h > 0) rows.push({ kind: "space", h: Math.round(h), ops: () => [] }); };
  /** 一组折好的行里第 i 行要画的字（注音字体 → 补读音标记）。 */
  const drawn = (lines: string[], i: number): string => (spec.annotate && lines[i] ? spec.annotate(i > 0 ? lines[i - 1]!.slice(-CONTEXT_CHARS) : "", lines[i]!, i + 1 < lines.length ? lines[i + 1]!.slice(0, CONTEXT_CHARS) : "") : lines[i]!);
  const textRow = (line: string, style: TextStyle, met: { asc: number; desc: number }, lh: number, align: "left" | "center", ruled: boolean, kind: RowKind = "text", baseOff?: number) =>
    rows.push({ kind, h: lh, ops: (y) => {
      const ops: SceneOp[] = [];
      if (ruled && look.rule) ops.push({ op: "line", x1: SIDE, y1: y + ruleY + 0.5, x2: W - SIDE, y2: y + ruleY + 0.5, color: look.rule, width: ruleW });
      if (line !== "") ops.push({ op: "text", x: align === "center" ? Math.round(W / 2) : SIDE, y: baseOff != null ? y + baseOff : Math.round(baseline(y, lh, met)), text: line, style, align });   // 基线落整像素：像素字不糊，普通字也更实
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
  if (spec.front !== false && spec.cover) {
    // 有封面图：书名和日期压在图上（和书架上那张封面同一套排法，cover-title.ts；user 2026-10-01「封面要不要和书架的封面对齐？就是也有字」「好，两个做」）
    const img = spec.cover; let h = Math.round(W * img.h / img.w); let crop: { sx: number; sy: number; sw: number; sh: number } | undefined;
    const cap = Math.round(W * 1.5); if (h > cap) { const sh = img.w * cap / W; crop = { sx: 0, sy: (img.h - sh) / 2, sw: img.w, sh }; h = cap; }
    const cl = spec.coverLook ?? { ink: "#43382c", halo: "#ffffff" }; const cs = (sizePx: number): TextStyle => ({ family: look.family, sizePx, color: cl.ink });
    const lay = layoutCoverTitle({ title: spec.title, date: spec.date, W, H: h, spine: false, width: (t, s) => m.width(t, cs(s)), ink: (s) => m.ink(cs(s)), wrap: (t, maxW, s) => wrapText(t, maxW, cs(s), m), ruby: spec.ruby ? 0.42 : 0 });
    const stroke = { color: cl.halo, width: Math.max(1.5, W * 0.006) };
    rows.push({ kind: "cover", h, ops: (y) => [
      { op: "image", x: 0, y, w: W, h, blob: img.blob, ...(crop ? { crop } : {}) },
      ...[...lay.cells, ...(lay.date ? [lay.date] : [])].map((c): SceneOp => ({ op: "text", x: c.x, y: y + c.y, text: spec.annotate ? spec.annotate(c.before ?? "", c.text, c.after ?? "") : c.text, style: cs(c.size), ...(c.rotate ? { rotate: c.rotate } : {}), stroke })),
    ] });
    space(40);
  } else if (spec.front !== false) {
    // 没有封面图：照旧一段书名 + 日期（长图是一条卷轴，不为它凭空造一张封面）
    space(72);
    { const tl = wrapText(spec.title, inner, titleStyle, m); tl.forEach((_, i) => textRow(drawn(tl, i), titleStyle, titleM, Math.round(titleStyle.sizePx * 1.4), "center", false, "cover")); }
    if (spec.date) { space(8); textRow(spec.date, small, smallM, Math.round(small.sizePx * 1.6), "center", false, "cover"); }
    space(56);
  } else space(24);

  // ── 各页 ──
  let cjk = 0, en = 0, textPages = 0, imagePages = 0, first = true;
  for (const sec of spec.sections) {
    if (sec.heading != null) {
      if (!first) space(LH * 0.5);
      { const hl = wrapText(sec.heading, inner, head, m); hl.forEach((_, i) => textRow(drawn(hl, i), head, headM, Math.round(head.sizePx * 1.4), "center", false, "heading")); }
      space(F * 0.5);
    }
    first = false;
    if (sec.kind === "text") {
      textPages++; const st = statsForText(sec.text); cjk += st.cjk; en += st.en;
      const tocOnly = sec.text.trim() === "" && !!sec.toc?.length;   // 一页纯目录：不为空正文留那一行
      for (const para of tocOnly ? [] : sec.text.replace(/\r\n?/g, "\n").replace(/\s+$/, "").split("\n")) {
        const lines = wrapText(para, inner, body, m);
        lines.forEach((_, li) => textRow(drawn(lines, li), body, bodyM, LH, "left", true, "text", bodyBase));
      }
      if (sec.toc?.length) {   // 子节目录：空一行（正文是空的就不空）+ 一节一行，坐在写字线上，链接色
        const linkStyle: TextStyle = { ...body, color: look.link ?? look.ink };
        if (sec.text.trim() !== "") textRow("", body, bodyM, LH, "left", true, "text", bodyBase);
        for (const e of sec.toc) { const tl = wrapText(e.label, inner, body, m); tl.forEach((_, li) => textRow(drawn(tl, li), linkStyle, bodyM, LH, "left", true, "text", bodyBase)); }
      }
    } else {
      imagePages++; space(LH * 0.5); imageRow(sec.image, "image", false); space(LH * 0.5);
    }
  }

  // ── 切片（默认不切）：只在行间切；章节名后面至少跟两行；一张图不拆；片头片尾的空行剪掉 ──
  const maxBody = (opts.maxSliceHeight ?? Infinity) - TOP - BOTTOM - FOOT;
  const groups: Row[][] = []; let cur: Row[] = [], curH = 0;
  const trim = (g: Row[]) => { let a = 0, b = g.length; while (a < b && g[a]!.kind === "space") a++; while (b > a && g[b - 1]!.kind === "space") b--; return g.slice(a, b); };
  const totalHeight = TOP + trim(rows).reduce((a, r) => a + r.h, 0) + BOTTOM + FOOT;   // 不切时那一张的高
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
    return { w: W, h, ops, hasImage: g.some((r) => r.kind === "image" || r.kind === "cover" && r.ops(0).some((o) => o.op === "image")) };
  });
  return { slices, width: W, totalHeight, cjk, en, textPages, imagePages };
}
