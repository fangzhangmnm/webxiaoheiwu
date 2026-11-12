// StoreUI adapter —— 给 @internal/store 的 ui bundle（busy / resolveConflict / reportError / offlineEscape / text）。
// created 2026-09-03 by Claude Fable 5.1（WeebPaint store-ui.ts 同形）。
//   冲突必 surface（ADR-0009）：绝不静默 cancel——真 gate sheet，按 occasion 分两套按钮。
//   v1 的 sibling-copy（「不要 diff」）在库模型里 = keepMine/takeCloud 二选一 + 败方自动进 .backup（不丢字节，也不做 diff）。
import type { StoreUI, StoreTextKey, StoreTextParams } from "@internal/store";
import { withBusy, lockSyncGate, settleSyncGate, gateGeneration, awaitingAnswerUp } from "./sheets.ts";
import { noteAuthFailure, noteContentFailure, type CloudGate } from "./cloud-gate.ts";
import { t, type Key } from "./i18n/index.ts";
import { reportError } from "./error-badge.ts";
import { note as diagNote } from "./diag-log.ts";

// 库 14 个 busy 文案 key → 本仓 i18n。穷举 Record：库加 key 本表漏映 = 编译错。
const STORE_TEXT_KEYS: Record<StoreTextKey, Key> = {
  "sync.pushing": "st.syncPushing",
  "file.renaming": "st.fileRenaming",
  "file.pulling": "st.filePulling",
  "file.uploading": "st.fileUploading",   // store 0.17.0 files.uploadStream（本 app 不用流式上传，映射只为穷举表完整）
  "cloud.checking": "st.cloudChecking",
  "file.deleting": "st.fileDeleting",
  "trash.restoring": "st.trashRestoring",
  "trash.purging": "st.trashPurging",
  "trash.emptyTrash": "st.trashEmptyTrash",
  "trash.emptyBackups": "st.trashEmptyBackups",
  "file.encrypting": "st.fileEncrypting",
  "file.decrypting": "st.fileDecrypting",
  "file.rekeying": "st.fileRekeying",
  "file.reuploading": "st.fileReuploading",
  "folder.creating": "st.folderCreating",
  "folder.deleting": "st.folderDeleting",
};

const stripExt = (n: string) => n.replace(/\.txt$/i, "");

// busy 按 key 路由（store 0.11.4，user 2026-09-03「改库」）：推云 / 改名是后台节律（15s 自动推、标题防抖改名），不上全屏遮罩——
// 状态栏由 editor.pushNow 自己写「正在同步…」；其余（加解密 / 回收站 / 建删夹 / 拉取）是用户动作，遮罩合理。
const QUIET_KEYS = new Set<StoreTextKey>(["sync.pushing", "file.renaming"]);
// 2026-09-09（审计 #6/#7，对账 WeebPaint quietBusy）：安静路径以前**零 UI**——改名/推云在跑用户完全看不到。这里只写一条状态栏（app 注入 sink），不遮罩。
let _quietStatus: ((text: string) => void) | null = null;
export function setStoreQuietStatus(fn: (text: string) => void): void { _quietStatus = fn; }
let _gate: CloudGate | null = null;
/** app 组装层把闸门递进来（store-ui 在 createStore 时就要，闸门要等 app 起来才有）。 */
export function attachGate(g: CloudGate): void { _gate = g; }

