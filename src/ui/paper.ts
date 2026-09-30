// 稿纸的几何：行高、写字线的位置、稿纸宽窄档。created 2026-09-29 by Claude Fable 5.1
//   user 2026-09-29「现在稿纸的线其实还是和文字没对齐的」「章后面的超链接我也想做成就像文字一样就在线上的」
//   「小横屏适配（看一下 gpd win mini，我可能开 175% 的 zoom，这个是我的写作主力设备之一）…对于 vr 的无限大屏来说确实需要限制宽度」。
//
// 先量后改（tools/ruled-audit.mjs，2026-09-29）：以前线是「每 1lh 平铺一块、整体上挪 0.4em」。量出来两个毛病：
//   ① 0.4em 只对 1.9 倍行距成立；「标准 · 宽行」1.6 倍时线落在字的底边之上（切字脚）。换一个字体（不同平台）也不成立。
//   ② 行高是小数像素（20.36px × 1.9 = 38.69px），背景逐块取整，18 行漂 2 个设备像素，越往下越歪。
// 现在：
//   · 行高取整到**设备像素**（round(字号 × 倍数 × dpr) / dpr）写进 --editor-lh；正文、子节目录、背景平铺都用这同一个数 → 逐行不漂。
//   · 线的位置 = 实测基线 + 0.18 个字高（汉字字身底在基线下约 0.12，再留一点气），同样取整到设备像素 → 不切字脚，换字体 / 换行距自动跟。
//     基线用 DOM 量（一个零高的 inline-block 坐在基线上），不用 canvas。
//   · body.paper-short：可用高度很矮（手机横屏 + 软键盘）时页脚字数统计让位、纸边收窄。
//     （「宽稿纸」档 body.paper-wide 2026-09-30 撤了：user「win mini 现在的情况不需要加宽，加宽可以撤了」——一张纸模型 + 候选条瘦身之后纵向不再稀缺。）
//   · 一张纸模型（v2.1.26，2026-09-30 user「对的，整张纸滚」）：正文框高度 = 内容高度（contentHeight 量孪生框），自己不滚，滚的是整张纸；
//     光标跟随的兜底用同一个孪生框量光标那一行的底边（caretBottom）。
// 不管的事：纸面上各件怎么摆（app.ts syncBodyHeight）、正文内容、滚动本身。

export interface PaperDeps {
  page: HTMLElement;
  editor: HTMLTextAreaElement;
  /** 屏幕底部被输入法那一块占掉的高度（px）。 */
  dockHeight(): number;
  /** 几何变了（行高 / 线位 / 矮屏档）：纸面上的件要重排。 */
  onChanged(): void;
}
export interface Paper {
  /** 重算（视口 / 缩放 / 字号档位 / 阅读节奏 / 软键盘露收 之后调）。 */
  refresh(): void;
  /** 一行的高度（CSS px，已对齐设备像素）。 */
  lineHeight(): number;
  /** 正文内容的高度（不碰正文框本身：量一个看不见的孪生框）。 */
  contentHeight(): number;
  /** 光标（selectionEnd）所在那一行的底边，相对正文框上沿（px）。光标在末尾时 = contentHeight，不用再量一次。 */
  caretBottom(): number;
  /** 把一个件的上沿补到整像素（用 margin-top 补零点几像素）。纸面上方的章节名行高度带小数（字号 × 1.25 × 1.4），正文容器的上沿就落在零点几像素上；
   *  浏览器画字时各自取整，正文框和目录行会差出 1 像素（2026-09-29 量到：同一套线，目录的字比正文的字低 1–2 个像素）。上沿是整数就没有这回事。 */
  alignTop(el: HTMLElement): void;
}

const SHORT_MAX_HEIGHT = 300;
const RULE_BELOW_BASELINE_EM = 0.18;

