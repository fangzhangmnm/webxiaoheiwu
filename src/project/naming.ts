// 节点默认名与显示名（app 层小工具，无 DOM）。created 2026-09-10 by Claude Fable 5.1
//   · 默认名 = 「第 N 章」按当前界面语言生成（user 2026-09-10「默认节点就叫第一章」「根据当前语言自动生成」）：zh 用汉字数字，en 用阿拉伯数字。
//   · 显示名不带扩展名（user 2026-09-10「吃书：还是不显示扩展名吧」）：只剥 `.txt`（app 自己建的节点永远是 .txt）；别的扩展名照显，免得 .md/.jpg 混淆。
//     身份仍是带扩展名的完整文件名（ADR-0009 §1/§5 不动，只改渲染）。
import { t, lang } from "../i18n/index.ts";
import { nameKey } from "./format.ts";

/** 渲染用名字：剥 .txt。 */
export const nodeDisplayName = (name: string): string => name.replace(/\.txt$/i, "");
const DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
/** 1..9999 → 汉字数字（一 / 十 / 十一 / 二十 / 一百零一 / 一百一十 / 一千零一…）；范围外 → 阿拉伯数字。 */
export function chineseNumeral(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 9999) return String(n);
  const units = ["", "十", "百", "千"];
  const digits = String(n).split("").map(Number);   // 高位在前
  let out = "";
  let pendingZero = false;
  for (let i = 0; i < digits.length; i++) {
    const d = digits[i]!; const pos = digits.length - 1 - i;
    if (d === 0) { pendingZero = out.length > 0; continue; }
    if (pendingZero) { out += "零"; pendingZero = false; }
    out += (d === 1 && pos === 1 && out.length === 0 ? "" : DIGITS[d]!) + units[pos]!;   // 10..19 = 十…（不写「一十」）
  }
  return out;
}
/** 第 n 章（按当前语言）。 */
export function chapterName(n: number): string { return t("chapter.name", { n: lang() === "zh" ? chineseNumeral(n) : String(n) }); }
const ZH_DIGIT: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const ZH_UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
/** 汉字数字 / 阿拉伯数字 → 整数；解析不了 → null。（「十」=10、「十二」=12、「二十」=20、「一百零一」=101） */
export function parseNumeral(s: string): number | null {
  const x = s.trim();
  if (/^\d{1,5}$/.test(x)) return Number(x);
  if (!x || !/^[零一二两三四五六七八九十百千]+$/.test(x)) return null;
  let total = 0, cur = 0;
  for (const ch of x) {
    if (ch in ZH_UNIT) { const u = ZH_UNIT[ch]!; total += (cur || 1) * u; cur = 0; }
    else { const d = ZH_DIGIT[ch]!; cur = d; if (d === 0) cur = 0; }
  }
  return total + cur;
}
/** 名字（不带 .txt）是「第 N 章 / Chapter N」→ N；不是 → null。中英都认，与界面语言无关。 */
export function chapterNumberOf(name: string): number | null {
  const stem = nodeDisplayName(name).trim();
  const zh = stem.match(/^第\s*(.+?)\s*章$/); if (zh) return parseNumeral(zh[1]!);
  const en = stem.match(/^chapter\s+(\d{1,5})$/i); if (en) return Number(en[1]);
  return null;
}
/** 下一个章节文件名（带 .txt）：**按语义续号** = 已有「第 N 章」里最大的 N + 1（没有 → 第一章），撞名再往后。
 *  不数文件个数（user 2026-09-10「突然就来了个第四章，你是数了文件个数但是没有看语义吗」）。 */
export function nextChapterName(existing: Iterable<string>): string {
  const taken = new Set<string>(); let max = 0;
  for (const n of existing) { taken.add(nameKey(n)); const k = chapterNumberOf(n); if (k != null && k > max) max = k; }
  for (let n = max + 1; n < max + 10_000; n++) { const cand = chapterName(n) + ".txt"; if (!taken.has(nameKey(cand))) return cand; }
  return `${Date.now()}.txt`;   // 不可能到这：兜底
}
