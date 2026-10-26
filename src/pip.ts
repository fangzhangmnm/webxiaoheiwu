// 小窗（老板键）= Document Picture-in-Picture：浏览器弹一个置顶、没有地址栏的小窗，把纸（.page）和 PC 式候选条**搬**进去 —— created 20261024 by Claude Opus 5.5
// 设计稿 ai-docs/20261024-mini-window-proposal.md。user 2026-10-24「我要的老板键其实就是小窗口」「小窗就是非常borderless精简的」「一行空的，三行字，我看了之后调」。
// 形状照 KudsRocket src/app/pip.ts（user「感觉共用的东西应该不多？」→ 不抽库，照形状抄）：搬，不抄——同一批元素搬过去，原来的代码照样驱动它们；
//   挂在整页上的监听（输入法管线 / 候选条 / app 快捷键）由宿主在 onEnter 里多绑一份到小窗、onLeave 解绑。关掉小窗 → 搬回原位。
// 只有 Chromium 桌面版有这个 API（Chrome / Edge 116+）；iPad / Quest / Firefox 没有 → supported = false，入口不露。
// 不持久化任何东西：窗口大小 / 位置交给浏览器自己记。

interface DocumentPictureInPicture {
  requestWindow(opts?: { width?: number; height?: number }): Promise<Window>;
  readonly window: Window | null;
}

export interface PipHost {
  /** 搬进小窗之后：宿主绑小窗的事件、装字体、量稿纸。 */
  onEnter(win: Window): void;
  /** 搬回来之后：宿主解绑、量稿纸、把焦点还给正文。 */
  onLeave(): void;
  /** 纸搬走后原位放的占位（一句话 + 「收回」）。 */
  placeholder(): HTMLElement;
  /** 第一次开多大（CSS 像素，小窗里面那块）。 */
  size(): { width: number; height: number };
  /** 小窗现在这么高，离「整行」还差多少（正 = 要加高，负 = 要减）；已经对上 = 0。不给 = 不收整行，窗口大小全交给人和浏览器。 */
  fit?(innerHeight: number): number;
}

export interface Pip {
  readonly supported: boolean;
  /** 纸现在在小窗里。 */
  readonly active: boolean;
  /** 小窗的 window（没开 = null）。 */
  readonly window: Window | null;
  /** 开小窗（必须在用户手势里调）。返回是否真开了。 */
  open(): Promise<boolean>;
  /** 收回：纸搬回原位，小窗关掉。 */
  close(): void;
}

