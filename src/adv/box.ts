// 对话框模式（ADV）的框：正文里「当前这一段」的一扇窗。created 20261025 by Claude Opus 5.5
//   user 2026-10-25「aha就是galgame/adv」「对话框的话的单位不是行，而是段」「一次写一段。写多长就可以。回车就发，自动变成\n\n，然后左右箭头（也许不能用键盘的左右键）导航」
//   「发出去的段还能不能在框里改 当然能，家族规矩，不强制纪律用户」「adv的时候就三行，多了滚」；翻段键 = Ctrl+↑ / Ctrl+↓（user 选的）。
//   取代打字机模式（v2.3.59「只看几行」）：那个是把纸压矮、按「行」切；这个按「段」切，框里只有一段。
//
// 真相永远在正文框（editor）：落盘 / 推云 / 字数 / 撤销以外的一切都照旧听它的 input。框（input）里的字 = 正文 [start, start + shown.length) 那一截；
//   框里每改一次，算出改了哪一截（diffEdit），原样写回正文那个位置（text-edit replaceRange：正文框没焦点 → setRangeText + 补发 input）。
//   写回前先核对正文那一截还是不是框里上一版的字：对不上 = 正文被别处改过而框没跟上 → 不写，重取（宁丢框里这一下，不往错的位置写字）。
// 框就是一个普通的文本框，只是一次只露出一段（user 2026-10-26「不要shift回车，而是两下回车换页，所以这么说其实就是在输入文本？」）：
//   框里一出现分隔（d.split()：默认「一个换行」= 回车就是下一段；「空一行」= 连按两下回车才是下一段）= 分段 → 框换到光标所在的那一段。没有特殊键。
//   段首退格 = 删掉前面一个换行（同普通文本框：前面是空行就先删空行，再按一下才和上一段接起来）。
//   段首 ← / 段尾 →（Ctrl+← / Ctrl+→ 同，user「ctrl左右也能接」）跨到上一段末 / 下一段首；第一行 ↑ / 最后一行 ↓ 同理（user 2026-10-26「arrow keys上下应该也可以翻页，因为我发现左右能翻页」）；
//   Ctrl+↑ / Ctrl+↓ 上一段 / 下一段（光标在段首，框滚到顶：审稿按一下就过去）；Ctrl+Home / Ctrl+End 第一段 / 最后一段。
// 撤销只在这一段里：换段 = 程序改框的值，浏览器清掉框的撤销栈。故意的——留着的话 Ctrl+Z 会把上一段的字「撤」进这一段的位置。
// 别处改了正文（语音落字、规整标点、换页、重载）→ 宿主的 input / sync 让框从正文按正文的光标重取。语音从正文的光标起录，所以起录前要 pushCaret。
import { replaceRange } from "../text-edit.ts";
import { paragraphs, paraIndexAt, diffEdit, hasSplit, type Split, type Para } from "./paragraphs.ts";

export interface AdvBoxDeps {
  /** 正文框：唯一的真相。 */
  editor: HTMLTextAreaElement;
  /** 对话框里那个框。 */
  input: HTMLTextAreaElement;
  /** 现在能不能改正文（锁 / 只读 / 世界线守卫；= app 的 canEditNow）。 */
  canEdit(): boolean;
  /** 当前页 / 稿的身份：变了 = 换页，从正文的光标（开页落在开头）重取。 */
  pageKey(): string;
  /** 怎么分段（设置「逐段怎么分段」：一个换行 / 空一行）。随时读：改了设置宿主调 sync()。 */
  split(): Split;
  /** 第几段 / 共几段变了（画 ‹ › 的可点状态）。 */
  onPosition?(index: number, count: number): void;
  /** 光标所在的那一行（框里按换行切的一行；段首那一行带上收起来的标记）可能变了：宿主拿去认说话人、画名字牌（v3.0.5）。 */
  onLine?(line: string): void;
  /** 段首那一行开头有几个字是说话人标记（收进名字牌、不进框；v3.0.6，user「小月：  不进文本框啊」）。没有 / 不收 = 0。 */
  tagLength?(firstLine: string): number;
}

export interface AdvBox {
  readonly active: boolean;
  /** 开 / 关这扇窗。开 = 落在正文光标所在的那一段（user 2026-10-26「切换框的时候应该根据光标的位置，而不是跳到最后」）。 */
  setActive(on: boolean): void;
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
  let start = 0;          // 框里的字在正文里的起点 = 段首 + 收起来的标记（hidden 个字）
  let hidden = 0;         // 段首收进名字牌、不进框的那几个字（说话人标记）
  let shown = "";         // 框里上一版的字（= 正文 [start, start + shown.length)）
  let key = "";
  let splicing = false;   // 自己在写回正文：正文的 input 别当成「别处改了」
  let pos = { index: 0, count: 1 };

