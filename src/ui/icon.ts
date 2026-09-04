// 图标 = 指向内联 sprite 的 <use>（抄 WeebPaint src/ui/icon.ts，2026-09-03 对齐批）。created 2026-09-03 by Claude Fable 5.1
// 图标名 = 共享库（20260708 SVG Icons）的 symbol id，或 assets/icons-local.svg 的 stopgap。尺寸由 CSS 按语境给。
export type IconName = string;
export function iconHtml(name: IconName, opts: { size?: number; cls?: string } = {}): string {
  const { size, cls } = opts;
  const attrs = ['viewBox="0 0 24 24"', cls ? `class="${cls}"` : "", size ? `width="${size}" height="${size}"` : "", 'aria-hidden="true"'].filter(Boolean).join(" ");
  return `<svg ${attrs}><use href="#${name}"/></svg>`;
}
