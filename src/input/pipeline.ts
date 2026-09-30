// 输入管线（深模块）：所有「往文本框里打字」的路都从这里过。created 2026-09-29 by Claude Fable 5.1
//   user 2026-09-29「加软键盘…可能得收一个深模块。以及一大堆输入上面的问题…不知道是插入的 hook 和 undo 还是没有收成窄接口」。
//   以前这一段住在 app.ts（setupImeOn / imeKeydown / routeSyntheticKey / commitText，按元素逐个挂）；现在：
//     · 入口只有三种：实体键盘（window 捕获阶段的 keydown，任何文本框自动接入，不用逐个登记）、系统层组字 / 系统软键盘（beforeinput / compositionend）、
//       app 自己的键（软键盘 / 候选条 / 退格钮 → press / literal / pick）。
//     · 出口只有一个：text-edit 的 replaceRange（保 undo 栈、必发 input）。落盘节律 / 排版 / 章节名框都听 input，不再靠调用方事后「记一笔」。
//     · 输入法吃掉的键 = 在 window 捕获阶段就 preventDefault —— 后面的处理器（sheet 的 Esc / Enter、章节名框、全局快捷键）看 defaultPrevented 让路，
//       同「系统输入法组字中 keydown 的 isComposing」一个口径（ui/text-field.ts isCompositionKey 一并认）。
//     · app 自己的键排成一条队（上一个键连同它的上屏都做完，下一个键才开始）：连打「ni 空格 。」顺序不会乱。
//   不管的事：键盘长什么样（soft-keyboard.ts）、候选画在哪（dock.ts）、哪个框能不能改（deps.canEdit）。
import type { NaturalCodeIME, ImeResult } from "../ime.ts";
import { replaceRange, isProgrammaticEdit } from "../text-edit.ts";
import { asTextField, isMasked, isWritable, insertText, deleteBackward, moveCaret, pressEnter, isOwnSyntheticKey, type TextField } from "./field.ts";

export interface PipelineDeps {
  ime: NaturalCodeIME;
  /** 这个框现在能不能改（正文框问 app 的锁 / 只读 / 世界线守卫；其余框看 readOnly）。 */
  canEdit(el: TextField): boolean;
  /** 键盘敲了一个键（不含修饰键；不含本模块自己合成的回车）：语音模式退场；e.isTrusted = 真的实体键盘 → 软键盘据此让位。el = 当时焦点所在的文本框（没有 = null）。 */
  onKeydown?(el: TextField | null, e: KeyboardEvent): void;
  /** 任何一次输入活动（闲置计时用）。 */
  onActivity?(): void;
  /** 输入法上屏了一个词（用户词库节流推）。 */
  onCommit?(): void;
  /** 组字状态可能变了：重画顶栏中 / 英、候选。 */
  onChange(): void;
}
export interface InputPipeline {
  /** CapsLock 是语音键时 app 设 true：实体键盘打进内置输入法的单字母折回小写（CapsLock 翻大小写锁；2026-09-30）。 */
  foldCapsLock: boolean;
  /** app 自己的键要打进哪个框：焦点所在的文本框；焦点丢了就回到上一个还在屏上的文本框并把焦点还给它。没有 → null。 */
  target(): TextField | null;
  /** 只看不动（画候选用）：焦点所在的文本框。 */
  focused(): TextField | null;
  /** 按一个键（KeyboardEvent.key 词汇："a" / "Backspace" / "Enter" / " " / "ArrowLeft"）：先问输入法，它不要就做默认动作。 */
  press(key: string): Promise<void>;
  /** 原样落字（符号层 / 大写字母）：组字中先把首选上屏，再落字；不经输入法。 */
  literal(text: string): Promise<void>;
  /** 点第 index 个候选（当前页，0 起）；index < 0 = 首选上屏。 */
  pick(index: number): Promise<void>;
  /** 候选翻页。 */
  page(prev: boolean): Promise<void>;
  /** 中 ↔ 英（同实体键盘单击 Shift）。 */
  toggleMode(): Promise<void>;
  /** 把一个已经到手的 keydown 交给输入法（焦点不在任何框上时 app 把第一击救回正文用）。 */
  routeHardwareKey(el: TextField, e: KeyboardEvent): Promise<void>;
}

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Fn", "FnLock", "NumLock", "ScrollLock", "OS", "Hyper", "Super", "AltGraph"]);

