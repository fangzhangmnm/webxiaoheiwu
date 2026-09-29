// 文本框上的默认动作（不经输入法的那一半）：落字 / 退格 / 回车 / 挪光标。created 2026-09-29 by Claude Fable 5.1
//   实体键盘上这些是浏览器的默认动作；app 内软键盘没有浏览器替它做，所以得自己做一遍——全部经 text-edit 的 replaceRange（保 undo 栈、必发 input）。
import { replaceRange } from "../text-edit.ts";

export type TextField = HTMLTextAreaElement | HTMLInputElement;
const TEXT_TYPES = new Set(["", "text", "search", "url", "email", "tel", "password"]);
/** 是不是能打字的框（textarea / 文本类 input）；不是 → null。 */
export function asTextField(x: unknown): TextField | null {
  if (x instanceof HTMLTextAreaElement) return x;
  if (x instanceof HTMLInputElement && TEXT_TYPES.has((x.getAttribute("type") ?? "").toLowerCase())) return x;
  return null;
}
/** 密码框（type=password 或 -webkit-text-security 打码）：不走内置输入法（密码是 ASCII，拼音组字会把它吃掉），候选不显示。 */
export const isMasked = (el: HTMLElement): boolean => el instanceof HTMLInputElement && (el.type === "password" || !!el.style.getPropertyValue("-webkit-text-security"));
export const isWritable = (el: TextField): boolean => !el.readOnly && !el.disabled;

const sel = (el: TextField): [number, number] => { const n = el.value.length; const s = el.selectionStart ?? n; return [s, el.selectionEnd ?? s]; };
export function insertText(el: TextField, text: string): void {
  if (el instanceof HTMLInputElement) text = text.replace(/[\r\n]+/g, " ");
  if (!text) return;
  const [s, e] = sel(el);
  if (el.maxLength > 0 && el.value.length - (e - s) + text.length > el.maxLength) return;
  replaceRange(el, s, e, text);
}
/** 光标前一个「字」的起点：整个 emoji / 组合字符算一个（有 Intl.Segmenter 用它，没有就只认代理对）。 */
function prevBoundary(value: string, pos: number): number {
  if (pos <= 0) return 0;
  const from = Math.max(0, pos - 32), chunk = value.slice(from, pos);
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: "grapheme" }) => { segment(s: string): Iterable<{ index: number }> } }).Segmenter;
  if (Seg) { let last = 0; for (const g of new Seg(undefined, { granularity: "grapheme" }).segment(chunk)) last = g.index; return from + last; }
  return pos - (/[\uDC00-\uDFFF]$/.test(chunk) && chunk.length >= 2 ? 2 : 1);
}
function nextBoundary(value: string, pos: number): number {
  if (pos >= value.length) return value.length;
  const chunk = value.slice(pos, pos + 32);
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: "grapheme" }) => { segment(s: string): Iterable<{ index: number; segment: string }> } }).Segmenter;
  if (Seg) { for (const g of new Seg(undefined, { granularity: "grapheme" }).segment(chunk)) return pos + g.segment.length; }
  return pos + (/^[\uD800-\uDBFF]/.test(chunk) && chunk.length >= 2 ? 2 : 1);
}
/** 退格：有选区删选区，否则删光标前一个字。返回删没删。 */
export function deleteBackward(el: TextField): boolean {
  const [s, e] = sel(el);
  if (s !== e) { replaceRange(el, s, e, ""); return true; }
  if (s <= 0) return false;
  replaceRange(el, prevBoundary(el.value, s), s, "");
  return true;
}
/** 左右挪一个字（有选区 → 收到选区那一头）。 */
export function moveCaret(el: TextField, dir: -1 | 1): void {
  const [s, e] = sel(el);
  const to = s !== e ? (dir < 0 ? s : e) : dir < 0 ? prevBoundary(el.value, s) : nextBoundary(el.value, s);
  try { el.setSelectionRange(to, to); } catch { /* 某些 input 类型不支持选区 */ }
}

const ownKeys = new WeakSet<Event>();
/** 这个 keydown 是不是本模块自己发的（软键盘的回车在单行框里 = 合成一次 Enter 让框自己的处理器去提交）。输入管线据此不再路由它。 */
export const isOwnSyntheticKey = (e: Event): boolean => ownKeys.has(e);
/** 回车：多行框 = 换行；单行框 = 让这个框自己的 Enter 处理器去做（sheet 确定 / 章节名提交 / 检索）。 */
export function pressEnter(el: TextField): void {
  if (el instanceof HTMLTextAreaElement) { insertText(el, "\n"); return; }
  const ev = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true });
  ownKeys.add(ev);
  el.dispatchEvent(ev);
}
