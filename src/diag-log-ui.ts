// diag-log-ui.ts —— 设置页「诊断日志」：看 + 复制 + 分享/下载 .txt + 清空（数据源 = diag-log.ts）。
// created 2026-09-09 by Claude Fable 5.1 —— 从 WeebPaint src/diag-log-sheet.ts 照抄（WXHW 设置页本就是一块 <pre>，不另开 sheet）。
// 复制走 navigator.clipboard.writeText（点击手势内）→ 失败回退 textarea+execCommand → 再失败选中 <pre> 让用户长按复制。
// 分享：canShare files → .txt 文件（微信/QQ 吃不下 60KB 长文本——WeebPaint 2026-09-06 教训）；没有 share（Quest/桌面）→ 下载 .txt。
// 无系统弹窗（家规）：结果走状态栏。

import { t } from "./i18n/index.ts";
import { entries, toText, clear } from "./diag-log.ts";
import { reportError } from "./error-badge.ts";

const $ = (id: string) => document.getElementById(id) as HTMLElement | null;

export function initDiagLogUi(deps: { status: (text: string) => void }): void {
  const btn = $("diagButton"), pre = $("diagLog"), copyBtn = $("diagLogCopy"), shareBtn = $("diagLogShare"), clearBtn = $("diagLogClear"), actions = $("diagLogActions");
  if (!btn || !pre) return;

  function render(): void {
    const n = entries().length;
    pre!.textContent = n ? toText() : t("settings.diagEmpty");
    pre!.scrollTop = pre!.scrollHeight;   // 最新在底
  }
  function toggle(): void {
    const show = pre!.hidden;
    pre!.hidden = !show;
    if (actions) actions.hidden = !show;
    if (show) render();
  }
  function copyViaTextarea(text: string): boolean {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.left = "-9999px"; ta.style.top = "0";
    document.body.appendChild(ta);
    ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
  async function copy(): Promise<void> {
    const text = toText();
    const n = String(entries().length);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("navigator.clipboard.writeText unavailable");
      await navigator.clipboard.writeText(text);
      deps.status(t("diag.copied", { n }));
      return;
    } catch (e) { reportError(new Error("[diag-log] clipboard.writeText failed: " + String(e)), "log"); }
    if (copyViaTextarea(text)) { deps.status(t("diag.copied", { n })); return; }
    try {
      const range = document.createRange(); range.selectNodeContents(pre!);
      const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
    } catch { /* 选区都做不了：只剩状态栏 */ }
    reportError(new Error("[diag-log] execCommand copy failed too"), "log");
    deps.status(t("diag.copyFailed"));
  }
  const logFile = () => new File([toText()], `xiaoheiwu-diag-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`, { type: "text/plain" });
  const canShare = typeof navigator.share === "function";
  if (shareBtn) {
    if (!canShare) shareBtn.textContent = t("diag.download");
    shareBtn.addEventListener("click", async () => {
      if (!canShare) {   // Quest / 桌面：下载
        const f = logFile();
        const url = URL.createObjectURL(f);
        const a = document.createElement("a"); a.href = url; a.download = f.name; a.style.display = "none";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        deps.status(t("diag.downloaded", { name: f.name }));
        return;
      }
      try {
        const f = logFile();
        const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
        if (nav.canShare?.({ files: [f] })) await navigator.share({ title: t("ui.diag"), files: [f] });
        else await navigator.share({ title: t("ui.diag"), text: toText() });
      } catch (e) {
        if ((e as { name?: string })?.name !== "AbortError") { reportError(new Error("[diag-log] share failed: " + String(e)), "log"); deps.status(t("diag.shareFailed")); }
      }
    });
  }
  btn.addEventListener("click", toggle);
  copyBtn?.addEventListener("click", () => { void copy(); });
  clearBtn?.addEventListener("click", () => { clear(); render(); deps.status(t("diag.cleared")); });
}
