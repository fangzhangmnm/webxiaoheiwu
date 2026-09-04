// 弹框锚定定位——所有「跟着按钮跑」的 popup 的唯一定位入口（抄 WeebPaint src/anchored-popup.ts，去掉其 context-toolbar 依赖）。
// 统一：position:fixed + safe-area + 夹进视口。created 2026-09-03 by Claude Fable 5.1
export function safeAreaTop(): number {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;top:0;left:0;height:0;padding-top:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none;";
  document.body.appendChild(probe);
  const v = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  return v;
}
interface PositionOpts { anchor?: HTMLElement | null; align?: "left" | "right"; offsetY?: number; edgeMargin?: number; clampViewport?: boolean }
export function positionPopup(popupEl: HTMLElement | null, opts: PositionOpts = {}): void {
  if (!popupEl) return;
  const { anchor = null, align = "right", offsetY = 4, edgeMargin = 8, clampViewport = true } = opts;
  popupEl.style.position = "fixed";
  const safeTop = safeAreaTop();
  let top: number;
  const w = popupEl.offsetWidth || 0;
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    top = r.bottom + offsetY;
    if (align === "right") { let right = window.innerWidth - r.right; if (w) right = Math.max(edgeMargin, Math.min(right, window.innerWidth - w - edgeMargin)); popupEl.style.right = right + "px"; popupEl.style.left = "auto"; }
    else { let left = r.left; if (w) left = Math.max(edgeMargin, Math.min(left, window.innerWidth - w - edgeMargin)); popupEl.style.left = left + "px"; popupEl.style.right = "auto"; }
  } else {
    top = safeTop + offsetY;
    if (align === "right") { popupEl.style.right = edgeMargin + "px"; popupEl.style.left = "auto"; } else { popupEl.style.left = edgeMargin + "px"; popupEl.style.right = "auto"; }
  }
  top = Math.max(top, safeTop + 4);
  if (clampViewport) { const h = popupEl.offsetHeight || 0; if (h) top = Math.min(top, Math.max(safeTop + 4, window.innerHeight - h - 8)); }
  popupEl.style.top = top + "px";
}
