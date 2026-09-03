// in-app 模态原语：busy 遮罩 / 确认 / 输入 / 多选 / sync gate。守家规「禁系统 alert/prompt/confirm」（Quest 沉浸态弹不出）。
// created 2026-09-03 by Claude Fable 5.1（WeebPaint sheets.ts + fullscreen-busy.ts 塌成一个文件；纯 DOM，自持元素引用）。
//
// busy/sheet 互斥护栏（WeebPaint 2026-06-12 死锁修复）：busy 遮罩盖住输入框 → await 永不 resolve。
//   → 交互输入必须在 withBusy 之外；这里对 confirm/input/choice **响亮 throw**。gate 不受此限（自带 spinner，与 busy 协同）。

const $ = (id: string) => document.getElementById(id) as HTMLElement;

// ── busy 遮罩（可重入 ref-count；store 深模块内部也会嵌套调 busy）──
let _busyDepth = 0;
export function showBusy(label: string, hint = ""): void {
  $("busyOverlay").classList.remove("hidden");
  $("busyOverlayText").textContent = label;
  $("busyOverlayHint").textContent = hint;
}
export function hideBusy(): void { $("busyOverlay").classList.add("hidden"); }
export function isBusyActive(): boolean { return !$("busyOverlay").classList.contains("hidden"); }
export async function withBusy<T>(label: string, fn: () => Promise<T> | T, hint = ""): Promise<T> {
  _busyDepth++;
  showBusy(label, hint);
  try { return await fn(); }
  finally { _busyDepth--; if (_busyDepth <= 0) { _busyDepth = 0; hideBusy(); } }
}

function _assertNotBusy(what: string): void {
  if (isBusyActive()) throw new Error(`sheet "${what}" opened while busy overlay is active (would deadlock) — move the interaction outside withBusy`);
}

// ── 通用 sheet（#sheet：title / message / input / choices / confirm / cancel）──
const g = {
  sheet: () => $("sheet"),      // 全屏容器（.crypto-modal 自带 dim 背景）；点容器空白处 = 取消
  title: () => $("sheetTitle"),
  message: () => $("sheetMessage"),
  input: () => $("sheetInput") as HTMLInputElement,
  input2: () => $("sheetInput2") as HTMLInputElement,
  error: () => $("sheetError"),
  choices: () => $("sheetChoices"),
  confirm: () => $("sheetConfirm") as HTMLButtonElement,
  cancel: () => $("sheetCancel") as HTMLButtonElement,
};
let _open: (() => void) | null = null;   // 当前 sheet 的 cancel 路径（backdrop / Escape 用）

function _show(): void { g.sheet().classList.remove("hidden"); }
function _hide(): void {
  g.sheet().classList.add("hidden");
  if (document.activeElement instanceof HTMLElement && g.sheet().contains(document.activeElement)) document.activeElement.blur();
  _open = null;
}
function _reset(): void {
  g.message().classList.add("hidden"); g.message().classList.remove("warning");
  g.input().classList.add("hidden"); g.input2().classList.add("hidden");
  g.error().classList.add("hidden"); g.error().textContent = "";
  g.choices().classList.add("hidden"); g.choices().innerHTML = "";
  g.confirm().classList.remove("hidden", "danger"); g.cancel().classList.remove("hidden");
  g.input().value = ""; g.input2().value = "";
  g.input().style.setProperty("-webkit-text-security", ""); g.input2().style.setProperty("-webkit-text-security", "");
}
export function initSheets(labels: { ok: string; cancel: string }): void {
  g.confirm().textContent = labels.ok;
  g.cancel().textContent = labels.cancel;
  g.sheet().addEventListener("click", (e) => { if (e.target === g.sheet()) _open?.(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && _open && !e.defaultPrevented) { e.preventDefault(); _open(); }
  }, true);
}

export interface ConfirmOpts { danger?: boolean; okLabel?: string; cancelLabel?: string; warning?: boolean }
export function openConfirmSheet(title: string, message: string, opts: ConfirmOpts = {}): Promise<boolean> {
  _assertNotBusy("confirm");
  return new Promise((resolve) => {
    _reset();
    g.title().textContent = title;
    g.message().textContent = message; g.message().classList.remove("hidden");
    g.message().classList.toggle("warning", !!opts.warning);
    const okDefault = g.confirm().textContent, cancelDefault = g.cancel().textContent;
    if (opts.okLabel) g.confirm().textContent = opts.okLabel;
    if (opts.cancelLabel) g.cancel().textContent = opts.cancelLabel;
    g.confirm().classList.toggle("danger", !!opts.danger);
    const done = (v: boolean) => {
      g.confirm().removeEventListener("click", onOk); g.cancel().removeEventListener("click", onCancel);
      g.confirm().textContent = okDefault; g.cancel().textContent = cancelDefault;
      _hide(); resolve(v);
    };
    const onOk = () => done(true), onCancel = () => done(false);
    g.confirm().addEventListener("click", onOk); g.cancel().addEventListener("click", onCancel);
    _open = onCancel;
    _show();
    setTimeout(() => g.confirm().focus(), 0);
  });
}

