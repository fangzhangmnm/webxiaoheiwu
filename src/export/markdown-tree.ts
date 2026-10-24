// 书 → markdown 树（TXT 导出；纯函数，不碰 DOM）。created 2026-10-23 by Claude Opus 5.5
//   user 2026-10-23「章节名是markdown那种啊，分级」→ 页名按目录层级写成 # / ## / ### 标题，正文跟在后面（wishlist M-02）。
//   正文里自己写的 # 标题（user 同日「默认自动加级，每页只独立分别加到够用」「比如一开始是三级的话如果页是1，2级，那么还是三。不然递增」）：
//     每页单独算——正文里最高的一级 m（# 最少的那行）已经比页名 P 低 → 一个都不动；否则整页一起往下挪 P + 1 − m 级（正文内部的相对层次不变），超过 6 级按 6 级写。
//   导出面板可以另选（user 同日「加一行段选」，记在书里 editor-state exportBodyHeadings）：escape = 正文标题前加 \ 变成普通一行字（页名是唯一的标题）；raw = 正文原样。
//   只认 ATX 标题（行首至多 3 个半角空格 + 1–6 个 # + 空白或行尾，同 CommonMark）；``` / ~~~ 围栏里的行不算、不动。下划线式（setext）标题不认。

/** 正文里自己的 # 标题：shift = 加级（缺省）/ escape = 转义 / raw = 原样。 */
export type BodyHeadings = "shift" | "escape" | "raw";
export interface MarkdownPage { /** 页名；null = 没有页名（txt 稿），只出正文、原样 */ heading: string | null; /** 在目录树里的层级，相对这次导出的起点（0 = 最外层 = #） */ level?: number; text: string }

const MAX_LEVEL = 6;   // markdown 只认到 ######
const ATX = /^( {0,3})(#{1,6})(?=[ \t]|$)/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** 每一行：是 ATX 标题就给级数，不是（含围栏里的）给 null。 */
function headingLevels(lines: string[]): (number | null)[] {
  let fence: string | null = null;
  return lines.map((line) => {
    const f = FENCE.exec(line);
    if (fence) {   // 关围栏 = 同一种字符、至少一样长、后面只有空白
      if (f && f[1]![0] === fence[0] && f[1]!.length >= fence.length && !line.slice(f[0].length).trim()) fence = null;
      return null;
    }
    if (f) { fence = f[1]!; return null; }
    const m = ATX.exec(line);
    return m ? m[2]!.length : null;
  });
}

/** 正文里的标题放到 pageLevel 级的页名底下：最高的一级已经比页名低就原样返回，否则整页一起往下挪到「最高的一级 = pageLevel + 1」。 */
export function shiftBodyHeadings(body: string, pageLevel: number): string {
  const lines = body.split("\n"), levels = headingLevels(lines);
  const top = Math.min(...levels.filter((h): h is number => h != null));
  if (!Number.isFinite(top) || top > pageLevel) return body;
  const by = pageLevel + 1 - top;
  return lines.map((line, i) => {
    const h = levels[i];
    return h == null ? line : line.replace(ATX, (_all, indent: string) => indent + "#".repeat(Math.min(MAX_LEVEL, h + by)));
  }).join("\n");
}

/** 正文里的标题前面加 \（CommonMark 转义）：行首缩进留着，变成普通一行字。 */
export function escapeBodyHeadings(body: string): string {
  const lines = body.split("\n"), levels = headingLevels(lines);
  return lines.map((line, i) => (levels[i] == null ? line : line.replace(ATX, (_all, indent: string, hashes: string) => indent + "\\" + hashes))).join("\n");
}

/** 整棵树：每页 =「#」×（层级 + 1）+ 页名、空一行、正文（标题挪过的）；页与页之间空一行。正文头上的空行去掉（首行缩进留着）、尾巴空白收掉。 */
export function markdownTree(pages: MarkdownPage[], bodyHeadings: BodyHeadings = "shift"): string {
  return pages.map((p) => {
    const body = p.text.replace(/^(?:[ \t]*\r?\n)+/, "").replace(/\s+$/, "");
    if (p.heading == null) return body;
    const lv = Math.min(MAX_LEVEL, (p.level ?? 0) + 1);
    const h = "#".repeat(lv) + " " + p.heading;
    const b = bodyHeadings === "shift" ? shiftBodyHeadings(body, lv) : bodyHeadings === "escape" ? escapeBodyHeadings(body) : body;
    return body ? h + "\n\n" + b : h;
  }).join("\n\n") + "\n";
}
