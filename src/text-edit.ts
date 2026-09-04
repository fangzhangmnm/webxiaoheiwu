// 程序性改字唯一入口（深模块）：内置 IME 提交 / 语音插入 / 退格钮 / 系统组字收编 / 标题去换行 全走这里。
// created 2026-09-04 by Claude Fable 5.1（user「undo 系统有严重 bug，彻查」）
//   为什么：textarea 的 undo 栈是浏览器的；`el.value = …` / setRangeText 是「程序改值」，Chrome / WebKit / Firefox 一律清栈——
//   内置 IME 默认开之后每提交一个词就清一次，Ctrl+Z 形同虚设（2026-09-04 无头复现：提交后 Ctrl+Z / Ctrl+Shift+Z 全无反应，
//   退格钮删的字也回不来）。execCommand("insertText" / "delete") 走浏览器自己的编辑管线：进 undo 栈、发 beforeinput/input、
//   光标随之。它已标废弃但三家都在，textarea 上没有替代品（InputEvent 没有可编程入口）。
//   失败（不支持 / 目标未聚焦 / 结果不符）回退 setRangeText：丢那一步 undo，不丢字。
let programmatic = 0;
/** 当前是否在程序性改字中——beforeinput / compositionend 守卫据此让路（execCommand 也会触发它们）。 */
export function isProgrammaticEdit(): boolean { return programmatic > 0; }

/** 把 [start, end) 换成 text（text 为空 = 删除）；光标落在替换段末尾。 */
export function replaceRange(el: HTMLTextAreaElement | HTMLInputElement, start: number, end: number, text: string): void {
  const len = el.value.length;
  start = Math.max(0, Math.min(start, len)); end = Math.max(start, Math.min(end, len));
  if (start === end && !text) return;
  const expected = el.value.slice(0, start) + text + el.value.slice(end);
  programmatic++;
  try {
    let ok = false;
    if (document.activeElement === el && typeof document.execCommand === "function") {
      try { el.setSelectionRange(start, end); } catch { /* ignore */ }
      try { ok = document.execCommand(text ? "insertText" : "delete", false, text); } catch { ok = false; }
      if (ok && el.value !== expected) { el.value = expected; }   // 浏览器改成了别的（极少见）：确定性兜底，宁丢 undo 不丢字
    }
    if (!ok) el.setRangeText(text, start, end, "end");
  } finally { programmatic--; }
  try { el.selectionStart = el.selectionEnd = start + text.length; } catch { /* ignore */ }
}
