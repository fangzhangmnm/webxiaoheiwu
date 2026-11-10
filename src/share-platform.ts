// share-platform.ts —— 「这台是不是手机 / 平板系统」的唯一判断（分享面板只在那里是自然的「保存」路径）。
// created 2026-11-09 by Claude Opus 5.5（家族周账 F-111；user 2026-10-27「黑匣子的分享windows下面应该是下载，windows的分享就是个流氓软件」）。
// 小黑屋这里只有黑匣子一个用户（diag-log-ui.ts）；作品导出的分享 / 下载（app.ts offerFiles）不归这里。
// iPadOS 13+ 默认伪装成 Mac 桌面：UA 是 Macintosh / platform 是 MacIntel，看多点触控认出来（Mac 桌面是 0）。
// WeebPaint src/share-platform.ts 同一份（那边作品导出也用 isMobileShareOs）。

export interface SharePlatformNav { share?: unknown; userAgent?: string; maxTouchPoints?: number; platform?: string }

/** iOS / iPadOS / Android。 */
export function isMobileShareOs(nav: SharePlatformNav = navigator): boolean {
  const ua = nav.userAgent ?? "";
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
  const touch = (nav.maxTouchPoints ?? 0) > 1;
  return touch && (nav.platform === "MacIntel" || /Macintosh/i.test(ua));
}

/** 黑匣子的「分享」走不走系统分享面板：手机 / 平板系统且浏览器有 share；别的（Windows / Mac / Linux 桌面、Quest）一律下载。 */
export function shareSheetPlatform(nav: SharePlatformNav = navigator): boolean {
  return typeof nav.share === "function" && isMobileShareOs(nav);
}
