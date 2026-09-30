// app 内软键盘（纯界面）：画键、认手指、吐出「按了哪个键」。created 2026-09-29 by Claude Fable 5.1
//   user 2026-09-29「加软键盘，以后不用触屏手机的自带键盘了。全量禁用」「软键盘是学学手机」「不过不要忘了 vr 的输入模态」。
//   不认识输入法、不认识文本框：字母 / 退格 / 回车 / 空格 → onKey（KeyboardEvent.key 词汇，交给输入管线先问输入法）；
//   符号 / 数字 / 大写字母 → onLiteral（所见即所得：键帽上画什么就落什么，不经输入法的标点映射）。
//   手指规则：
//     · 抬手才算数（按下只是亮起来）；滑出键面再抬 = 取消。第二根手指按下时，前一根还没抬的键先算数——快打时两指交叠不丢字、不乱序。
//     · 退格按下即删、按住连删。
//     · 有手指按着的时候不重画键面（重画会换掉节点，按着的那个键就收不到抬手了）：上档 / 换层的重画排到所有手指都抬起之后；
//       字母键落大写还是小写在**抬手那一刻**按当时的上档状态判，不看键帽上当时画的是什么。
//     · 键面上 touchstart / mousedown 一律 preventDefault：焦点留在文本框里；iOS 的原生文字手势（点一下挪光标）不会穿过键盘落到下面的正文上。
//   VR：手柄射线 / 手势捏合也是 pointer 事件，一次一个指针；hover 高亮帮瞄准（CSS `@media (hover: hover)`）。
import { iconHtml } from "../ui/icon.ts";

export type KeyboardMode = "zh" | "en";
export type KeyboardForm = "phone" | "tablet";
export interface SoftKeyboardDeps {
  onKey(key: string): void;
  onLiteral(text: string): void;
  onToggleMode(): void;
  /** 「收起键盘」键（v2.1.24 从候选条右侧搬进最下一排最右，像 iPad；候选条整行都留给候选词——user 2026-09-29「那个下箭头的位置也不对，吃掉了候选词需要的宝贵的横向空间」）。 */
  onHide(): void;
  /** 引号风格（设置项；缺省 curly）：符号层第一层放哪对引号。 */
  quoteStyle?(): "curly" | "corner";
  /** 键帽上的字（界面语言）。 */
  labels: { space: string; symbols: string; letters: string; more: string; zh: string; en: string; enter: string; backspace: string; shift: string; hide: string };
}
export interface SoftKeyboard {
  el: HTMLElement;
  /** 外部输入变了（引号风格）：重画键面（有手指按着时等抬手）。 */
  refresh(): void;
  setMode(mode: KeyboardMode): void;
  /** 密码框：只有英文层，中 / 英键灰掉。 */
  setMasked(masked: boolean): void;
  setForm(form: KeyboardForm): void;
  /** 这个方案把哪些标点当字母用（微软双拼的 `;`）：字母层多给一个键。 */
  setExtraLetters(keys: string[]): void;
  /** 回到字母层、放开上档（换了文本框 / 收起键盘时）。 */
  reset(): void;
}

type Layer = "letters" | "sym1" | "sym2";
type Act = "key" | "letter" | "literal" | "shift" | "layer" | "mode" | "hide";
interface K { act: Act; v: string; label?: string; icon?: string; w?: number; cls?: string; aria?: string }

const lit = (chars: string): K[] => [...chars].map((c) => ({ act: "literal" as const, v: c }));
const litList = (list: string[]): K[] => list.map((c) => ({ act: "literal" as const, v: c }));
// 符号层：中文态 = 中文标点（所见即所得），英文态 = ASCII。数字行两态相同。
// 符号层照 iOS（v2.1.34，user 2026-09-30「可以对一下 ios 的键位」「ios 中英键位是有点不一样」，两张截图）：
//   英：1234567890 / - / : ; ( ) $ & @ " / #+= . , ? ! ' ⌫；中：1234567890 / - / ： ； （ ） $ @ “ ” / #+= 。 ， 、 ？ ！ . ⌫
//   引号对跟设置的引号风格（v2.1.33，user「软键盘的引号没有跟着引号风格变」）：corner 时第一层是 「」、“” 去第二层。
//   第二层（#+=）iOS 只给了英文的：[ ] { } # % ^ * + = / _ \ | ~ < > € £ ¥ • / 123 . , ? ! '；中文照着搬（全角括号、《》、……——、·、￥）。
const SYM1_ZH = (corner: boolean): K[][] => [lit("1234567890"), litList(["-", "/", "：", "；", "（", "）", "$", "@", ...(corner ? ["「", "」"] : ["“", "”"])]), litList(["。", "，", "、", "？", "！", "."])];
const SYM2_ZH = (corner: boolean): K[][] => [litList(["【", "】", "｛", "｝", "#", "%", "^", "*", "+", "="]), litList(["_", "\\", "|", "～", "《", "》", "……", "——", "·", "￥"]), litList(corner ? ["“", "”", "‘", "’", "『", "』"] : ["「", "」", "『", "』", "‘", "’"])];
const SYM1_EN: K[][] = [lit("1234567890"), lit("-/:;()$&@\""), lit(".,?!'")];
const SYM2_EN: K[][] = [lit("[]{}#%^*+="), lit("_\\|~<>€£¥•"), lit(".,?!'")];

