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
//   键位对齐 iOS 肌肉记忆（v2.3.29，user 2026-10-04「能不能让软键盘的位置和我的肌肉记忆对齐，或者至少退格键放在上面」+ iPad mini / iPhone SE2 两张截图；
//     「左右可以加。数字收到符号里面省空间吧」）：宽度按「格」算（slot：一格 = 键宽 + 缝，CSS --pitch），键中心落在 iOS 同一个键的位置上。
//     · 平板 = iPad：q…p ⌫ / 缩进半键 a…l 回车 / ⇧ z…m ！， ？。 ⇧ / 中英 符号 空格 ← → 符号 收起（中英在地球键的位置；← → 从空格右端切出来）；
//       符号层 = iPad 的 .?123 层：数字 ⌫ / 符号 回车 / … / 同一排底。不再有数字行（数字在符号层第一排）。
//     · 手机 = iPhone：前三排照旧（v2.1.33）；最下一排 符号 中英 ， 空格 。 回车——回车在最右下角、和 iPhone 一样宽（以前最右下角是「收起」，按 iPhone 习惯点回车会把键盘收掉）；
//       「收起」进符号层最下一排（iPhone 话筒那一格）。
//   v2.3.31（user 2026-10-04 iPhone / iPad 符号层截图 +「符号可是按照实际中文写作的常用频率放，比如单双引号，省略号破折号，然后都是全角的」「语音也收进来」
//     「手机侧可以也学苹果放在候选栏的旁边」；选项里选了「苹果原样」「整排按频率」「标点后自动回」；「直角双线引号会用的蛮多的，可以和直角单线引号放一起，不过记得我们的引号策略」）：
//     · 手机底排 = iPhone 原样：123 · 中英 · 话筒 · 空格 · 回车（，。只在 123 层）；「收起」去候选条右端（dock.ts）。这台设备语音不可用时空格吃掉话筒那格。
//     · 中文符号层按 user 自己的小说统计的频率排（tmp/migration 三本、排除 AI 页与 Journal，每千汉字：，51 。40 “”各18 ？6.4 ！2.5 ——1.3 ……1.2 ：2.0 、1.0 ‘’各0.6 （）0.4 ～0.4 《》0.2 ·0.1），全角。
//     · 引号四格跟设置的引号风格：curly = “ ” ‘ ’、corner = 「 」 『 』；另一套整组在 #+= 层第一排，同样四个挨着。
//     · 在符号层点了数字以外的字 → 自动回字母层（数字常连打，不回）。
import { iconHtml } from "../ui/icon.ts";

export type KeyboardMode = "zh" | "en";
export type KeyboardForm = "phone" | "tablet";
export interface SoftKeyboardDeps {
  onKey(key: string): void;
  onLiteral(text: string): void;
  onToggleMode(): void;
  /** 「收起键盘」键（v2.1.24 从候选条右侧搬进最下一排最右，像 iPad；候选条整行都留给候选词——user 2026-09-29「那个下箭头的位置也不对，吃掉了候选词需要的宝贵的横向空间」）。 */
  onHide(): void;
  /** 话筒键（手机底排 iPhone 话筒那格；v2.3.31「语音也收进来」）：点了 = 纸面话筒钮同一个动作。 */
  onMic?(): void;
  /** 引号风格（设置项；缺省 curly）：符号层第一层放哪对引号。 */
  quoteStyle?(): "curly" | "corner";
  /** 键帽上的字（界面语言）。 */
  labels: { space: string; symbols: string; letters: string; more: string; zh: string; en: string; enter: string; backspace: string; shift: string; hide: string; mic?: string };
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
  /** 话筒键的样子：absent = 这台设备 / 这一页没有语音（空格吃掉那格）；其余照纸面话筒钮的 data-state。 */
  setMic(state: MicKeyState): void;
}
export type MicKeyState = "absent" | "idle" | "recording" | "listening" | "transcribing" | "error" | "disabled";

