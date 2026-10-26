// 对话框模式（ADV）的框：正文里「当前这一段」的一扇窗。created 20261025 by Claude Opus 5.5
//   user 2026-10-25「aha就是galgame/adv」「对话框的话的单位不是行，而是段」「一次写一段。写多长就可以。回车就发，自动变成\n\n，然后左右箭头（也许不能用键盘的左右键）导航」
//   「发出去的段还能不能在框里改 当然能，家族规矩，不强制纪律用户」「adv的时候就三行，多了滚」；翻段键 = Ctrl+↑ / Ctrl+↓（user 选的）。
//   取代打字机模式（v2.3.59「只看几行」）：那个是把纸压矮、按「行」切；这个按「段」切，框里只有一段。
//
// 真相永远在正文框（editor）：落盘 / 推云 / 字数 / 撤销以外的一切都照旧听它的 input。框（input）里的字 = 正文 [start, start + shown.length) 那一截；
//   框里每改一次，算出改了哪一截（diffEdit），原样写回正文那个位置（text-edit replaceRange：正文框没焦点 → setRangeText + 补发 input）。
//   写回前先核对正文那一截还是不是框里上一版的字：对不上 = 正文被别处改过而框没跟上 → 不写，重取（宁丢框里这一下，不往错的位置写字）。
// 回车（实体键盘 / app 软键盘 / 系统键盘都一样，框里出现一个换行）= 发出去：写回正文时换成两个换行，框换到下一段（光标后面的字跟着去下一段）。
//   Shift+Enter = 段内换行（一个换行，不发）。段首退格 = 和上一段接回去（删掉中间的分隔 = 回车的反操作）。
//   段首 ← / 段尾 → 跨到上一段末 / 下一段首；Ctrl+↑ / Ctrl+↓ 上一段 / 下一段（光标在段首，框滚到顶：审稿按一下就过去）；Ctrl+Home / Ctrl+End 第一段 / 最后一段。
// 撤销只在这一段里：换段 = 程序改框的值，浏览器清掉框的撤销栈。故意的——留着的话 Ctrl+Z 会把上一段的字「撤」进这一段的位置。
// 别处改了正文（语音落字、规整标点、换页、重载）→ 宿主的 input / sync 让框从正文按正文的光标重取。语音从正文的光标起录，所以起录前要 pushCaret。
import { replaceRange } from "../text-edit.ts";
import { paragraphs, paraIndexAt, diffEdit } from "./paragraphs.ts";

export interface AdvBoxDeps {
  /** 正文框：唯一的真相。 */
  editor: HTMLTextAreaElement;
  /** 对话框里那个框。 */
  input: HTMLTextAreaElement;
  /** 现在能不能改正文（锁 / 只读 / 世界线守卫；= app 的 canEditNow）。 */
  canEdit(): boolean;
  /** 当前页 / 稿的身份：变了 = 换页，从正文的光标（开页落在开头）重取。 */
  pageKey(): string;
  /** 第几段 / 共几段变了（画 ‹ › 的可点状态）。 */
  onPosition?(index: number, count: number): void;
}

export interface AdvBox {
  readonly active: boolean;
  /** 开 / 关这扇窗。toEnd = 开的时候跳到最后一段末尾（同打字机模式「开了跳最后一行」，user 2026-10-24）；否则在正文光标所在的那一段。 */
  setActive(on: boolean, opts?: { toEnd?: boolean }): void;
  /** 宿主重画时调（换页 / 换稿 / 锁变了）：页变了 = 从正文的光标重取；没变但框和正文对不上 = 重取；对得上 = 不动（不清撤销栈）。 */
  sync(): void;
  /** 框里的光标写回正文（语音起录前、离开模式前；平时每次改字 / 抬键 / 点击也写）。 */
  pushCaret(): void;
  prev(): void;
  next(): void;
  focus(): void;
  position(): { index: number; count: number };
}