const api = (): DocumentPictureInPicture | null =>
  (globalThis as { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture ?? null;
export const pipSupported = (): boolean => typeof api()?.requestWindow === "function";

/** 小窗高度收成整行：可用高 = 内高 − 上下边距；行数 = 四舍五入（至少 minRows 行）；返回要加 / 减多少像素（对上了 = 0，差半像素以内算对上）。纯函数，单测钉着。 */
export function fitToRows(innerHeight: number, lineHeight: number, pad: number, minRows = 2): number {
  if (!(lineHeight > 0)) return 0;
  const rows = Math.max(minRows, Math.round((innerHeight - pad) / lineHeight));
  const want = rows * lineHeight + pad;
  const d = Math.round(want - innerHeight);
  return Math.abs(want - innerHeight) < 0.5 ? 0 : d;
}

/** 把主页面的样式搬进小窗：同源样式表读得到 cssRules 就整段抄（相对地址在 cssText 里已经是绝对的）；读不到就挂 link。CSP 的 style-src 有 'unsafe-inline'（ADR-0018）。 */
function copyStyles(from: Document, to: Document): void {
  for (const sheet of Array.from(from.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules).map((r) => r.cssText).join("\n");
      const style = to.createElement("style");
      style.textContent = css;
      to.head.append(style);
    } catch {
      if (!sheet.href) continue;
      const link = to.createElement("link");
      link.rel = "stylesheet";
      link.href = sheet.href;
      to.head.append(link);
    }
  }
}

/** 主页面 html / body 上的属性（主题 data-theme、字号档 --font-scale 的 style、行宽 data-chars、字体 data-font……）抄进小窗，开着时一直跟着。body 的 class 只抄、不覆盖小窗自己的 pip-body。 */
function mirrorRoot(from: Document, to: Document): MutationObserver {
  const copy = (): void => {
    for (const [src, dst] of [[from.documentElement, to.documentElement], [from.body, to.body]] as const) {
      for (const a of Array.from(src.attributes)) {
        if (a.name === "class" && src === from.body) continue;
        if (dst.getAttribute(a.name) !== a.value) dst.setAttribute(a.name, a.value);
      }
      for (const a of Array.from(dst.attributes)) if (!src.hasAttribute(a.name) && a.name !== "class") dst.removeAttribute(a.name);
    }
    const keep = to.body.classList.contains("pip-body");
    to.body.className = from.body.className;
    if (keep) to.body.classList.add("pip-body");
  };
  copy();
  const mo = new MutationObserver(copy);
  mo.observe(from.documentElement, { attributes: true });
  mo.observe(from.body, { attributes: true });
  return mo;
}

/** sheet = 纸（原位放占位）；extras（候选条）记下原来的父亲和下一个兄弟，收回时放回去。 */
export function createPip(sheet: HTMLElement, extras: HTMLElement[], host: PipHost): Pip {
  let win: Window | null = null;
  let hole: HTMLElement | null = null;
  let homes: { el: HTMLElement; parent: Node; next: Node | null }[] = [];
  let mirror: MutationObserver | null = null;
  const home = sheet.ownerDocument;

  const restore = (): void => {
    if (!win) return;
    const w = win;
    win = null;
    mirror?.disconnect(); mirror = null;
    if (hole) { hole.replaceWith(sheet); hole = null; }
    for (const h of homes) h.parent.insertBefore(h.el, h.next && h.next.parentNode === h.parent ? h.next : null);
    homes = [];
    host.onLeave();
    try { w.close(); } catch { /* 已经关了 */ }
  };

  const open = async (): Promise<boolean> => {
    const a = api();
    if (!a || win) return false;
    const { width, height } = host.size();
    const w = await a.requestWindow({ width: Math.round(width), height: Math.round(height) });
    const d = w.document;
    d.title = home.title;   // 网页标题 = 只是 app 自己的名字（家规）
    copyStyles(home, d);
    const sprite = home.querySelector("body > svg");   // 图标 sprite：<use href="#…"> 只认同一个 document
    if (sprite) d.body.prepend(sprite.cloneNode(true));
    d.body.classList.add("pip-body");
    mirror = mirrorRoot(home, d);
    homes = extras.map((el) => ({ el, parent: el.parentNode!, next: el.nextSibling }));
    hole = host.placeholder();
    sheet.replaceWith(hole);
    d.body.append(sheet, ...extras);
    win = w;
    w.addEventListener("pagehide", restore);   // 用户点了小窗的 ×、或浏览器把它收了 → 搬回来
    // 收成整行：浏览器照记住的大小开、或人拖出半行时，记着；等小窗里下一次按键松开 / 点（那时有用户手势）再 resizeBy（小窗的 outerHeight 读出来是 0，只能按增量改；KudsRocket 同款）
    const hostFit = host.fit?.bind(host);
    let fitPending = false;
    const measure = (): void => { fitPending = !!hostFit && hostFit(w.innerHeight) !== 0; };
    const fit = (): void => {
      if (!fitPending || !hostFit) return;
      fitPending = false;
      const dh = hostFit(w.innerHeight);
      if (dh) { try { w.resizeBy(0, dh); } catch (e) { console.warn("[pip] fit", e); } }
    };
    if (hostFit) { w.addEventListener("resize", measure); w.addEventListener("pointerup", fit, true); w.addEventListener("keyup", fit, true); }
    host.onEnter(w);
    measure();
    return true;
  };

  return {
    get supported() { return pipSupported(); },
    get active() { return win != null; },
    get window() { return win; },
    open,
    close: restore,
  };
}
