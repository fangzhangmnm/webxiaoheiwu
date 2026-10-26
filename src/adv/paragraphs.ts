// 对话框模式（ADV）的段落模型：纯函数，test/adv-paragraphs.test.mjs 钉着。created 20261025 by Claude Opus 5.5
//   user 2026-10-25「但是对话框的话的单位不是行，而是段」「一次写一段。写多长就可以。回车就发，自动变成\n\n」。
//   段 = 不含「连续两个以上换行」的最长一截；段与段之间那串换行（≥ 2 个）= 分隔，不属于任何一段。单个换行留在段里（段内换行，Shift+Enter）。
//   全文以分隔开头 / 结尾 = 头 / 尾各有一个空段（回车刚发出去、下一段还没写的那个状态）；空文 = 一个空段。
//   正文框里的字一个都不改写：分隔原样留着（三个换行就是三个），这里只负责「哪一截算一段」。

export interface Para { start: number; end: number }   // [start, end)，不含分隔

/** 全文的段，按顺序。 */
export function paragraphs(text: string): Para[] {
  const out: Para[] = [];
  const sep = /\n{2,}/g;
  let from = 0;
  for (let m = sep.exec(text); m; m = sep.exec(text)) { out.push({ start: from, end: m.index }); from = m.index + m[0].length; }
  out.push({ start: from, end: text.length });
  return out;
}

/** pos 落在第几段：段里（含两头）= 这一段；落在分隔中间 = 后一段（光标在两段之间的空行上，算正要写的那一段）。 */
export function paraIndexAt(paras: readonly Para[], pos: number): number {
  for (let i = 0; i < paras.length; i++) if (pos <= paras[i]!.end) return i;
  return paras.length - 1;
}

/** 一次改字 = 在 at 处删掉 del 个字、插进 ins（两版文字的公共前缀 / 后缀以外那一截）。没变 = null。 */
export interface Edit { at: number; del: number; ins: string }
export function diffEdit(before: string, after: string): Edit | null {
  if (before === after) return null;
  let p = 0;
  const max = Math.min(before.length, after.length);
  while (p < max && before.charCodeAt(p) === after.charCodeAt(p)) p++;
  let s = 0;
  while (s < before.length - p && s < after.length - p && before.charCodeAt(before.length - 1 - s) === after.charCodeAt(after.length - 1 - s)) s++;
  return { at: p, del: before.length - p - s, ins: after.slice(p, after.length - s) };
}