export function createSoftKeyboard(d: SoftKeyboardDeps): SoftKeyboard {
  const el = document.createElement("div");
  el.className = "ime-keys"; el.setAttribute("role", "group");
  let mode: KeyboardMode = "zh", masked = false, form: KeyboardForm = "phone", layer: Layer = "letters";
  let shift: "off" | "once" | "lock" = "off", lastShiftTap = 0;
  let extra: string[] = [];
  let keys: K[] = [];   // 当前画在屏上的键（下标 = data-i）

  const effMode = (): KeyboardMode => (masked ? "en" : mode);
  const upper = (): boolean => shift !== "off";
  const letterKey = (c: string): K => ({ act: "letter", v: c, label: upper() ? c.toUpperCase() : c });
  function rows(): K[][] {
    const zh = effMode() === "zh";
    const bksp: K = { act: "key", v: "Backspace", icon: "backspace", w: 1.5, cls: "fn", aria: d.labels.backspace };
    const enter: K = { act: "key", v: "Enter", icon: "key-enter", w: form === "tablet" ? 1.6 : 1.8, cls: "fn accent", aria: d.labels.enter };
    const modeKey: K = { act: "mode", v: "", label: zh ? d.labels.zh : d.labels.en, w: 1.25, cls: "fn" + (masked ? " disabled" : "") };
    const space: K = { act: "key", v: " ", label: d.labels.space, w: form === "tablet" ? 5 : 3.6, cls: "space" };
    const hide: K = { act: "hide", v: "", icon: "chevron-down", w: 1, cls: "fn hide", aria: d.labels.hide };
    if (layer === "letters") {
      const r1 = [..."qwertyuiop"].map(letterKey), r2 = [..."asdfghjkl"].map(letterKey), r3 = [..."zxcvbnm"].map(letterKey);
      for (const x of extra) r2.push({ act: "key", v: x, label: x });
      const sh: K = { act: "shift", v: "", icon: "key-shift", w: 1.5, cls: "fn" + (shift === "lock" ? " locked" : shift === "once" ? " on" : ""), aria: d.labels.shift };
      const comma: K = zh ? { act: "literal", v: "，" } : { act: "literal", v: "," };
      const dot: K = zh ? { act: "literal", v: "。" } : { act: "literal", v: "." };
      const bottom: K[] = [{ act: "layer", v: "sym1", label: d.labels.symbols, w: 1.25, cls: "fn" }, modeKey, comma, space, dot];
      if (form === "tablet") bottom.push({ act: "key", v: "ArrowLeft", icon: "chevron-left", cls: "fn" }, { act: "key", v: "ArrowRight", icon: "chevron-right", cls: "fn" });
      bottom.push(enter, hide);
      const out = [r1, r2, [sh, ...r3, bksp], bottom];
      if (form === "tablet") out.unshift(lit("1234567890"));
      return out;
    }
    const corner = d.quoteStyle?.() === "corner";
    const table = layer === "sym1" ? (zh ? SYM1_ZH(corner) : SYM1_EN) : zh ? SYM2_ZH(corner) : SYM2_EN;
    const flip: K = { act: "layer", v: layer === "sym1" ? "sym2" : "sym1", label: layer === "sym1" ? d.labels.more : d.labels.symbols, w: 1.5, cls: "fn" };
    return [table[0]!, table[1]!, [flip, ...table[2]!, bksp], [{ act: "layer", v: "letters", label: d.labels.letters, w: 1.25, cls: "fn" }, modeKey, space, enter, hide]];
  }
  let renderDue = false;
  /** 状态变了要重画：有手指按着就先欠着。 */
  function invalidate(): void { if (pending.size) renderDue = true; else render(); }
  function render(): void {
    renderDue = false;
    keys = [];
    const html: string[] = [];
    for (const row of rows()) {
      const letters = layer === "letters" && row.every((k) => k.act === "shift" || k.v === "Backspace" || k.act === "letter" || (k.act === "key" && /^[a-z;]$/.test(k.v)));   // 字母排（含 shift / 退格）：CSS 按 iOS 几何定宽
      html.push(`<div class="ime-row" data-n="${row.length}"${letters ? ' data-letters=""' : ""}>`);
      for (const k of row) {
        const i = keys.push(k) - 1;
        const label = k.icon ? iconHtml(k.icon, { cls: "ico" }) : esc(k.label ?? k.v);
        const wide = [...(k.label ?? k.v)].length > 1 && !k.icon ? " small" : "";
        html.push(`<div class="ime-key ${k.cls ?? ""}${wide}" data-i="${i}" style="flex-grow:${k.w ?? 1}" role="button"${k.aria ? ` aria-label="${esc(k.aria)}"` : ""}>${label}</div>`);
      }
      html.push(`</div>`);
    }
    el.innerHTML = html.join("");
    el.dataset.form = form; el.dataset.layer = layer;
  }
  const esc = (x: string): string => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

  function fire(k: K): void {
    if (k.act === "letter") {
      // 不按上档：字母交给管线（中文态输入法拿去组字，英文态 / 密码框它放行 → 落小写）；按了上档：原样落大写，不进组字
      if (upper()) d.onLiteral(k.v.toUpperCase()); else d.onKey(k.v);
      if (shift === "once") { shift = "off"; invalidate(); }
    }
    else if (k.act === "key") d.onKey(k.v);
    else if (k.act === "literal") d.onLiteral(k.v);
    else if (k.act === "shift") { const now = Date.now(); shift = shift === "off" ? "once" : shift === "once" && now - lastShiftTap < 400 ? "lock" : "off"; lastShiftTap = now; invalidate(); }
    else if (k.act === "layer") { layer = k.v as Layer; invalidate(); }
    else if (k.act === "mode") { if (!masked) d.onToggleMode(); }
    else if (k.act === "hide") d.onHide();
  }

  // ── 手指 ──
  const pending = new Map<number, { i: number; node: HTMLElement }>();   // pointerId → 按着还没抬的键
  let repeatTimer: ReturnType<typeof setTimeout> | null = null;
  const stopRepeat = (): void => { if (repeatTimer) { clearTimeout(repeatTimer); repeatTimer = null; } };
  const keyAt = (t: EventTarget | null): HTMLElement | null => (t instanceof Element ? t.closest<HTMLElement>(".ime-key") : null);
  const release = (id: number, commit: boolean): void => {
    const p = pending.get(id); if (!p) return;
    pending.delete(id); p.node.classList.remove("pressed");
    try { el.releasePointerCapture(id); } catch { /* 已经放了 */ }
    const k = keys[p.i];
    if (commit && k && !(k.act === "key" && k.v === "Backspace")) fire(k);   // 退格在按下时已经删过
    if (!pending.size && renderDue) render();
  };
  el.addEventListener("pointerdown", (e: PointerEvent) => {
    const node = keyAt(e.target); if (!node) return;
    e.preventDefault();
    for (const id of [...pending.keys()]) release(id, true);   // 前一根手指还按着的键先算数
    const i = Number(node.dataset.i), k = keys[i]; if (!k) return;
    pending.set(e.pointerId, { i, node }); node.classList.add("pressed");
    try { el.setPointerCapture(e.pointerId); } catch { /* 合成事件 / 老浏览器：没有捕获也能用，只是滑出键盘再抬手收不到 */ }
    if (k.act === "key" && k.v === "Backspace") {
      d.onKey("Backspace"); stopRepeat();
      const tick = (): void => { d.onKey("Backspace"); repeatTimer = setTimeout(tick, 70); };
      repeatTimer = setTimeout(tick, 420);
    }
  });
  const onUp = (e: PointerEvent): void => {
    stopRepeat();
    const p = pending.get(e.pointerId); if (!p) return;
    const hit = keyAt(document.elementFromPoint(e.clientX, e.clientY));   // 指针被键盘容器捕获着，target 恒为容器：按抬手位置找键；滑出原来那个键 = 取消
    release(e.pointerId, hit === p.node);
  };
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", (e: PointerEvent) => { stopRepeat(); release(e.pointerId, false); });
  el.addEventListener("lostpointercapture", (e: PointerEvent) => { if (pending.has(e.pointerId)) { stopRepeat(); release(e.pointerId, false); } });
  el.addEventListener("mousedown", (e) => e.preventDefault());
  el.addEventListener("touchstart", (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  el.addEventListener("contextmenu", (e) => e.preventDefault());

  render();
  return {
    el,
    setMode(m) { if (mode !== m) { mode = m; invalidate(); } },
    setMasked(v) { if (masked !== v) { masked = v; invalidate(); } },
    setForm(f) { if (form !== f) { form = f; invalidate(); } },
    setExtraLetters(list) { if (list.join() !== extra.join()) { extra = [...list]; invalidate(); } },
    reset() { stopRepeat(); pending.clear(); if (layer !== "letters" || shift !== "off" || renderDue) { layer = "letters"; shift = "off"; render(); } },
    refresh() { invalidate(); },
  };
}