export function createAdvBox(d: AdvBoxDeps): AdvBox {
  const ed = d.editor, box = d.input;
  let active = false;
  let start = 0;          // 这一段在正文里的起点
  let shown = "";         // 框里上一版的字（= 正文 [start, start + shown.length)）
  let key = "";
  let softBreak = false;  // 刚按的是 Shift+Enter：下一个换行留在段里
  let splicing = false;   // 自己在写回正文：正文的 input 别当成「别处改了」
  let pos = { index: 0, count: 1 };

  function report(index: number, count: number): void {
    if (index === pos.index && count === pos.count) return;
    pos = { index, count };
    d.onPosition?.(index, count);
  }
  /** 从正文取第 index 段进框；caret = 框里的光标（"start" / "end" / 数字 = 段内偏移）。 */
  function load(index: number, caret: "start" | "end" | number): void {
    const text = ed.value, ps = paragraphs(text);
    const i = Math.max(0, Math.min(index, ps.length - 1)), p = ps[i]!;
    start = p.start; shown = text.slice(p.start, p.end);
    if (box.value !== shown) box.value = shown;   // 程序改值 = 清框的撤销栈（见文件头）
    const at = caret === "start" ? 0 : caret === "end" ? shown.length : Math.max(0, Math.min(caret, shown.length));
    try { box.setSelectionRange(at, at); } catch { /* ignore */ }
    box.scrollTop = caret === "start" ? 0 : caret === "end" ? box.scrollHeight : box.scrollTop;
    pushCaret();
    report(i, ps.length);
  }
  /** 从正文的某个位置取它所在的那一段，光标放在对应位置。 */
  function loadAt(docPos: number): void {
    const ps = paragraphs(ed.value), i = paraIndexAt(ps, docPos), p = ps[i]!;
    load(i, Math.max(0, docPos - p.start));
  }
  /** 选区原样写回（不只光标）：规整标点「有选区只改选区」看的是正文的选区。 */
  function pushCaret(): void {
    if (!active) return;
    const s = start + (box.selectionStart ?? shown.length), e = start + (box.selectionEnd ?? box.selectionStart ?? shown.length);
    try { ed.setSelectionRange(s, Math.max(s, e)); } catch { /* ignore */ }
  }
  /** 框和正文还对得上吗（正文那一截还是框里上一版的字）。 */
  const inSync = (): boolean => ed.value.length >= start + shown.length && ed.value.slice(start, start + shown.length) === shown;

  box.addEventListener("input", () => {
    if (!active) return;
    const now = box.value;
    const edit = diffEdit(shown, now);
    if (!edit) return;
    if (!inSync()) { console.warn("[adv] page text moved under the box; reloading the paragraph"); loadAt(ed.selectionStart ?? 0); return; }
    if (!d.canEdit()) { box.value = shown; return; }   // 框跟着正文的 readOnly，一般到不了这里；兜底：不写，框退回去
    let ins = edit.ins;
    const send = ins === "\n" && edit.del === 0 && !softBreak;   // 回车 = 发出去
    softBreak = false;
    if (send) ins = "\n\n";
    splicing = true;
    try { replaceRange(ed, start + edit.at, start + edit.at + edit.del, ins); } finally { splicing = false; }
    const docCaret = start + (box.selectionStart ?? now.length) + (ins.length - edit.ins.length);
    if (ins.includes("\n\n")) { loadAt(docCaret); return; }   // 发出去了 / 贴进来好几段：框换到光标所在的那一段
    shown = now;
    try { ed.setSelectionRange(docCaret, docCaret); } catch { /* ignore */ }
  });

  /** 段首退格：和上一段接回去（删掉两段之间的分隔）。 */
  function joinBackward(): boolean {
    if (!d.canEdit()) return false;
    const ps = paragraphs(ed.value), i = paraIndexAt(ps, start);
    if (i <= 0) return false;
    const prev = ps[i - 1]!, cur = ps[i]!;
    splicing = true;
    try { replaceRange(ed, prev.end, cur.start, ""); } finally { splicing = false; }
    loadAt(prev.end);
    return true;
  }
  function go(delta: -1 | 1, caret: "start" | "end"): boolean {
    const ps = paragraphs(ed.value), i = paraIndexAt(ps, start) + delta;
    if (i < 0 || i >= ps.length) return false;
    load(i, caret);
    return true;
  }
  box.addEventListener("keydown", (e) => {
    if (!active || e.defaultPrevented || e.isComposing) return;   // 输入法吃掉的键（组字中的回车 / 方向键）在捕获阶段就 preventDefault 了
    const s = box.selectionStart ?? 0, collapsed = s === (box.selectionEnd ?? s);
    const plain = !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
    const ctrlOnly = e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
    if (e.key === "Enter") { softBreak = e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey; return; }
    let handled = false;
    if (plain && collapsed && s === 0 && e.key === "Backspace") handled = joinBackward();
    else if (plain && collapsed && s === 0 && e.key === "ArrowLeft") handled = go(-1, "end");
    else if (plain && collapsed && s === box.value.length && e.key === "ArrowRight") handled = go(1, "start");
    else if (ctrlOnly && e.key === "ArrowUp") { go(-1, "start"); handled = true; }
    else if (ctrlOnly && e.key === "ArrowDown") { go(1, "start"); handled = true; }
    else if (ctrlOnly && e.key === "Home") { load(0, "start"); handled = true; }
    else if (ctrlOnly && e.key === "End") { load(paragraphs(ed.value).length - 1, "end"); handled = true; }
    if (handled) e.preventDefault();
  });
  // app 软键盘的退格在段首什么都删不掉，field.ts 会在框上发这个事件（实体键盘走上面的 keydown）
  box.addEventListener("backspaceatstart", () => { if (active) joinBackward(); });
  for (const t of ["keyup", "pointerup", "select", "blur"]) box.addEventListener(t, pushCaret);
  // 别处改了正文（语音、规整标点、重载）→ 按正文的光标重取
  ed.addEventListener("input", () => { if (active && !splicing) loadAt(ed.selectionStart ?? 0); });

  return {
    get active() { return active; },
    setActive(on, opts) {
      if (on === active) { if (on) sync(); return; }
      if (!on) { pushCaret(); active = false; return; }
      active = true; key = d.pageKey(); softBreak = false;
      box.readOnly = ed.readOnly;
      if (opts?.toEnd) load(paragraphs(ed.value).length - 1, "end");
      else loadAt(ed.selectionStart ?? 0);
    },
    sync,
    pushCaret,
    prev: () => { go(-1, "start"); },
    next: () => { go(1, "start"); },
    focus: () => { box.focus({ preventScroll: true }); },
    position: () => pos,
  };
  function sync(): void {
    if (!active) return;
    box.readOnly = ed.readOnly;
    const k = d.pageKey();
    if (k !== key) { key = k; loadAt(ed.selectionStart ?? 0); return; }
    const c = ed.selectionStart ?? start;
    // 对不上 / 正文的光标被别处挪出了这一段（检索跳转、点了子节）→ 跟着正文的光标走
    if (!inSync() || box.value !== shown || c < start || c > start + shown.length) loadAt(c);
  }
}
