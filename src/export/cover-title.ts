// 导出封面上的书名怎么排（纯函数：不碰 DOM、不碰 canvas）。created 2026-10-01 by Claude Fable 5.1
//   user 2026-10-01「然后封面要不要和书架的封面对齐？就是也有字」→「好，两个做」。
//   规则和书架上那张封面同一份（ui/book-cover.ts coverTypo）：汉字为主 → 竖排，从右上角起、一列排满往左换列；拉丁为主 → 横排、按词折行、左上角起；
//   字号四档按封面宽度的百分比；日期小字在左下角；书（没有封面图时）左边一条装订线。
//   竖排的细节（CSS 的 writing-mode 在 PDF 和 canvas 里都没有，这里自己摆格子）：
//     · 汉字 / 假名：一字一格，立着，格内居中。
//     · 一两个字符的拉丁 / 数字小串：立着并排放进一格（纵中横），放不下就缩小。
//     · 更长的拉丁串：侧躺（顺时针转 90°），占它自己那么长。
//     · 括号 / 引号 / 破折号 / 省略号：转 90°；逗号 / 句号 / 顿号 / 分号 / 冒号：立着，挪到格子右上，占半格。
//     · 放不下（列排到左边界外）→ 字号缩一档再排，最多缩到很小；还放不下就截断。
//   输出 = 一串「在哪、多大、转不转」的字，调用方（pdf-book / long-image）各自变成自己的绘制指令。坐标：左上角为原点，y = 基线。
import { coverTypo } from "../ui/book-cover.ts";

export interface CoverCell { text: string; x: number; y: number; size: number; /** 顺时针转 90°（以 x, y 为轴） */ rotate?: 90; /** 这段字在书名里的前文 / 后文（注音字体按词选读音用） */ before?: string; after?: string }
export interface CoverTitleLayout { vertical: boolean; size: number; cells: CoverCell[]; date: CoverCell | null; /** 装订线的宽（0 = 没有） */ spineW: number; truncated: boolean }
export interface CoverTitleOpts {
  title: string; date: string | null; W: number; H: number;
  /** 画不画装订线（书、且底下不是封面图）。 */
  spine: boolean;
  width: (text: string, size: number) => number;
  /** 汉字墨迹的上下伸（按 size）。 */
  ink: (size: number) => { asc: number; desc: number };
  /** 横排折行（调用方给：long-image.wrapText）。 */
  wrap: (text: string, maxW: number, size: number) => string[];
  /** 注音字体：每个字头上的拼音带有多高（字的倍数）。缺省 0。 */
  ruby?: number;
}

const V_PCT = { xl: 0.17, l: 0.14, m: 0.12, s: 0.10 } as const, H_PCT = { xl: 0.16, l: 0.13, m: 0.11, s: 0.095 } as const;
const ORDER = ["xl", "l", "m", "s"] as const;
const cps = (...v: number[]): Set<string> => new Set(v.map((c) => String.fromCodePoint(c)));
/** 竖排时转 90° 的标点：括号、书名号、引号、破折号、连接号、省略号、波浪号。 */
const ROTATE = cps(0xff08, 0xff09, 0x28, 0x29, 0x300a, 0x300b, 0x3008, 0x3009, 0x300c, 0x300d, 0x300e, 0x300f, 0x3010, 0x3011, 0x3014, 0x3015, 0xff3b, 0xff3d, 0x5b, 0x5d, 0x2014, 0x2013, 0x2015, 0x2d, 0xff0d, 0x7e, 0xff5e, 0x2026, 0x2025);
/** 竖排时立着、挪到格子右上的标点：逗号、句号、顿号、分号、冒号。 */
const UPPER_RIGHT = cps(0xff0c, 0x3002, 0x3001, 0xff1b, 0xff1a, 0x2c, 0x2e, 0x3b, 0x3a);
/** 不能在列首的（收尾的括号 / 引号）和不能在列尾的（起头的括号 / 引号）——换列时的避头尾。 */
const CLOSERS = cps(0xff09, 0x29, 0x300b, 0x3009, 0x300d, 0x300f, 0x3011, 0x3015, 0xff3d, 0x5d), OPENERS = cps(0xff08, 0x28, 0x300a, 0x3008, 0x300c, 0x300e, 0x3010, 0x3014, 0xff3b, 0x5b);
const CONTEXT = 6;

