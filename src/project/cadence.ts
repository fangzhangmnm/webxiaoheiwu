// 书的落盘节律（ADR-0015 b）：本地防抖随体重放缓——按上次整包落盘的耗时插值，200 ms 起、封顶 3 s。纯函数，无 DOM。
// created 2026-09-10 by Claude Fable 5.1。txt 稿的节律常量（config.ts「别再动」）不受影响；这里只管书（zip 整包重打的成本与书大小线性）。
import { LOCAL_SAVE_DEBOUNCE_MS, BOOK_LOCAL_SAVE_DEBOUNCE_MAX_MS, BOOK_LOCAL_SAVE_COST_FACTOR } from "../config.ts";

/** 上次落盘（打包 + 写 IDB）花了 lastPersistMs → 下次本地防抖等多久。没量过（0 / NaN）= 基线 200 ms。
 *  例：耗时 20 ms → 200 ms（基线）；100 ms → 500 ms；600 ms 以上 → 3 s（封顶）。代价 = 崩溃最多丢这几秒的字（写进 ADR-0015 后果）。 */
export function bookLocalDebounceMs(lastPersistMs: number): number {
  if (!Number.isFinite(lastPersistMs) || lastPersistMs <= 0) return LOCAL_SAVE_DEBOUNCE_MS;
  return Math.round(Math.min(BOOK_LOCAL_SAVE_DEBOUNCE_MAX_MS, Math.max(LOCAL_SAVE_DEBOUNCE_MS, lastPersistMs * BOOK_LOCAL_SAVE_COST_FACTOR)));
}