export const storeUI: StoreUI = {
  busy: (label, fn, key) => (key && QUIET_KEYS.has(key) ? (_quietStatus?.(label), Promise.resolve().then(fn)) : withBusy(label, fn)),

  text: (key: StoreTextKey, params?: StoreTextParams): string | undefined => {
    const k = STORE_TEXT_KEYS[key];
    return k ? t(k, params) : undefined;
  },

  resolveConflict: async ({ name, occasion, contentFailing }): Promise<"keepMine" | "takeCloud" | "cancel"> => {
    const n = stripExt(name);
    // v3.0.21（施工单第 3 条；规矩 = 统筹 Claude Fable 5.2，代码 = Claude Opus 5.5）：库 2.3.3 的 contentFailing =
    //   这个页面里最近一次下载文件内容失败了、之后还没成功过。为真：多一行实话（另起一行，在正文里，不放小字附注），默认钮换成「取消」；
    //   钮一个不藏、不变灰（user 的规矩：不硬拦，只说清楚）。为假 / 没给 = 和以前一模一样。
    //   开文件那张面只有两个钮（先打开本地 = 取消、云端覆盖本地），默认本来就是取消；那行字只说「云端覆盖本地」那半（面上没有「本地覆盖云端」钮，提它会误导）。
    const cf = contentFailing === true;
    const choice = occasion === "open"
      ? await lockSyncGate<"cancel" | "takeCloud">({
          title: t("cf.title"), message: cf ? `${t("cf.bodyOpen", { name: n })}\n${t("cf.contentFailingOpen")}` : t("cf.bodyOpen", { name: n }), note: t("cf.noteKeptSafe"),
          actions: [{ label: t("cf.openLocal"), value: "cancel", primary: true }, { label: t("cf.cloudWins"), value: "takeCloud" }],
        })
      : await lockSyncGate<"keepMine" | "takeCloud" | "cancel">({
          title: t("cf.title"), message: cf ? `${t("cf.bodyPush", { name: n })}\n${t("cf.contentFailingPush")}` : t("cf.bodyPush", { name: n }), note: t("cf.noteKeptSafe"),
          // primary = 云端（v2.3.35，2026-10-16，user 同日在 KudsRocket「默认云端才是 authority」；挂机醒来撞面的那台通常是旧的一方；本机那份照旧进本机备份箱）
          //   v3.0.21：下载内容刚失败过 → 「云端覆盖本地」大概完不成，默认钮换成「取消」（三个钮照旧都在）
          actions: [{ label: t("cf.cloudWins"), value: "takeCloud", primary: !cf }, { label: t("cf.localWins"), value: "keepMine" }, { label: t("common.cancel"), value: "cancel", primary: cf }],
        });
    diagNote("sync", `conflict sheet "${name}" occasion=${occasion}${cf ? " contentFailing" : ""} → ${choice ?? "cancel"}`);   // 黑匣子：真机上「又弹面了」能对出是哪一次推 / 开
    return choice ?? "cancel";
  },

  // store 2.2.2（user 2026-10-26「同意，反正不删就行了」）：改名 / 移动撞上「不知道云端旧的该不该搬」→ 动字节前先问。搬走 = 进回收站（可恢复），不是删。照 CatsUp src/store-ui.ts。
  resolveRenameOld: async ({ oldName, newName, reason }): Promise<"trash" | "keep" | "cancel"> => {
    const old = stripExt(oldName), next = stripExt(newName);
    const choice = await lockSyncGate<"trash" | "keep" | "cancel">({
      title: t("cf.renameOldTitle", { name: old }), message: t(reason === "diverged" ? "cf.renameOldDiverged" : "cf.renameOldUnknown", { old, next }),
      actions: [{ label: t("cf.renameOldTrash"), value: "trash", primary: true }, { label: t("cf.renameOldKeep"), value: "keep" }, { label: t("common.cancel"), value: "cancel" }],
    });
    diagNote("sync", `rename-old sheet "${old}" → "${next}" reason=${reason} → ${choice ?? "cancel"}`);
    return choice ?? "cancel";
  },

  reportError: (err: unknown, level): void => {
    // 未登录时库的后台云动作（collections 对齐 / 云帧）会撞 auth 的 "Not signed in"——那是正常态不是故障，绝不上横幅（2026-09-03 截图：橙条常驻）。
    if ((err as { message?: string } | null)?.message === "Not signed in") { reportError(err, "log"); return; }
    noteAuthFailure(String((err as { message?: string } | null)?.message ?? ""));   // 2026-11-03 闸门：续签失败的原因码只有这行日志里有（行格式 test/cloud-gate.test.mjs 对着库钉住）
    if ((err as { name?: string } | null)?.name === "CloudNetworkError") {
      reportError(err, "log");
      // v3.0.21（施工单第 2 条）：库 2.3.3 起网络错带 stage。"content" = 云端连得上、文件内容（微软另一台发文件的服务器）没下载下来——
      //   不说成「连不上云端（网络问题）」；同时告诉闸门（它判「没回应」时据此换说法）。没有 stage（老的报错 / 别的段）照旧。
      const content = (err as { stage?: string }).stage === "content";
      if (content) noteContentFailure();
      reportError(new Error(t(content ? "err.cloudContent" : "err.cloudNetwork")), level ?? "error");
      return;
    }
    reportError(err, level ?? "error");
  },

  // ADR-0018：离线新稿回线自动补推（offlineUploadReplay:"auto"）的进度/撞名 surface（非 busy，走状态行/横幅）。
  onReplayStatus: ({ phase, name, done, total }): void => {
    const n = name ? name.replace(/\.txt$/i, "") : "";
    if (phase === "collision") reportError(new Error(t("replay.collision", { name: n })), "warning");
    else if (phase === "done") reportError(t("replay.done", { done, total }), "info");
    else reportError(t("replay.progress", { done, total }), "info");
  },

  // 「跳过到离线」逃生闸：probe 与云端 fetchMeta race；用户点跳过 → probe resolve → 读本地。
  offlineEscape: (): { probe: Promise<unknown>; settle: () => void } => {
    const viaGate = _gate?.storeEscape();   // 闸门在场：跟闸门的「先离线用」赛跑，不另开一张面（家族设计稿 cloud-gate §4）
    if (viaGate) return viaGate;
    let onSkip!: () => void;
    const probe = new Promise<unknown>((res) => { onSkip = () => res(undefined); });
    let mine = -1, settled = false, waiter: ReturnType<typeof setInterval> | null = null;
    const show = (): void => {
      void lockSyncGate<"skip" | null>({ title: t("cf.checkingCloud"), message: "", showSpinner: true, actions: [{ label: t("cf.skipToOffline"), value: "skip" }] })
        .then((v) => { if (v === "skip") onSkip(); });
      mine = gateGeneration();
    };
    // v3.0.21（施工单第 6 条）：别的框正等着人回答（「还有 N 份没传成」、冲突面……）→ 转圈的罩不盖上去，排队：等那个框关了、检查还没完再出来。
    //   不把那个框关掉（等于替人回答）；排队期间人在答那个框，本来也顾不上「跳过」。11-12 user 截图：这张罩压在一个等回答的框上，后面的字和钮都看不到。
    if (awaitingAnswerUp()) {
      diagNote("sync", "cloud-check cover queued: another face is waiting for an answer");
      waiter = setInterval(() => { if (settled) return; if (!awaitingAnswerUp()) { clearInterval(waiter!); waiter = null; show(); } }, 150);
    } else show();
    return { probe, settle: () => { settled = true; if (waiter) { clearInterval(waiter); waiter = null; } if (mine >= 0 && gateGeneration() === mine) settleSyncGate(null); } };
  },
};
