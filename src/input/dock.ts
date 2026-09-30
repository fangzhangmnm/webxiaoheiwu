// 输入法附件：候选 + 软键盘画在哪、什么时候露。created 2026-09-29 by Claude Fable 5.1
//   user 2026-09-29「软键盘的时候候选框和软键盘应该在一起，就和手机一样，然后常驻」「物理键盘的时候是这种 pc 式的悬浮的，软键盘是学学手机」。
//   两种样子，同一时刻只有一种：
//     · 手机式（软键盘露着）：屏幕底部一整块 = 拼音行 + 候选行 + 键盘。**常驻**（没在组字时候选行空着也占着位置）——纸面让出这块高度（:root --dock-h），
//       所以这块底下永远没有正文；点候选 / 按键之后这块不会消失，手指抬起时底下没有东西可碰。
//     · PC 式（实体键盘）：悬浮候选条，只在组字时出现。触屏点了候选之后**晚一拍再收**（见 FLOAT_LINGER_MS）。
//   跟谁走（v2.1.14 的规矩，user 2026-09-26「未来的软键盘也需要这么处理」）：附件只跟着**焦点所在的文本框**——不是跟着正文、也不看锁屏 / sheet 谁在上面；
//     焦点离开所有文本框，附件就收。层级 --z-ime 在 sheet / 锁屏之上。
//   光标乱跑案（user 2026-09-29「手指按候选词的时候按过之后手指会触碰屏幕下面…确实好像都是光标跳到屏幕下面了」）：以前候选条悬在正文上面、
//     pointerdown 当场上屏并立刻消失——手指还没抬，底下露出来的就是正文；iOS 的原生文字手势在抬手时才认「点了一下」，认的是那一刻手指底下的东西 → 光标被挪到屏幕底部那一行。
//     无头 Chromium 复现不了 iOS 的原生手势（2026-09-29 探针：上屏位置正确），所以修法不靠复现、靠结构：点选一律在 click（整个触摸序列的最后一个事件）才算数；
//     常驻的那块不消失；悬浮的那条晚一拍收。
import type { NaturalCodeIME } from "../ime.ts";
import type { InputPipeline } from "./pipeline.ts";
import { createSoftKeyboard, type SoftKeyboardDeps, type KeyboardForm } from "./soft-keyboard.ts";
import { isMasked } from "./field.ts";
import { iconHtml } from "../ui/icon.ts";

const FLOAT_LINGER_MS = 350;   // 悬浮候选条被触屏点过之后多留这么久（空着）：等手指抬起、原生手势判完
const HIDE_DELAY_MS = 120;     // 焦点离开文本框后晚这么久才收键盘：点按钮那一下别让版面在手指底下跳

export interface ImeDockDeps {
  ime: NaturalCodeIME;
  pipeline: InputPipeline;
  /** 手机式那一块（#imeDock）与 PC 式悬浮条（#candidateBar）。 */
  dock: HTMLElement;
  floating: HTMLElement;
  labels: SoftKeyboardDeps["labels"] & { hide: string; prevPage: string; nextPage: string; toggleMode: string };
  /** 软键盘现在该不该露（设置 + 设备 + 有没有见过实体键盘，app 说了算）。 */
  keyboardWanted(): boolean;
  /** 用户按了「收起键盘」。 */
  onHideRequest(): void;
  /** 那一块的高度变了（露 / 收 / 换布局）：纸面要重算。 */
  onLayout(): void;
}
export interface ImeDock {
  render(): void;
  /** 预热（v2.1.24，user「启动打第一个字的时候会卡」）：把候选条用几个样例候选不可见地画一次，逼浏览器先做样式计算和汉字字形整形——
   *  量过：首键 20–30 ms、后续 7 ms，差额全在主线程首次画候选条（worker 那边只要 1 ms）；预热后首键 = 后续键。空闲时调，正在组字就不动。 */
  warmUp(): void;
  /** 软键盘此刻露着吗。 */
  keyboardShown(): boolean;
  /** 中 / 英 切换了：PC 式悬浮条空着也闪一下芯片（v2.1.26，顶栏不再有「中 / 英」一字；软键盘露着时键盘自己的中 / 英键就是状态，不闪）。 */
  flashMode(): void;
  keyboard: ReturnType<typeof createSoftKeyboard>;
}