export function createPaper(d: PaperDeps): Paper {
  let lh = 0, ruleY = -1, ruleW = 0, short: boolean | null = null;
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;white-space:nowrap;margin:0;padding:0;border:0";
  // 量尺 = 一个方块汉字（U+56FD）。用码点拼出来：这不是用户可见文案，别让裸中文扫描当成漏网的界面文字
  probe.textContent = String.fromCharCode(0x56fd);
  const mark = document.createElement("span");
  mark.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
  probe.appendChild(mark);
  const mirror = document.createElement("textarea");
  mirror.className = "body body-mirror"; mirror.tabIndex = -1; mirror.readOnly = true; mirror.rows = 1;
  mirror.setAttribute("aria-hidden", "true");

  function refresh(): void {
    const availH = window.innerHeight - d.dockHeight();
    const nextShort = availH <= SHORT_MAX_HEIGHT;
    let changed = false;
    if (nextShort !== short) { short = nextShort; document.body.classList.toggle("paper-short", short); changed = true; }

    const cs = getComputedStyle(d.editor);
    const font = parseFloat(cs.fontSize) || 16;
    const ratio = parseFloat(getComputedStyle(d.page).getPropertyValue("--editor-line-height")) || 1.9;
    const dpr = window.devicePixelRatio || 1;
    const snap = (v: number): number => Math.round(v * dpr) / dpr;
    // 行高还得是整数**设备**像素（2026-09-30，撤宽稿纸后 Win Mini dpr 1.75 上抓到：39 CSS px = 68.25 设备像素，每行的小数部分不同，
    //   纸滚过一个不整的距离后有的行多贴 1 设备像素）：dpr 1.75 → 4 的倍数（7 设备像素）、1.25 → 4、1.5 → 2、整数 dpr → 任意；
    //   最近的倍数（39 → 40），行距只差个位数百分比。lhStep 找不到（怪 dpr）就退回 1。
    let lhStep = 1; for (let n = 1; n <= 8; n++) { if (Math.abs(n * dpr - Math.round(n * dpr)) < 1e-6) { lhStep = n; break; } }
    const nextLh = Math.max(lhStep, Math.round(font * ratio / lhStep) * lhStep);   // 整数 CSS 像素：浏览器把每行字的基线落在整 CSS 像素上，行高带小数的话字自己就一行高一行低（2026-09-29 量到 dpr 2 / 行高 38.5 时逐行差 1 个设备像素）
    // 基线：孪生行框（同字体、同行高）里零高 inline-block 的位置
    probe.style.fontFamily = cs.fontFamily; probe.style.fontSize = cs.fontSize; probe.style.fontWeight = cs.fontWeight; probe.style.fontStyle = cs.fontStyle; probe.style.letterSpacing = cs.letterSpacing;
    probe.style.lineHeight = `${nextLh}px`;
    if (!probe.isConnected) d.page.appendChild(probe);
    const baseline = mark.getBoundingClientRect().top - probe.getBoundingClientRect().top;
    const nextW = Math.max(1, Math.round(dpr)) / dpr;
    const nextY = Math.min(snap(baseline + RULE_BELOW_BASELINE_EM * font), nextLh - nextW);
    if (nextLh !== lh || nextY !== ruleY || nextW !== ruleW) {
      lh = nextLh; ruleY = nextY; ruleW = nextW;
      d.page.style.setProperty("--editor-lh", `${lh}px`);
      d.page.style.setProperty("--rule-y", `${ruleY}px`);
      d.page.style.setProperty("--rule-w", `${ruleW}px`);
      changed = true;
    }
    if (changed) d.onChanged();
  }
  function measure(text: string): number {
    if (!mirror.isConnected) d.page.appendChild(mirror);
    mirror.style.width = `${d.editor.clientWidth}px`;
    mirror.value = text;
    return mirror.scrollHeight;
  }
  function contentHeight(): number { return measure(d.editor.value); }
  function caretBottom(): number {
    const v = d.editor.value, end = d.editor.selectionEnd ?? v.length;
    return measure(end >= v.length ? v : v.slice(0, end));   // 到光标为止的文本有几行，光标就在第几行（textarea 末尾的换行也算一行，和真框一致）
  }
  function alignTop(el: HTMLElement): void {
    el.style.marginTop = "0px";
    const top = el.getBoundingClientRect().top;
    const pad = Math.ceil(top - 0.01) - top;
    el.style.marginTop = pad > 0.01 ? `${pad.toFixed(3)}px` : "0px";
  }
  return { refresh, lineHeight: () => lh || 24, contentHeight, caretBottom, alignTop };
}
