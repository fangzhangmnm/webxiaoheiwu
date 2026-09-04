// 弹出菜单深模块——「锚定 + 挂 body + z + 关闭纪律」一站式（抄 WeebPaint src/ui/popup-menu.ts 的「现建」半边；C1 家族组件，2026-09-03 对齐批）。
// created 2026-09-03 by Claude Fable 5.1
//   菜单节点挂 document.body（不被抽屉 overflow 裁、不困在容器 z 里），坐标走 anchored-popup。
//   关闭纪律：点外面关（capture 相）、Escape 关最上层、栈（开新的关掉所有不包含新锚的旧菜单）、resize 重定位、锚再点 = toggle。
import { positionPopup } from "./anchored-popup.ts";
import { iconHtml } from "./icon.ts";

export interface PopupMenuItem<Id extends string = string> {
  id: Id; label: string; icon?: string; hidden?: boolean; disabled?: boolean; danger?: boolean; separatorBefore?: boolean;
}
export interface PopupMenuOpts<Id extends string = string> {
  anchor: HTMLElement; align?: "left" | "right"; offsetY?: number; swallowOutsideTap?: boolean; onClose?: () => void; ariaLabel?: string;
  items: () => PopupMenuItem<Id>[];
  onPick: (id: Id, item: PopupMenuItem<Id>) => void | "keep";
}
export interface PopupMenuHandle { close(): void; refresh(): void; readonly isOpen: boolean; readonly el: HTMLElement; readonly anchor: HTMLElement }

const _open: PopupMenuHandle[] = [];
export function currentPopupMenu(): PopupMenuHandle | null { return _open[_open.length - 1] ?? null; }
export function closePopupMenu(): void { for (const h of [..._open]) h.close(); }
export function togglePopupMenu<Id extends string>(opts: PopupMenuOpts<Id>): PopupMenuHandle | null {
  const cur = _open.find((x) => x.anchor === opts.anchor);
  if (cur) { cur.close(); return null; }
  return openPopupMenu(opts);
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function openPopupMenu<Id extends string>(opts: PopupMenuOpts<Id>): PopupMenuHandle {
  const el = document.createElement("div");
  el.className = "menu-panel popup-menu";
  el.setAttribute("role", "menu");
  const render = () => {
    const items = opts.items().filter((it) => !it.hidden);
    const anyIcon = items.some((it) => !!it.icon);
    let html = "";
    for (const it of items) {
      if (it.separatorBefore) html += `<hr class="popup-menu-sep">`;
      const cls = "menu-item popup-menu-item" + (anyIcon ? " menu-item-with-icon" : "") + (it.danger ? " danger" : "");
      const icon = anyIcon ? (it.icon ? iconHtml(it.icon) : `<span class="menu-item-icon-blank"></span>`) : "";
      html += `<button type="button" class="${cls}" role="menuitem" data-id="${esc(it.id)}"${it.disabled ? " disabled" : ""}>${icon}<span class="menu-item-label">${esc(it.label)}</span></button>`;
    }
    el.innerHTML = html;
  };
  render();
  document.body.appendChild(el);
  // 栈纪律：关掉所有「不包含新锚」的旧菜单
  for (const h of [..._open]) if (!h.el.contains(opts.anchor)) h.close();
  if (opts.ariaLabel) el.setAttribute("aria-label", opts.ariaLabel);
  let open = true;
  const position = () => positionPopup(el, { anchor: opts.anchor, align: opts.align ?? "right", offsetY: opts.offsetY ?? 4, clampViewport: true });
  const onDocPointerDown = (e: PointerEvent) => {
    const path = e.composedPath();
    if (path.includes(el) || path.includes(opts.anchor)) return;
    handle.close();
    if (opts.swallowOutsideTap) { e.stopPropagation(); e.preventDefault(); }
  };
  const onKey = (e: KeyboardEvent) => {
    if (currentPopupMenu() !== handle) return;
    if (e.key === "Escape") { e.preventDefault(); handle.close(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const btns = [...el.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
      if (!btns.length) return;
      const i = btns.indexOf(document.activeElement as HTMLButtonElement);
      btns[e.key === "ArrowDown" ? (i + 1) % btns.length : (i - 1 + btns.length) % btns.length]!.focus();
      e.preventDefault();
    }
  };
  const onResize = () => { if (open) position(); };
  const handle: PopupMenuHandle = {
    get isOpen() { return open; },
    el, anchor: opts.anchor,
    refresh() { if (!open) return; render(); position(); },
    close() {
      if (!open) return;
      open = false;
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onResize);
      const i = _open.indexOf(handle); if (i >= 0) _open.splice(i, 1);
      el.remove();
      opts.onClose?.();
    },
  };
  el.addEventListener("click", (e) => {
    const b = (e.target as Element).closest("[data-id]") as HTMLButtonElement | null;
    if (!b || b.disabled) return;
    e.stopPropagation();
    const id = b.dataset.id as Id;
    const item = opts.items().find((it) => it.id === id);
    if (!item) return;
    const r = opts.onPick(id, item);
    if (r === "keep") { if (handle.isOpen) handle.refresh(); return; }
    handle.close();
  });
  position();
  setTimeout(() => {
    if (!open) return;
    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize);
  }, 0);
  _open.push(handle);
  const btn = el.querySelector<HTMLButtonElement>("button:not([disabled])"); if (btn) setTimeout(() => btn.focus(), 0);
  return handle;
}