export function createInputPipeline(d: PipelineDeps): InputPipeline {
  const ime = d.ime;
  let lastField: TextField | null = null;
  let shiftCleanPress = false;
  let lastRealKeydownAt = 0;   // 系统软键盘路由判据：80 ms 内见过可辨认的 keydown = 实体键盘那条路已经处理过，beforeinput 不再重复路由

  const focused = (): TextField | null => asTextField(document.activeElement);
  function target(): TextField | null {
    const a = focused();
    if (a) return a;
    const l = lastField;
    if (!l || !l.isConnected || l.offsetParent === null) return null;   // 已经不在屏上（sheet 关了 / 侧栏收了）
    try { l.focus({ preventScroll: true }); } catch { /* ignore */ }
    return focused() === l ? l : null;
  }
  const editable = (el: TextField): boolean => isWritable(el) && d.canEdit(el);

  /** 输入法上屏落字：幽灵拼音（系统层组字残留在框里的裸字母）一并替换。 */
  function commitText(el: TextField, consumedBuffer: string, text: string): void {
    if (el instanceof HTMLInputElement) text = text.replace(/[\r\n]+/g, "");   // 单行框：组字中按回车 = 首选上屏，不带换行（也不留空格）
    let start = el.selectionStart ?? el.value.length; const end = el.selectionEnd ?? start;
    if (consumedBuffer && start === end && start >= consumedBuffer.length && el.value.slice(start - consumedBuffer.length, start) === consumedBuffer) start -= consumedBuffer.length;
    replaceRange(el, start, end, text);
  }
  function apply(el: TextField, r: ImeResult): void {
    if (r.type !== "commit") return;
    commitText(el, r.consumedBuffer, r.text);
    d.onCommit?.();
  }

  // ── 实体键盘 ──
  async function routeHardwareKey(el: TextField, e: KeyboardEvent): Promise<void> {
    if (isMasked(el)) return;
    if (e.key !== "Unidentified" && e.key !== "Process") lastRealKeydownAt = Date.now();
    if (e.key === "Shift") { if (!e.ctrlKey && !e.altKey && !e.metaKey && !e.repeat && ime.enabled) shiftCleanPress = true; return; }
    shiftCleanPress = false;
    if (!editable(el)) return;
    // CapsLock 当语音键时（app 设 foldCapsLock）：大小写锁被它翻来翻去，单字母一律折回小写再给输入法——不然拼音全大写进 RIME（2026-09-30）。
    //   e.key 只读 → 代理一层只改 key，方法绑回原事件（preventDefault 要在真事件上生效）。
    let ev = e;
    if (api.foldCapsLock && e.key.length === 1 && e.key >= "A" && e.key <= "Z" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && e.getModifierState("CapsLock")) {
      const lower = e.key.toLowerCase();
      ev = new Proxy(e, { get: (t, prop) => { if (prop === "key") return lower; const v = Reflect.get(t, prop) as unknown; return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(t) : v; } });
    }
    const r = await ime.onKeydown(ev);   // 要吃的键在它第一个 await 之前就 preventDefault（同步生效）
    apply(el, r);
    d.onChange();
  }
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (isOwnSyntheticKey(e)) return;
    const el = asTextField(e.target);
    d.onActivity?.();
    if (e.key !== "Unidentified" && e.key !== "Process" && !MODIFIER_KEYS.has(e.key)) d.onKeydown?.(el, e);
    if (el) void routeHardwareKey(el, e);
  }, true);
  window.addEventListener("keyup", (e: KeyboardEvent) => {
    if (e.key !== "Shift" || !shiftCleanPress) return;
    shiftCleanPress = false;
    const el = asTextField(e.target);
    if (!el || isMasked(el)) return;
    void ime.toggleAsciiMode().then((r) => { apply(el, r); d.onChange(); });
  }, true);
  window.addEventListener("blur", () => { shiftCleanPress = false; });
  document.addEventListener("focusin", (e) => { const el = asTextField(e.target); if (el) lastField = el; shiftCleanPress = false; });

  // ── 系统层组字 / 系统软键盘（逃生开关「改用系统输入法」关着、但系统仍插手的平台：Quest / 安卓把实体键盘的字母也过一遍系统输入法）──
  //   纯 ASCII 组字 = 系统替我们攒的拼音 → 结束时删掉系统留下的裸字母、逐字喂给内置输入法；含非 ASCII（系统输入法已出汉字）→ 原样保留。
  //   insertCompositionText 不可 preventDefault，只能事后处理。不撤字（撤字 = 「无法输入」，user 2026-09-04 Quest 回归）。
  window.addEventListener("compositionend", (event: Event) => {
    const el = asTextField(event.target);
    if (!el || !ime.enabled || isProgrammaticEdit() || isMasked(el)) return;
    const data = (event as CompositionEvent).data ?? "";
    if (!data || !/^[a-zA-Z0-9;]+$/.test(data)) return;
    const end = el.selectionEnd ?? el.value.length, start = Math.max(0, end - data.length);
    if (el.value.slice(start, end) !== data) return;
    replaceRange(el, start, end, "");
    for (const ch of data) void press(ch.toLowerCase());
  }, true);
  window.addEventListener("beforeinput", (event: Event) => {
    const el = asTextField(event.target);
    const ie = event as InputEvent;
    if (!el || !ime.enabled || isProgrammaticEdit() || isMasked(el)) return;   // 自己落的字别再路由一遍
    if (Date.now() - lastRealKeydownAt < 80) {   // 实体键盘：keydown 已路由；这里只挡组字中的裸字符
      if (!ime.isComposing()) return;
      if (ie.inputType !== "insertText" || !ie.data) return;
      if (/^[a-z0-9 ]$/i.test(ie.data)) event.preventDefault();
      return;
    }
    // 系统软键盘（没有可辨认的 keydown）：把 insertText / 删除 / 换行翻成按键问输入法；它要 → 拦下浏览器的插入
    let key: string | null = null;
    if (ie.inputType === "insertText" && ie.data && ie.data.length === 1) key = ie.data;
    else if (ie.inputType === "deleteContentBackward") key = "Backspace";
    else if (ie.inputType === "insertLineBreak" || ie.inputType === "insertParagraph") key = "Enter";
    if (!key || !editable(el)) return;
    const fake = new KeyboardEvent("keydown", { key, cancelable: true });
    const pending = ime.onKeydown(fake);
    if (!fake.defaultPrevented) return;   // 输入法放行 → 浏览器照常插入
    event.preventDefault();
    void pending.then((r) => { apply(el, r); d.onChange(); });
  }, true);

  // ── app 自己的键（软键盘 / 候选条 / 退格钮）：一条队 ──
  let chain: Promise<void> = Promise.resolve();
  function enqueue(fn: (el: TextField) => Promise<void> | void): Promise<void> {
    const run = async (): Promise<void> => {
      const el = target();
      if (!el || !editable(el)) return;
      d.onActivity?.();
      try { await fn(el); } finally { d.onChange(); }
    };
    const p = chain.then(run, run);
    chain = p.catch((e) => { console.warn("[input] key failed", e); });
    return chain;
  }
  const usesIme = (el: TextField): boolean => ime.enabled && !isMasked(el);
  function defaultAction(el: TextField, key: string): void {
    if (key === "Backspace") deleteBackward(el);
    else if (key === "Enter") pressEnter(el);
    else if (key === "ArrowLeft") moveCaret(el, -1);
    else if (key === "ArrowRight") moveCaret(el, 1);
    else if ([...key].length === 1) insertText(el, key);
  }
  function press(key: string): Promise<void> {
    return enqueue(async (el) => {
      if (usesIme(el)) {
        const fake = new KeyboardEvent("keydown", { key, cancelable: true });
        const pending = ime.onKeydown(fake);
        if (fake.defaultPrevented) { apply(el, await pending); return; }
      }
      defaultAction(el, key);
    });
  }
  function literal(text: string): Promise<void> {
    return enqueue(async (el) => {
      if (usesIme(el) && ime.isComposing()) apply(el, await ime.commitFirst());
      insertText(el, text);
    });
  }
  function pick(index: number): Promise<void> {
    return enqueue(async (el) => { if (usesIme(el)) apply(el, index < 0 ? await ime.commitFirst() : await ime.choose(index)); });
  }
  function page(prev: boolean): Promise<void> {
    return enqueue(async (el) => { if (usesIme(el)) await ime.turnPage(prev); });
  }
  function toggleMode(): Promise<void> {
    const run = async (): Promise<void> => {
      const el = target();
      const r = await ime.toggleAsciiMode();
      if (el && editable(el) && !isMasked(el)) apply(el, r);
      d.onChange();
    };
    const p = chain.then(run, run);
    chain = p.catch((e) => { console.warn("[input] mode toggle failed", e); });
    return chain;
  }
  const api = { target, focused, press, literal, pick, page, toggleMode, routeHardwareKey, /** CapsLock 是语音键时开：实体键盘单字母折回小写（见 routeHardwareKey）。 */ foldCapsLock: false };
  return api;
}
