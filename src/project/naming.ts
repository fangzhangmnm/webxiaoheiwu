// 节点默认名与显示名（app 层小工具，无 DOM）。created 2026-09-10 by Claude Fable 5.1
//   · 默认名 = 「第 N 章」按当前界面语言生成（user 2026-09-10「默认节点就叫第一章」「根据当前语言自动生成」）：zh 用汉字数字，en 用阿拉伯数字。
//   · 显示名不带扩展名（user 2026-09-10「吃书：还是不显示扩展名吧」）：只剥 `.txt`（app 自己建的节点永远是 .txt）；别的扩展名照显，免得 .md/.jpg 混淆。
//     身份仍是带扩展名的完整文件名（ADR-0009 §1/§5 不动，只改渲染）。
import { t, lang } from "../i18n/index.ts";
import { nameKey } from "./format.ts";

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
/** 下一个不撞名的章节文件名（带 .txt）：从「已有节点数 + 1」起数，撞了就往后。 */
export function nextChapterName(existing: Iterable<string>): string {
  const taken = new Set<string>(); let count = 0;
  for (const n of existing) { taken.add(nameKey(n)); count++; }
  for (let n = count + 1; n < count + 10_000; n++) { const cand = chapterName(n) + ".txt"; if (!taken.has(nameKey(cand))) return cand; }
  return `${Date.now()}.txt`;   // 不可能到这：兜底
}
/** 渲染用名字：剥 .txt。 */
export const nodeDisplayName = (name: string): string => name.replace(/\.txt$/i, "");