export interface InputOpts {
  message?: string; placeholder?: string; password?: boolean; defaultValue?: string; okLabel?: string;
  /** 密码二次确认（首次设密码）。 */
  confirmField?: boolean;
  /** 同步校验：返回错误文案则不关 sheet（显示在 #sheetError）。 */
  validate?: (value: string, second: string) => string | null;
  /** 初始错误提示（上一轮密码错时重开）。 */
  error?: string;
}
/** 输入 sheet → string | null（取消）。密码态用 -webkit-text-security 打码（不用 type=password：绕开浏览器记密码弹窗——WeebPaint 教训）。 */
export function openInputSheet(title: string, opts: InputOpts = {}): Promise<string | null> {
  _assertNotBusy("input");
  return new Promise((resolve) => {
    _reset();
    g.title().textContent = title;
    if (opts.message) { g.message().textContent = opts.message; g.message().classList.remove("hidden"); }
    const inp = g.input(), inp2 = g.input2();
    inp.classList.remove("hidden");
    inp.type = "text"; inp.autocomplete = "off"; inp.placeholder = opts.placeholder ?? ""; inp.value = opts.defaultValue ?? "";
    if (opts.password) { inp.style.setProperty("-webkit-text-security", "disc"); inp2.style.setProperty("-webkit-text-security", "disc"); }
    if (opts.confirmField) { inp2.classList.remove("hidden"); inp2.type = "text"; inp2.autocomplete = "off"; }
    if (opts.error) { g.error().textContent = opts.error; g.error().classList.remove("hidden"); }
    const okDefault = g.confirm().textContent;
    if (opts.okLabel) g.confirm().textContent = opts.okLabel;
    const cleanup = () => {
      g.confirm().removeEventListener("click", onOk); g.cancel().removeEventListener("click", onCancel);
      inp.removeEventListener("keydown", onKey); inp2.removeEventListener("keydown", onKey);
      g.confirm().textContent = okDefault;
      inp.value = ""; inp2.value = "";
    };
    const onOk = () => {
      const err = opts.validate?.(inp.value, inp2.value) ?? null;
      if (err) { g.error().textContent = err; g.error().classList.remove("hidden"); return; }
      const v = inp.value; cleanup(); _hide(); resolve(v);
    };
    const onCancel = () => { cleanup(); _hide(); resolve(null); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); if (opts.confirmField && e.target === inp) inp2.focus(); else onOk(); }
      else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
    };
    g.confirm().addEventListener("click", onOk); g.cancel().addEventListener("click", onCancel);
    inp.addEventListener("keydown", onKey); inp2.addEventListener("keydown", onKey);
    _open = onCancel;
    _show();
    setTimeout(() => { inp.focus(); inp.select(); }, 0);
  });
}

export interface Choice<T> { label: string; value: T; primary?: boolean; danger?: boolean }
export function openChoiceSheet<T>(title: string, message: string, choices: Choice<T>[]): Promise<T | null> {
  _assertNotBusy("choice");
  return new Promise((resolve) => {
    _reset();
    g.title().textContent = title;
    if (message) { g.message().textContent = message; g.message().classList.remove("hidden"); }
    const box = g.choices(); box.classList.remove("hidden");
    g.confirm().classList.add("hidden");
    const onCancel = () => { g.cancel().removeEventListener("click", onCancel); _hide(); resolve(null); };
    for (const c of choices) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sheet-choice" + (c.primary ? " primary" : "") + (c.danger ? " danger" : "");
      btn.textContent = c.label;
      btn.addEventListener("click", () => { g.cancel().removeEventListener("click", onCancel); _hide(); resolve(c.value); });
      box.appendChild(btn);
    }
    g.cancel().addEventListener("click", onCancel);
    _open = onCancel;
    _show();
  });
}

// ── sync gate（#gateSheet：锁屏 + 有限选项；冲突必 surface、不可 dismiss；允许穿透 busy）──
interface GateAction<T> { label: string; value: T; primary?: boolean }
interface GateOpts<T> { title: string; message: string; note?: string; showSpinner?: boolean; actions: GateAction<T>[] }
let _gatePending: ((v: unknown) => void) | null = null;
export function lockSyncGate<T = string>({ title, message, note, showSpinner, actions }: GateOpts<T>): Promise<T> {
  $("gateTitle").textContent = title;
  $("gateMessage").textContent = message;
  $("gateNote").textContent = note ?? ""; $("gateNote").classList.toggle("hidden", !note);
  $("gateSpinner").classList.toggle("hidden", !showSpinner);
  const box = $("gateActions"); box.innerHTML = "";
  return new Promise<T>((resolve) => {
    for (const a of actions) {
      const btn = document.createElement("button");
      btn.type = "button"; btn.textContent = a.label; if (a.primary) btn.classList.add("primary");
      btn.addEventListener("click", () => { unlockSyncGate(); resolve(a.value); });
      box.appendChild(btn);
    }
    $("gateSheet").classList.remove("hidden");
    _gatePending = resolve as (v: unknown) => void;
  });
}
export function unlockSyncGate(): void { $("gateSheet").classList.add("hidden"); _gatePending = null; }
export function settleSyncGate(value: unknown): void {
  if (_gatePending) { const r = _gatePending; unlockSyncGate(); r(value); }
}
