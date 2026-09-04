// StoreUI adapter —— 给 @internal/store 的 ui bundle（busy / resolveConflict / reportError / offlineEscape / text）。
// created 2026-09-03 by Claude Fable 5.1（WeebPaint store-ui.ts 同形）。
//   冲突必 surface（ADR-0009）：绝不静默 cancel——真 gate sheet，按 occasion 分两套按钮。
//   v1 的 sibling-copy（「不要 diff」）在库模型里 = keepMine/takeCloud 二选一 + 败方自动进 .backup（不丢字节，也不做 diff）。
import type { StoreUI, StoreTextKey, StoreTextParams } from "@internal/store";
import { withBusy, lockSyncGate, settleSyncGate } from "./sheets.ts";
import { t, type Key } from "./i18n/index.ts";
import { reportError } from "./error-badge.ts";

// 库 14 个 busy 文案 key → 本仓 i18n。穷举 Record：库加 key 本表漏映 = 编译错。
const STORE_TEXT_KEYS: Record<StoreTextKey, Key> = {
  "sync.pushing": "st.syncPushing",
  "file.renaming": "st.fileRenaming",
  "file.pulling": "st.filePulling",
  "cloud.checking": "st.cloudChecking",
  "file.deleting": "st.fileDeleting",
  "trash.restoring": "st.trashRestoring",
  "trash.purging": "st.trashPurging",
  "trash.emptyTrash": "st.trashEmptyTrash",
  "trash.emptyBackups": "st.trashEmptyBackups",
  "file.encrypting": "st.fileEncrypting",
  "file.decrypting": "st.fileDecrypting",
  "file.reuploading": "st.fileReuploading",
  "folder.creating": "st.folderCreating",
  "folder.deleting": "st.folderDeleting",
};

const stripExt = (n: string) => n.replace(/\.txt$/i, "");

// busy 按 key 路由（store 0.11.4，user 2026-09-03「改库」）：推云 / 改名是后台节律（15s 自动推、标题防抖改名），不上全屏遮罩——
// 状态栏由 editor.pushNow 自己写「正在同步…」；其余（加解密 / 回收站 / 建删夹 / 拉取）是用户动作，遮罩合理。
const QUIET_KEYS = new Set<StoreTextKey>(["sync.pushing", "file.renaming"]);
export const storeUI: StoreUI = {
  busy: (label, fn, key) => (key && QUIET_KEYS.has(key) ? Promise.resolve().then(fn) : withBusy(label, fn)),

  text: (key: StoreTextKey, params?: StoreTextParams): string | undefined => {
    const k = STORE_TEXT_KEYS[key];
    return k ? t(k, params) : undefined;
  },

  resolveConflict: async ({ name, occasion }): Promise<"keepMine" | "takeCloud" | "cancel"> => {
    const n = stripExt(name);
    const choice = occasion === "open"
      ? await lockSyncGate<"cancel" | "takeCloud">({
          title: t("cf.title"), message: t("cf.bodyOpen", { name: n }), note: t("cf.noteKeptSafe"),
          actions: [{ label: t("cf.openLocal"), value: "cancel", primary: true }, { label: t("cf.cloudWins"), value: "takeCloud" }],
        })
      : await lockSyncGate<"keepMine" | "takeCloud" | "cancel">({
          title: t("cf.title"), message: t("cf.bodyPush", { name: n }), note: t("cf.noteKeptSafe"),
          actions: [{ label: t("cf.localWins"), value: "keepMine", primary: true }, { label: t("cf.cloudWins"), value: "takeCloud" }, { label: t("common.cancel"), value: "cancel" }],
        });
    return choice ?? "cancel";
  },

  reportError: (err: unknown, level): void => {
    if ((err as { name?: string } | null)?.name === "CloudNetworkError") {
      reportError(err, "log");
      reportError(new Error(t("err.cloudNetwork")), level ?? "error");
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
    let onSkip!: () => void;
    const probe = new Promise<unknown>((res) => { onSkip = () => res(undefined); });
    void lockSyncGate<"skip" | null>({ title: t("cf.checkingCloud"), message: "", showSpinner: true, actions: [{ label: t("cf.skipToOffline"), value: "skip" }] })
      .then((v) => { if (v === "skip") onSkip(); });
    return { probe, settle: () => settleSyncGate(null) };
  },
};