const esc = (x: string): string => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export function createImeDock(d: ImeDockDeps): ImeDock {
  const { ime, pipeline } = d;
  const keyboard = createSoftKeyboard({ labels: d.labels, onKey: (k) => { void pipeline.press(k); }, onLiteral: (t) => { void pipeline.literal(t); }, onToggleMode: () => { void pipeline.toggleMode(); }, onHide: () => { d.onHideRequest(); render(); } });
  // 手机式那一块（v2.1.24）：候选条只有候选那一行——拼音不显示（user 2026-09-29「候选词框能不能矮一点，拼音放别的地方，或者干脆不显示？」），
  //   「收起键盘」搬进键盘最下一排（原来在候选条右侧占一列 46px，候选词少一格）。PC 式悬浮条照旧带拼音行。
  d.dock.innerHTML = `<div class="ime-strip"><div class="ime-cands" role="listbox"></div></div>`;
  d.dock.appendChild(keyboard.el);
  const cands = d.dock.querySelector<HTMLElement>(".ime-cands")!;
  // PC 式悬浮条（v2.1.26）：左端一枚「中 / 英」芯片（原顶栏那一字搬来；user 2026-09-30「输入法也许可以收到悬浮框里面」），点 = 切中 / 英；右边拼音行 + 候选行。
  d.floating.innerHTML = `<span class="ime-mode" role="button"></span><div class="ime-preedit" aria-hidden="true"></div><div class="ime-cands" role="listbox"></div>`;
  const fMode = d.floating.querySelector<HTMLElement>(".ime-mode")!, fPreedit = d.floating.querySelector<HTMLElement>(".ime-preedit")!, fCands = d.floating.querySelector<HTMLElement>(".ime-cands")!;
  const MODE_FLASH_MS = 1100;
  let modeFlashUntil = 0;

  let shown = false, hideTimer: ReturnType<typeof setTimeout> | null = null, lingerUntil = 0, lastBuffer = "", lastPage = -1;
  const form = (): KeyboardForm => (Math.min(window.innerWidth, window.innerHeight) >= 600 && window.innerWidth >= 700 ? "tablet" : "phone");

  function candHtml(s: ReturnType<NaturalCodeIME["getState"]>, withIndex: boolean): string {
    const chips = s.candidates.slice(0, 9).map((w, i) => `<span class="cand${i === 0 && s.page === 0 ? " first" : ""}" role="option" data-i="${i}">${withIndex ? `<span class="index">${i + 1}</span>` : ""}${esc(w)}</span>`);
    if (s.page > 0) chips.unshift(`<span class="cand nav" data-nav="prev" role="button" aria-label="${esc(d.labels.prevPage)}">${iconHtml("chevron-left", { cls: "ico" })}</span>`);
    if (s.hasMore) chips.push(`<span class="cand nav" data-nav="next" role="button" aria-label="${esc(d.labels.nextPage)}">${iconHtml("chevron-right", { cls: "ico" })}</span>`);
    return chips.join("");
  }
  function setLayoutVar(): void {
    const h = shown ? Math.round(d.dock.getBoundingClientRect().height) : 0;
    const prev = document.documentElement.style.getPropertyValue("--dock-h");
    if (prev !== `${h}px`) { document.documentElement.style.setProperty("--dock-h", `${h}px`); d.onLayout(); }
  }
  function setShown(v: boolean): void {
    if (shown === v) return;
    shown = v;
    d.dock.classList.toggle("hidden", !v); d.dock.setAttribute("aria-hidden", v ? "false" : "true");
    document.body.classList.toggle("ime-docked", v);
    if (!v) keyboard.reset();
    setLayoutVar();
  }
  function render(): void {
    const s = ime.getState();
    const field = pipeline.focused();
    const masked = !!field && isMasked(field);
    const want = !!field && s.enabled && d.keyboardWanted();
    if (want) { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } setShown(true); }
    else if (shown && !hideTimer) hideTimer = setTimeout(() => { hideTimer = null; if (!(pipeline.focused() && ime.getState().enabled && d.keyboardWanted())) setShown(false); renderFloating(); }, HIDE_DELAY_MS);
    const composing = s.enabled && !!s.buffer && !!field && !masked;
    if (shown) {
      keyboard.setForm(form()); keyboard.setMasked(masked); keyboard.setMode(s.asciiMode ? "en" : "zh");
      cands.innerHTML = composing ? candHtml(s, false) : "";
      if (s.buffer !== lastBuffer || s.page !== lastPage) cands.scrollLeft = 0;   // 每次换了拼音 / 翻了页都从头看：首选永远在最左
      setLayoutVar();
    }
    lastBuffer = s.buffer; lastPage = s.page;
    renderFloating();
  }
  function renderFloating(): void {
    const s = ime.getState();
    const field = pipeline.focused();
    const composing = s.enabled && !!s.buffer && !!field && !isMasked(field);
    const flashing = Date.now() < modeFlashUntil;
    if (shown || (!composing && !flashing && Date.now() >= lingerUntil)) { d.floating.classList.add("hidden"); fPreedit.textContent = ""; fCands.innerHTML = ""; return; }
    d.floating.classList.remove("hidden");
    d.floating.classList.toggle("lingering", !composing && !flashing);
    fMode.textContent = s.asciiMode ? d.labels.en : d.labels.zh; fMode.dataset.mode = s.asciiMode ? "en" : "zh"; fMode.title = d.labels.toggleMode;
    fPreedit.textContent = composing ? s.buffer : "";
    fPreedit.scrollLeft = fPreedit.scrollWidth;
    fCands.innerHTML = composing ? candHtml(s, true) : "";
    fCands.scrollLeft = 0;
  }

  // ── 点候选：一律 click 才算数（见文件头「光标乱跑案」）；mousedown 拦住别抢焦点；候选行要能横向拖，所以不拦 touchstart ──
  function onCandClick(e: MouseEvent, floating: boolean): void {
    const chip = (e.target as HTMLElement).closest<HTMLElement>(".cand"); if (!chip) return;
    e.preventDefault();
    if (chip.dataset.nav) { void pipeline.page(chip.dataset.nav === "prev"); return; }
    if (floating) { lingerUntil = Date.now() + FLOAT_LINGER_MS; setTimeout(renderFloating, FLOAT_LINGER_MS + 20); }
    void pipeline.pick(Number(chip.dataset.i));
  }
  for (const [box, floating] of [[d.dock, false], [d.floating, true]] as const) {
    box.addEventListener("mousedown", (e) => e.preventDefault());
    box.addEventListener("contextmenu", (e) => e.preventDefault());
    box.addEventListener("click", (e) => onCandClick(e as MouseEvent, floating));
  }
  fPreedit.addEventListener("click", () => { void pipeline.pick(-1); });
  fMode.addEventListener("click", () => { void pipeline.toggleMode(); });
  function flashMode(): void {
    if (shown) return;
    modeFlashUntil = Date.now() + MODE_FLASH_MS;
    renderFloating(); setTimeout(renderFloating, MODE_FLASH_MS + 20);
  }

  document.addEventListener("focusin", () => render());
  document.addEventListener("focusout", () => { setTimeout(render, 0); });   // focusout 时 activeElement 还没换，下一拍再看
  window.addEventListener("resize", () => { if (shown) { keyboard.setForm(form()); setLayoutVar(); } });
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => setLayoutVar()).observe(d.dock);

  function warmUp(): void {
    if (ime.getState().buffer || !d.floating.classList.contains("hidden")) return;   // 正在用就别碰
    const sample = { buffer: "ni hao", candidates: [String.fromCharCode(0x4f60, 0x597d), String.fromCharCode(0x62df, 0x597d), String.fromCharCode(0x5c3c, 0x597d)], page: 0, hasMore: true, engine: "", enabled: true, asciiMode: false, initializeError: null } as ReturnType<NaturalCodeIME["getState"]>;
    d.floating.style.visibility = "hidden";
    d.floating.classList.remove("hidden");
    fPreedit.textContent = sample.buffer; fCands.innerHTML = candHtml(sample, true);
    void d.floating.offsetHeight;   // 逼一次布局：样式计算 + 字形整形都在这一下发生
    d.floating.classList.add("hidden"); d.floating.style.visibility = "";
    fPreedit.textContent = ""; fCands.innerHTML = "";
    if (shown) { cands.innerHTML = candHtml(sample, false); void cands.offsetHeight; cands.innerHTML = ""; }   // 手机式那一块露着时，它的候选行也过一遍（同一帧内清掉，看不见）
  }
  return { render, keyboardShown: () => shown, keyboard, warmUp, flashMode };
}