type Tok = { kind: "cell" | "tcy" | "side" | "space" | "rot" | "ur"; text: string; at: number };
function tokenize(title: string): Tok[] {
  const out: Tok[] = []; const chars = [...title]; let i = 0;
  while (i < chars.length) {
    const ch = chars[i]!;
    if (/\s/.test(ch)) { out.push({ kind: "space", text: ch, at: i }); i++; continue; }
    if (/[A-Za-z0-9]/.test(ch)) { let j = i; while (j < chars.length && /[A-Za-z0-9.'&]/.test(chars[j]!)) j++; const run = chars.slice(i, j).join(""); out.push({ kind: run.length <= 2 ? "tcy" : "side", text: run, at: i }); i = j; continue; }
    out.push({ kind: ROTATE.has(ch) ? "rot" : UPPER_RIGHT.has(ch) ? "ur" : "cell", text: ch, at: i }); i++;
  }
  return out;
}

export function layoutCoverTitle(o: CoverTitleOpts): CoverTitleLayout {
  const { W, H } = o; const typo = coverTypo(o.title); const ruby = o.ruby ?? 0;
  const spineW = o.spine ? Math.round(W * 0.047 * 10) / 10 : 0;
  const padX = W * 0.07, top = W * 0.09, bottom = W * 0.15, left = spineW + padX, right = W - padX;
  const chars = [...o.title];
  const ctx = (at: number, len: number): { before?: string; after?: string } => {
    const b = chars.slice(Math.max(0, at - CONTEXT), at).join(""), a = chars.slice(at + len, at + len + CONTEXT).join("");
    return { ...(b ? { before: b } : {}), ...(a ? { after: a } : {}) };
  };
  const dateSize = W * 0.05;
  const date: CoverCell | null = o.date ? { text: o.date, x: left, y: H - W * 0.055, size: dateSize } : null;
  const tier0 = ORDER.indexOf(typo.size);
  const sizes: number[] = []; const pct = typo.vertical ? V_PCT : H_PCT;
  for (let t = tier0; t < ORDER.length; t++) sizes.push(pct[ORDER[t]!] * W);
  for (let k = 0, s = sizes[sizes.length - 1]!; k < 4; k++) { s *= 0.85; sizes.push(s); }

  if (!typo.vertical) {
    for (let si = 0; si < sizes.length; si++) {
      const S = sizes[si]!, lh = S * (1.18 + ruby); const lines = o.wrap(o.title, right - left, S);
      const fits = top + lines.length * lh <= H - bottom; const last = si === sizes.length - 1;
      if (!fits && !last) continue;
      const max = Math.max(1, Math.floor((H - bottom - top) / lh)); const use = lines.slice(0, max);
      const { asc, desc } = o.ink(S);
      const cells: CoverCell[] = use.map((line, i) => ({ text: line, x: left, y: top + i * lh + ruby * S + (S - (asc + desc)) / 2 + asc, size: S, ...(i > 0 ? { before: lines[i - 1]!.slice(-CONTEXT) } : {}), ...(i + 1 < lines.length ? { after: lines[i + 1]!.slice(0, CONTEXT) } : {}) }));
      return { vertical: false, size: S, cells, date, spineW, truncated: use.length < lines.length };
    }
  }

  const toks = tokenize(o.title); const tierCount = ORDER.length - tier0; let fallback: CoverTitleLayout | null = null;
  for (let si = 0; si < sizes.length; si++) {
    const S = sizes[si]!, pitch = S * (1.08 + ruby), colPitch = S * 1.25, yMax = H - bottom; const last = si === sizes.length - 1;
    const { asc, desc } = o.ink(S); const cells: CoverCell[] = [];
    let cx = right - S / 2, y = top, overflow = false, truncated = false;
    const needOf = (tk: Tok): number => (tk.kind === "space" ? S * 0.5 : tk.kind === "side" ? Math.min(o.width(tk.text, S), yMax - top) + S * 0.15 : tk.kind === "ur" ? S * 0.55 : pitch);
    for (let ti = 0; ti < toks.length; ti++) {
      const tk = toks[ti]!; const need = needOf(tk);
      // 换列的避头尾：逗号句号、收尾的括号不到下一列的列首（挂在这一列的列尾，地脚有余量）；起头的括号不留在列尾（连同后面那个字一起换列）
      const hang = tk.kind === "ur" || CLOSERS.has(tk.text);
      const lookahead = OPENERS.has(tk.text) && ti + 1 < toks.length ? needOf(toks[ti + 1]!) : 0;
      if (!hang && y + need + lookahead > yMax + 0.01 && y > top + 0.01) { cx -= colPitch; y = top; if (cx - S / 2 < left - 0.01) { overflow = true; break; } }
      if (tk.kind === "space") { if (y > top + 0.01) y += need; continue; }   // 列首的空白不占位
      const c = ctx(tk.at, [...tk.text].length);
      if (tk.kind === "cell") cells.push({ text: tk.text, x: cx - o.width(tk.text, S) / 2, y: y + ruby * S + (S - (asc + desc)) / 2 + asc, size: S, ...c });
      else if (tk.kind === "tcy") { const w = o.width(tk.text, S), sz = w > S ? S * S / w : S; cells.push({ text: tk.text, x: cx - o.width(tk.text, sz) / 2, y: y + ruby * S + S / 2 + sz * 0.36, size: sz }); }
      else if (tk.kind === "side") cells.push({ text: tk.text, x: cx - S * 0.36, y, size: S, rotate: 90 });
      else if (tk.kind === "rot") cells.push({ text: tk.text, x: cx - S * 0.38, y: y + (pitch - S) / 2, size: S, rotate: 90 });
      else cells.push({ text: tk.text, x: cx - S / 2 + S * 0.55, y: y + S * 0.38, size: S });
      y += need;
    }
    if (overflow && !last) continue;
    if (overflow) truncated = true;
    // 孤字：最后一列只剩一个字（「气球冒险 / 家」）不好看——还有更小的字号就再试一档；试到底都这样才认
    const lastX = cells.length ? cells[cells.length - 1]!.x : 0, firstX = cells.length ? cells[0]!.x : 0;
    const orphan = cells.length >= 3 && Math.abs(lastX - firstX) > S * 0.5 && cells.filter((c) => Math.abs(c.x - lastX) < S * 0.5).length === 1;
    const result: CoverTitleLayout = { vertical: true, size: S, cells, date, spineW, truncated };
    if (orphan && !last && si < tierCount + 1) { fallback ??= result; continue; }
    return orphan && fallback ? fallback : result;
  }
  if (fallback) return fallback;
  return { vertical: typo.vertical, size: sizes[0]!, cells: [], date, spineW, truncated: true };
}