  function report(index: number, count: number): void {
    if (index === pos.index && count === pos.count) return;
    pos = { index, count };
    d.onPosition?.(index, count);
  }
  /** 一段开头收起来几个字（段首那一行的说话人标记）。 */
  function tagOf(text: string, p: Para): number {
    if (!d.tagLength) return 0;
    const nl = text.indexOf("\n", p.start), lineEnd = nl < 0 || nl > p.end ? p.end : nl;
    return Math.max(0, Math.min(d.tagLength(text.slice(p.start, lineEnd)), lineEnd - p.start));
  }
  /** 从正文取第 index 段进框；caret = 框里的光标（"start" / "end" / { doc } = 正文里的位置）。 */
  function load(index: number, caret: "start" | "end" | { doc: number }): void {
    const text = ed.value, ps = paragraphs(text, d.split());
    const i = Math.max(0, Math.min(index, ps.length - 1)), p = ps[i]!;
    hidden = tagOf(text, p); start = p.start + hidden; shown = text.slice(start, p.end);
    if (box.value !== shown) box.value = shown;   // 程序改值 = 清框的撤销栈（见文件头）
    const at = caret === "start" ? 0 : caret === "end" ? shown.length : Math.max(0, Math.min(caret.doc - start, shown.length));
    try { box.setSelectionRange(at, at); } catch { /* ignore */ }
    if (caret === "start") box.scrollTop = 0; else if (caret === "end") box.scrollTop = box.scrollHeight;
    pushCaret();
    report(i, ps.length);
  }
  /** 从正文的某个位置取它所在的那一段，光标放在对应位置。 */
  function loadAt(docPos: number): void {
    const ps = paragraphs(ed.value, d.split());
    load(paraIndexAt(ps, docPos), { doc: docPos });
  }
  /** 光标那一行报给宿主（名字牌）。 */
  function reportLine(): void {
    if (!active || !d.onLine) return;
    const v = box.value, at = box.selectionStart ?? v.length;
    const from = v.lastIndexOf("\n", at - 1) + 1, to = v.indexOf("\n", at);
    const tag = from === 0 ? ed.value.slice(start - hidden, start) : "";   // 段首那一行：把收起来的标记接回去再认
    d.onLine(tag + v.slice(from, to < 0 ? v.length : to));
  }
  /** 选区原样写回（不只光标）：规整标点「有选区只改选区」看的是正文的选区。 */
  function pushCaret(): void {
    if (!active) return;
    reportLine();
    const s = start + (box.selectionStart ?? shown.length), e = start + (box.selectionEnd ?? box.selectionStart ?? shown.length);
    try { ed.setSelectionRange(s, Math.max(s, e)); } catch { /* ignore */ }
  }
  /** 按现在的分法，框里这一截正好是一整段吗。 */
  function wholeParagraph(): boolean {
    const text = ed.value, ps = paragraphs(text, d.split()), p = ps[paraIndexAt(ps, start)]!;
    return p.start + tagOf(text, p) === start && p.end === start + shown.length;
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
    splicing = true;
    try { replaceRange(ed, start + edit.at, start + edit.at + edit.del, edit.ins); } finally { splicing = false; }
    const docCaret = start + (box.selectionStart ?? now.length);
    if (hasSplit(now, d.split())) { loadAt(docCaret); return; }   // 框里出现了分隔 = 分段了：框换到光标所在的那一段
    shown = now;
    try { ed.setSelectionRange(docCaret, docCaret); } catch { /* ignore */ }
    // 段首那一行的标记变了（刚打完「小月：」/ 退格吃掉了冒号）→ 重取：标记收进名字牌或放回框里。只看这一行，不扫全文（打字热路径）
    if (d.tagLength) {
      const ps0 = start - hidden, nl = ed.value.indexOf("\n", ps0), le = nl < 0 ? ed.value.length : nl;
      if (tagOf(ed.value, { start: ps0, end: Math.max(le, ps0) }) !== hidden) { loadAt(docCaret); return; }
    }
    reportLine();
  });

  /** 段首退格：删掉前面一个换行（分隔是两个换行时 = 两段接成一段，接缝处留一个段内换行）。 */
  function backspaceAtStart(): boolean {
    if (!d.canEdit() || start <= 0) return false;
    splicing = true;
    try { replaceRange(ed, start - 1, start, ""); } finally { splicing = false; }
    loadAt(start - 1);
    return true;
  }
  function go(delta: -1 | 1, caret: "start" | "end"): boolean {
    const ps = paragraphs(ed.value, d.split()), i = paraIndexAt(ps, start) + delta;
    if (i < 0 || i >= ps.length) return false;
    load(i, caret);
    return true;
  }
  // 光标在框里第几行（折行算）：一个看不见的镜像只量这一段（短，不碰正文的孪生框）。框搬进小窗时镜像跟着建在小窗的 document 里。
  let mirror: HTMLDivElement | null = null;
  function caretRow(): { row: number; rows: number } {
    const doc = box.ownerDocument, cs = doc.defaultView!.getComputedStyle(box);
    if (!mirror || mirror.ownerDocument !== doc || !mirror.isConnected) { mirror = doc.createElement("div"); mirror.setAttribute("aria-hidden", "true"); doc.body.appendChild(mirror); }
    const m = mirror;
    Object.assign(m.style, { position: "absolute", left: "-99999px", top: "0", visibility: "hidden", pointerEvents: "none", whiteSpace: "pre-wrap", overflowWrap: "break-word", wordBreak: cs.wordBreak, boxSizing: "content-box", width: `${box.clientWidth}px`, padding: "0", border: "0", font: cs.font, letterSpacing: cs.letterSpacing, lineHeight: cs.lineHeight, tabSize: cs.tabSize });
    const at = box.selectionStart ?? 0, lh = parseFloat(cs.lineHeight) || 1;
    m.textContent = box.value.slice(0, at);
    const mark = doc.createElement("span"); mark.textContent = "\u200b"; m.appendChild(mark);
    m.appendChild(doc.createTextNode(box.value.slice(at) + "\u200b"));   // 末尾的换行在 div 里不占一行、在框里占：补一个零宽字
    return { row: Math.floor(mark.offsetTop / lh + 0.01), rows: Math.max(1, Math.round(m.scrollHeight / lh)) };
  }
  box.addEventListener("keydown", (e) => {
    if (!active || e.defaultPrevented || e.isComposing) return;   // 输入法吃掉的键（组字中的回车 / 方向键）在捕获阶段就 preventDefault 了
    const s = box.selectionStart ?? 0, collapsed = s === (box.selectionEnd ?? s);
    const plain = !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
    const ctrlOnly = e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
    let handled = false;
    if (plain && collapsed && s === 0 && e.key === "Backspace") handled = backspaceAtStart();
    else if (plain && collapsed && s === 0 && e.key === "ArrowLeft") handled = go(-1, "end");
    else if (plain && collapsed && s === box.value.length && e.key === "ArrowRight") handled = go(1, "start");
    else if (ctrlOnly && collapsed && s === 0 && e.key === "ArrowLeft") handled = go(-1, "end");   // Ctrl+← / Ctrl+→：段里照常按词跳，到头了接上一段 / 下一段
    else if (ctrlOnly && collapsed && s === box.value.length && e.key === "ArrowRight") handled = go(1, "start");
    else if (plain && collapsed && e.key === "ArrowUp" && caretRow().row === 0) handled = go(-1, "end");
    else if (plain && collapsed && e.key === "ArrowDown") { const r = caretRow(); if (r.row >= r.rows - 1) handled = go(1, "start"); }
    else if (ctrlOnly && e.key === "ArrowUp") { go(-1, "start"); handled = true; }
    else if (ctrlOnly && e.key === "ArrowDown") { go(1, "start"); handled = true; }
    else if (ctrlOnly && e.key === "Home") { load(0, "start"); handled = true; }
    else if (ctrlOnly && e.key === "End") { load(paragraphs(ed.value, d.split()).length - 1, "end"); handled = true; }
    if (handled) e.preventDefault();
  });
  // app 软键盘的退格在段首什么都删不掉，field.ts 会在框上发这个事件（实体键盘走上面的 keydown）
  box.addEventListener("backspaceatstart", () => { if (active) backspaceAtStart(); });
  for (const t of ["keyup", "pointerup", "select", "blur"]) box.addEventListener(t, pushCaret);
  // 别处改了正文（语音、规整标点、重载）→ 按正文的光标重取
  ed.addEventListener("input", () => { if (active && !splicing) loadAt(ed.selectionStart ?? 0); });

  return {
    get active() { return active; },
    setActive(on) {
      if (on === active) { if (on) sync(); return; }
      if (!on) { pushCaret(); active = false; return; }
      active = true; key = d.pageKey();
      box.readOnly = ed.readOnly;
      loadAt(ed.selectionStart ?? 0);
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
    // 对不上 / 正文的光标被别处挪出了这一段（检索跳转、点了子节）/ 按现在的分法这一截已经不是正好一整段（设置里改了分法）→ 跟着正文的光标走
    if (!inSync() || box.value !== shown || c < start || c > start + shown.length || !wholeParagraph()) loadAt(c);
  }
}