type Layer = "letters" | "sym1" | "sym2";
type Act = "key" | "letter" | "literal" | "shift" | "layer" | "mode" | "hide" | "mic";
/** w = 按权重分剩下的宽（旧排法）；slot = 占几格（一格 = 键宽 + 缝，CSS `--pitch`；键宽 = slot 格 − 一条缝）；fill = 吃掉这一排剩下的；
 *  lead = 左边先空多少个键宽（iPad 第二排的半键缩进）；alt = 上档时落的字（iPad 的「！，」「？。」键，键帽上小字画在上面）。 */
interface K { act: Act; v: string; label?: string; icon?: string; w?: number; slot?: number; fill?: boolean; lead?: number; alt?: string; cls?: string; aria?: string }

const lit = (chars: string): K[] => [...chars].map((c) => ({ act: "literal" as const, v: c }));
const litList = (list: string[]): K[] => list.map((c) => ({ act: "literal" as const, v: c }));
// 符号层：中文态 = 中文标点（所见即所得），英文态 = ASCII。数字行两态相同。
// 符号层照 iOS（v2.1.34，user 2026-09-30「可以对一下 ios 的键位」「ios 中英键位是有点不一样」，两张截图）：
//   英：1234567890 / - / : ; ( ) $ & @ " / #+= . , ? ! ' ⌫；中：1234567890 / - / ： ； （ ） $ @ “ ” / #+= 。 ， 、 ？ ！ . ⌫
//   引号对跟设置的引号风格（v2.1.33，user「软键盘的引号没有跟着引号风格变」）：corner 时第一层是 「」、“” 去第二层。
//   第二层（#+=）iOS 只给了英文的：[ ] { } # % ^ * + = / _ \ | ~ < > € £ ¥ • / 123 . , ? ! '；中文照着搬（全角括号、《》、……——、·、￥）。
/** 引号四格：主用的那套（跟设置）与另一套。 */
const QUOTES = (corner: boolean): { main: string[]; other: string[] } => {
  const curly = ["“", "”", "‘", "’"], cornerQ = ["「", "」", "『", "』"];
  return corner ? { main: cornerQ, other: curly } : { main: curly, other: cornerQ };
};
// 手机（iPhone 结构：10 / 10 / #+= 6 ⌫）
const SYM1_ZH = (corner: boolean): K[][] => [lit("1234567890"), litList([...QUOTES(corner).main, "——", "……", "：", "、", "（", "）"]), litList(["，", "。", "？", "！", "；", "～"])];
const SYM2_ZH = (corner: boolean): K[][] => [litList([...QUOTES(corner).other, "《", "》", "【", "】", "·", "￥"]), litList(["＊", "＃", "－", "／", "％", "＠", "＆", "＋", "＝", "＿"]), litList(["｛", "｝", "＜", "＞", "＼", "｜"])];
const SYM1_EN: K[][] = [lit("1234567890"), lit("-/:;()$&@\""), lit(".,?!'")];
const SYM2_EN: K[][] = [lit("[]{}#%^*+="), lit("_\\|~<>€£¥•"), lit(".,?!'")];
// 平板（iPad .?123 结构：10 + ⌫ / 缩进 9 + 回车 / #+= 9 #+=）；，。在 iPad 字母层的「！，」「？。」键上，这里给单独的 ！？
const TAB1_ZH = (corner: boolean): K[][] => [lit("1234567890"), litList([...QUOTES(corner).main, "——", "……", "：", "、", "；"]), litList(["（", "）", "～", "《", "》", "【", "】", "！", "？"])];
const TAB2_ZH = (corner: boolean): K[][] => [litList([...QUOTES(corner).other, "·", "￥", "｛", "｝", "＜", "＞"]), litList(["＊", "＃", "－", "／", "％", "＠", "＆", "＋", "＝"]), litList(["＿", "＼", "｜", "＾", "＄", "€", "£", "•"])];
const TAB1_EN: K[][] = [lit("1234567890"), lit("@#$&*()'\""), lit("%-+=/;:!?")];
const TAB2_EN: K[][] = [lit("[]{}#%^*+="), lit("_\\|~<>€£¥"), lit("•`.,?!'")];
const isDigit = (v: string): boolean => /^[0-9]$/.test(v);

