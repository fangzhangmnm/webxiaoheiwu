// 还原出厂设置（抄 WeebPaint src/factory-reset.ts；store 0.7.0+ maintenance 口子）。created 2026-09-03 by Claude Fable 5.1
//
// 范围 = 本机全部足迹：store 命名空间（IDB `webxiaoheiwu.*` + localStorage 前缀键——库内 typed-consent 口子，报告只含库名+键计数）
//   + device-kv 键 + RIME 自持 IDB（"ime" 词典缓存 + IDBFS "/rime"）+ **本 app 的缓存**（`xiaoheiwu-` 前缀的壳缓存整个删；
//     家族共享的模型缓存 pwa-models 里**只删本 app 认得的包**——识别模型）+ 注销管着当前页面的 SW。
//   **只动自己的**（user 2026-10-01「四个项目清缓存修一下」；edited by Claude Fable 5.1 2026-10-01）：同域名下还有兄弟 app 的离线壳，
//     pwa-models 里还有别的 app 下的包（阅读器的朗读音色…）——以前「全部缓存 + 全部 SW」会一起清掉。
// **云端永不碰**（还原出厂 ≠ 删稿——正本在 OneDrive；这是「公用电脑离开前清痕」+ 调试双用）。
// 前置：无未同步的稿（dirty / local-only）——否则拒绝，不造逃生副本（数据安全词典序：云端不丢字 >> 便利）。
// 持久层白名单：本文件允许 indexedDB.deleteDatabase / caches（test/storage-whitelist + redline-guard 登记）。
import { wipeAppNamespace, scanAppNamespace, disposeStore } from "./app-store.ts";
import { deviceKvWipeAll, deviceKvCount } from "./device-kv.ts";
import { openConfirmSheet, openInputSheet } from "./sheets.ts";
import { t } from "./i18n/index.ts";
import { reportError } from "./error-badge.ts";
import { APP_ID, MODEL_CACHE_NAME, SHELL_CACHE_PREFIX } from "./config.ts";
import { PACK_MANIFESTS } from "./asr/packs.generated.ts";

const RIME_DBS = new Set(["ime", "/rime"]);
const BLOCKED_TIMEOUT_MS = 2000;

function deleteDbOrBlocked(name: string): Promise<"deleted" | "blocked"> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: "deleted" | "blocked") => { if (!settled) { settled = true; resolve(r); } };
    const timer = setTimeout(() => done("blocked"), BLOCKED_TIMEOUT_MS);
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => { clearTimeout(timer); done("deleted"); };
    req.onerror = () => { clearTimeout(timer); done("blocked"); };
  });
}
async function listRimeDbs(): Promise<string[]> {
  try {
    if (typeof indexedDB.databases !== "function") return [];   // 老平台枚举不了——诚实缺口：扫描报 0 但不谎报「验证归零」
    return (await indexedDB.databases()).map((d) => d.name ?? "").filter((n) => RIME_DBS.has(n));
  } catch { return []; }
}

/** 清本 app 的缓存，返回清掉了几个：自己前缀的壳缓存整个删；共享的模型缓存里只删本 app 内嵌清单认得的包（算一个）。 */
async function wipeOwnCaches(): Promise<number> {
  let n = 0;
  for (const k of await caches.keys()) { if (k.startsWith(SHELL_CACHE_PREFIX) && (await caches.delete(k))) n++; }
  if (await caches.has(MODEL_CACHE_NAME)) {
    const cache = await caches.open(MODEL_CACHE_NAME);
    const mine = Object.keys(PACK_MANIFESTS).map((slug) => `/__pwa-models__/${slug}/`);
    let removed = 0;
    for (const req of await cache.keys()) { const path = decodeURIComponent(new URL(req.url).pathname); if (mine.some((p) => path.startsWith(p)) && (await cache.delete(req))) removed++; }
    if (removed) n++;
  }
  return n;
}

async function wipeAppFootprint(): Promise<{ deleted: string[]; blocked: string[]; lsRemoved: number; cachesRemoved: number }> {
  const report = { deleted: [] as string[], blocked: [] as string[], lsRemoved: 0, cachesRemoved: 0 };
  for (const name of await listRimeDbs()) ((await deleteDbOrBlocked(name)) === "deleted" ? report.deleted : report.blocked).push(name);
  report.lsRemoved = deviceKvWipeAll();
  try { if (typeof caches !== "undefined") report.cachesRemoved = await wipeOwnCaches(); } catch { /* best-effort */ }
  try { if (navigator.serviceWorker) { const r = await navigator.serviceWorker.getRegistration(); if (r) await r.unregister().catch(() => {}); } } catch { /* best-effort */ }
  return report;
}

export interface FactoryResetDeps {
  setStatus: (msg: string, opts?: { error?: boolean }) => void;
  /** 未同步的稿数（dirty / local-only + 编辑器未落盘）。>0 = 拒绝。 */
  unsyncedCount: () => Promise<number>;
  /** wipe 前收口：flush 编辑器与 collections、清空编辑器（之后 store 就 dispose 了）。 */
  beforeWipe: () => Promise<void>;
}

/** 还原出厂主流程（设置页按钮调）。全程 in-app sheet。 */
export async function runFactoryReset(d: FactoryResetDeps): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) { d.setStatus(t("fr.needOnline"), { error: true }); return; }   // 清壳后 reload 要联网，不然白屏
  const unsynced = await d.unsyncedCount();
  if (unsynced > 0) { d.setStatus(t("fr.needSync", { n: String(unsynced) }), { error: true }); return; }
  if (!(await openConfirmSheet(t("fr.introTitle"), t("fr.introMsg"), { danger: true, okLabel: t("common.continue") }))) return;
  const phrase = t("fr.consentPhrase");
  const typed = await openInputSheet(t("fr.introTitle"), { placeholder: phrase, message: t("fr.consentPrompt", { phrase }), okLabel: t("fr.introTitle") });
  if (typed == null) return;
  if (typed.trim() !== phrase) { d.setStatus(t("fr.mismatch"), { error: true }); return; }   // 库内还会再比一次；先挡省一次 dispose
  try {
    await d.beforeWipe();
    await disposeStore();
    const storeReport = await wipeAppNamespace({ appId: APP_ID, consent: { expected: phrase, typed: typed.trim() } });
    const app = await wipeAppFootprint();
    const scan = await scanAppNamespace(APP_ID);
    const blocked = storeReport.blockedDatabases.length + app.blocked.length;
    if (blocked > 0) {
      await openConfirmSheet(t("fr.introTitle"), t("fr.blocked", { n: String(blocked) }));
      location.reload();   // store 已 dispose，页面只能重来；wipe 幂等，关掉其他标签页后再跑一次
      return;
    }
    const residue = scan.databases.length + scan.localStorageKeys + (await listRimeDbs()).length + deviceKvCount();
    const db = storeReport.deletedDatabases.length + app.deleted.length, ls = storeReport.localStorageKeysRemoved + app.lsRemoved;
    d.setStatus(residue === 0 ? t("fr.doneClean", { db: String(db), ls: String(ls), caches: String(app.cachesRemoved) }) : t("fr.residue", { n: String(residue) }));
    setTimeout(() => location.reload(), 1200);   // 出厂态重启（内存单例归零的唯一诚实方式）
  } catch (e) {
    if ((e as { name?: string })?.name === "WipeConsentError") { d.setStatus(t("fr.mismatch"), { error: true }); return; }
    reportError(e instanceof Error ? e : new Error(String(e)));
    setTimeout(() => location.reload(), 1500);   // store 可能已 dispose，留在页面上只会一路 StoreDisposedError
  }
}
