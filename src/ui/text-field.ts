// 单行文本框的窄接口（v2.1.13，2026-09-26 user「修改标题的会有一些奇怪的bug。我在用ios自带输入法删字。会不会是文本编辑器做对了，其他的文本框没有修。能否抽一个窄接口」）。
// created 2026-09-26 by Claude Fable 5.1
//
// 为什么主编辑区没事、别的框有事：textarea 从不在打字中途回写 .value、也不在合成态里做任何提交；各个 <input> 各自接 keydown / input，没有一个认系统输入法的
//   **合成态**——iOS 中文键盘 / 桌面 IME 组字时按 Enter 是「上屏候选」，keydown 却照样到手（isComposing=true / keyCode 229），于是 sheet 拿半截拼音当确认、
//   章节名框拿半截拼音去改名；章节名框还每 500ms 提交一次改名并把规范化后的名字回写 .value → 光标跳到末尾、末尾空格被吃、正在组的字被打断。
// 这里只做三件事，别的什么都不管：
//   ① 认合成态：compositionstart/end 记状态；keydown 看 isComposing / keyCode 229（Safari 老路）。
//   ② Enter / Escape 在合成态一律不当命令（那是输入法的键）。
//   ③ 受控回写 setValue：值没变不碰（免得光标跑）；变了才写，写完把光标放回原处（夹到新长度内）；合成中推迟到 compositionend 再写。
// 不做：任何防抖 / 自动提交——什么时候提交归调用方（章节名框 = 离开框 / Enter）。

export interface TextFieldOpts {
  onEnter?: (e: KeyboardEvent) => void;
  onEscape?: (e: KeyboardEvent) => void;
  /** 每次 input（含合成中的 insertCompositionText）；composing 让调用方自己决定要不要理。 */
  onInput?: (value: string, composing: boolean) => void;
  onBlur?: () => void;
}
export interface TextField {
  el: HTMLInputElement;
  composing(): boolean;
  /** 受控回写：见文件头 ③。 */
  setValue(v: string): void;
}
/** 这一击是不是输入法在组字（Enter = 上屏、Escape = 取消组字，都不是 app 的命令）。 */
export const isCompositionKey = (e: KeyboardEvent): boolean => e.isComposing || e.keyCode === 229;

export function bindTextField(el: HTMLInputElement, opts: TextFieldOpts = {}): TextField {
  let composing = false;
  let pending: string | null = null;
  function setValue(v: string): void {
    if (composing) { pending = v; return; }
    if (el.value === v) return;
    const focused = document.activeElement === el;
    const s = el.selectionStart ?? v.length, e = el.selectionEnd ?? v.length;
    el.value = v;
    if (focused) { const n = v.length; try { el.setSelectionRange(Math.min(s, n), Math.min(e, n)); } catch { /* ignore */ } }
  }
  el.addEventListener("compositionstart", () => { composing = true; });
  el.addEventListener("compositionend", () => { composing = false; if (pending != null) { const v = pending; pending = null; setValue(v); } });
  el.addEventListener("input", () => { opts.onInput?.(el.value, composing); });
  el.addEventListener("keydown", (e) => {
    if (isCompositionKey(e)) return;   // 输入法的 Enter / Esc 不是命令
    if (e.key === "Enter" && opts.onEnter) { e.preventDefault(); opts.onEnter(e); }
    else if (e.key === "Escape" && opts.onEscape) { e.preventDefault(); opts.onEscape(e); }
  });
  el.addEventListener("blur", () => { composing = false; pending = null; opts.onBlur?.(); });   // 失焦 = 合成必已结束（系统会先上屏）
  return { el, composing: () => composing, setValue };
}