export function createSoftKeyboard(d: SoftKeyboardDeps): SoftKeyboard {
  const el = document.createElement("div");
  el.className = "ime-keys"; el.setAttribute("role", "group");
  let mode: KeyboardMode = "zh", masked = false, form: KeyboardForm = "phone", layer: Layer = "letters";
  let shift: "off" | "once" | "lock" = "off", lastShiftTap = 0;
  let extra: string[] = [];
  let mic: MicKeyState = "absent";
  let keys: K[] = [];   // 当前画在屏上的键（下标 = data-i）

  const effMode = (): KeyboardMode => (masked ? "en" : mode);
  const upper = (): boolean => shift !== "off";
  const letterKey = (c: string): K => ({ act: "letter", v: c, label: upper() ? c.toUpperCase() : c });
  function rows(): K[][] {
    const zh = effMode() === "zh", tablet = form === "tablet";
    const bksp: K = { act: "key", v: "Backspace", icon: "backspace", w: 1.5, cls: "fn", aria: d.labels.backspace };
    const enter: K = { act: "key", v: "Enter", icon: "key-enter", cls: "fn accent", aria: d.labels.enter };
    const modeKey: K = { act: "mode", v: "", label: zh ? d.labels.zh : d.labels.en, cls: "fn" + (masked ? " disabled" : "") };
    const space: K = { act: "key", v: " ", label: d.labels.space, cls: "space" };
    const hide: K = { act: "hide", v: "", icon: "chevron-down", cls: "fn hide", aria: d.labels.hide };
    const micKey: K = { act: "mic", v: "", icon: "microphone", cls: `fn mic mic-${mic}${mic === "disabled" ? " disabled" : ""}`, aria: d.labels.mic ?? "mic" };
    const toLayer = (v: Layer, label: string): K => ({ act: "layer", v, label, cls: "fn" });
    const s = (k: K, slot: number): K => ({ ...k, slot });
    const fill = (k: K): K => ({ ...k, fill: true });
    const sym = layer === "letters" ? toLayer("sym1", d.labels.symbols) : toLayer("letters", d.labels.letters);
    // 最下一排（各层同一排）。iPad 实测（mini 竖屏，格 = 键宽 + 缝）：地球 1.05 / .?123 1.05 / 空格 6 / .?123 1.55 / 收起 余下 ≈ 1.35——
    //   ← → 各 0.75 从空格右端切（空格 4.5）。iPhone 实测：123 1.25 / 地球 1.25 / 话筒 1 / 空格 4 / 回车 余下 ≈ 2.3——各层同一排（v2.3.31 照原样）；没有语音时空格吃掉话筒那格。
    const arrows: K[] = [{ act: "key", v: "ArrowLeft", icon: "chevron-left", cls: "fn", slot: 0.75 }, { act: "key", v: "ArrowRight", icon: "chevron-right", cls: "fn", slot: 0.75 }];
    const bottom: K[] = tablet ? [s(modeKey, 1.05), s(sym, 1.05), s(space, 4.5), ...arrows, s(sym, 1.55), fill(hide)]
      : mic === "absent" ? [s(sym, 1.25), s(modeKey, 1.25), s(space, 5), fill(enter)]
      : [s(sym, 1.25), s(modeKey, 1.25), s(micKey, 1), s(space, 4), fill(enter)];
    if (layer === "letters") {
      const r1 = [..."qwertyuiop"].map(letterKey), r2 = [..."asdfghjkl"].map(letterKey), r3 = [..."zxcvbnm"].map(letterKey);
      for (const x of extra) r2.push({ act: "key", v: x, label: x });
      const sh: K = { act: "shift", v: "", icon: "key-shift", w: 1.5, cls: "fn" + (shift === "lock" ? " locked" : shift === "once" ? " on" : ""), aria: d.labels.shift };
      if (!tablet) return [r1, r2, [sh, ...r3, bksp], bottom];
      // iPad：每排 11 格。第二排缩进半个键宽（微软双拼多一个 ; 时不缩，回车留一格）；第三排左 ⇧ 一格、右 ⇧ 吃余下 → z 落在 w 下面。
      const one = (k: K): K => s(k, 1);
      const punct = (v: string, alt: string): K => ({ act: "literal", v, alt, slot: 1, aria: v });
      const row2 = r2.map(one); if (!extra.length) row2[0] = { ...row2[0]!, lead: 0.5 };
      return [[...r1.map(one), fill(bksp)], [...row2, fill(enter)], [one(sh), ...r3.map(one), zh ? punct("，", "！") : punct(",", "!"), zh ? punct("。", "？") : punct(".", "?"), fill(sh)], bottom];
    }
    const corner = d.quoteStyle?.() === "corner";
    const table = tablet ? (layer === "sym1" ? (zh ? TAB1_ZH(corner) : TAB1_EN) : zh ? TAB2_ZH(corner) : TAB2_EN)
      : layer === "sym1" ? (zh ? SYM1_ZH(corner) : SYM1_EN) : zh ? SYM2_ZH(corner) : SYM2_EN;
    const flip: K = { act: "layer", v: layer === "sym1" ? "sym2" : "sym1", label: layer === "sym1" ? d.labels.more : d.labels.symbols, w: 1.5, cls: "fn" };
    // iPad 的 .?123 层：数字 ⌫ / 缩进半键 9 个 回车 / #+= 9 个 #+= / 同一排底
    if (tablet) { const r2 = table[1]!.map((k) => s(k, 1)); r2[0] = { ...r2[0]!, lead: 0.5 }; return [[...table[0]!.map((k) => s(k, 1)), fill(bksp)], [...r2, fill(enter)], [{ ...flip, w: 1 }, ...table[2]!, { ...flip, w: 1 }], bottom]; }
    return [table[0]!, table[1]!, [flip, ...table[2]!, bksp], bottom];
  }
  let renderDue = false;
  /** 状态变了要重画：有手指按着就先欠着。 */
  function invalidate(): void { if (pending.size) renderDue = true; else render(); }
  function render(): void {
    renderDue = false;
    keys = [];
    const html: string[] = [];
    for (const row of rows()) {
      const letters = form === "phone" && layer === "letters" && row.every((k) => k.act === "shift" || k.v === "Backspace" || k.act === "letter" || (k.act === "key" && /^[a-z;]$/.test(k.v)));   // 手机字母排（含 shift / 退格）：CSS 按 iOS 几何定宽
      html.push(`<div class="ime-row" data-n="${row.length}"${letters ? ' data-letters=""' : ""}>`);
      for (const k of row) {
        const i = keys.push(k) - 1;
        const label = k.icon ? iconHtml(k.icon, { cls: "ico" }) : k.alt ? `<span class="alt">${esc(k.alt)}</span><span>${esc(k.v)}</span>` : esc(k.label ?? k.v);
        const wide = [...(k.label ?? k.v)].length > 1 && !k.icon ? " small" : "";
        const flex = k.fill ? "flex:1 1 0" : k.slot != null ? `flex:0 0 calc(${k.slot} * var(--pitch) - var(--kg))` : `flex-grow:${k.w ?? 1}`;
        const lead = k.lead ? `;margin-left:calc(${k.lead} * (var(--pitch) - var(--kg)))` : "";
        html.push(`<div class="ime-key ${k.cls ?? ""}${wide}${k.alt ? " dual" + (upper() ? " alt-on" : "") : ""}" data-i="${i}" style="${flex}${lead}" role="button"${k.aria ? ` aria-label="${esc(k.aria)}"` : ""}>${label}</div>`);
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
    else if (k.act === "literal") {
      if (k.alt && upper()) { d.onLiteral(k.alt); if (shift === "once") { shift = "off"; invalidate(); } }   // iPad「！，」「？。」：上档落上面那个
      else d.onLiteral(k.v);
      if (layer !== "letters" && !isDigit(k.v)) { layer = "letters"; invalidate(); }   // 符号层点了标点 → 回字母层（数字不回；v2.3.31 user 选「标点后自动回」）
    }
    else if (k.act === "mic") { if (mic !== "disabled") d.onMic?.(); }
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
    setMic(m) { if (mic !== m) { const relayout = (mic === "absent") !== (m === "absent"); mic = m; if (relayout || form === "phone") invalidate(); } },
  };
}
