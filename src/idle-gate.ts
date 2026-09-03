// 闲置锁屏（procrastination guard）：N 分钟无输入 → 遮罩 + 失焦；锁屏时刻推送；点任意处解锁前**先复查云端**再放行输入。
// created 2026-09-03 by Claude Fable 5.1（v1 行为原样：user「Quest 是核电池，我可能开着一年」——醒来绝不用陈旧本地盖掉一年的远端编辑）。
import { IDLE_OVERLAY_MS } from "./config.ts";

export interface IdleGateDeps {
  overlay: HTMLElement;
  /** 锁屏时刻（用户显然停手了）：推送脏稿 / flush 词库 / 记 lastActive——fire-and-forget。 */
  onIdle: () => void;
  /** 解锁时刻：拉云端新鲜度、drain 队列、对齐 collection；完成前输入已被吃掉。 */
  onResume: () => Promise<void>;
  /** 解锁后把焦点还给编辑器。 */
  focusEditor: () => void;
}

export function initIdleGate(d: IdleGateDeps): { poke: () => void; isShown: () => boolean } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let shown = false;

  const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(show, IDLE_OVERLAY_MS); };
  const show = () => {
    if (shown) return;
    shown = true;
    d.overlay.classList.remove("hidden");
    (document.activeElement as HTMLElement | null)?.blur?.();
    d.onIdle();
  };
  const dismiss = async () => {
    if (!shown) return;
    shown = false;
    d.overlay.classList.add("hidden");
    schedule();
    try { await d.onResume(); } catch (e) { console.warn("[idle] resume sync failed", e); }
    d.focusEditor();
  };
  const onAnyActivity = (event: Event) => {
    if (shown) {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      void dismiss();
      return;
    }
    schedule();
  };
  document.addEventListener("keydown", onAnyActivity, { capture: true });
  document.addEventListener("pointerdown", onAnyActivity, { capture: true });
  document.addEventListener("touchstart", onAnyActivity, { capture: true, passive: true });
  document.addEventListener("scroll", () => { if (!shown) schedule(); }, { passive: true, capture: true });
  schedule();
  return { poke: schedule, isShown: () => shown };
}
