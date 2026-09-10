// app-store —— @internal/store 的**唯一接缝**（本仓唯一值级 import 点，build.sh lint 守着）。created 2026-09-03 by Claude Fable 5.1
// 只做 config 注入（provider / ui bundle / encryption / crypt / validateAdopt）+ collections 装配 + 窄再导出。
// 消费方拿 requireStore() / auth / prefs / appState / rimeDict；类型用 `import type` 从本文件或 @internal/store 拿。
//
// 姿态（对齐 MASTER §A 与 WeebPaint app-store.ts）：
//   · 身份 = path/name（`YYYYMMDD 标题.txt`，appfolder 根平铺）；v1 的 itemId(GUID) 身份废弃，本地 IDB 新命名空间从零重建（user 2026-09-03：OneDrive 是 SSoT，本地可丢）。
//   · persistence:"app-managed"：登录手势 / 首次保存手势时调 requestStoragePersistence()。
//   · reconcilePolicy:"app-driven"：focus/online/回前台/idle 复查 + 前台轮询由 app 驱动。
//   · encryption 必填表态（0.7.0）：同一 appEncryption 实例；crypt.ext="txt"，密码源 = crypto-state（非交互）。
//   · autoCacheOpenedFile:true：写作稿是 Work，开即留本地（离线可读可写）。
//   · offlineUploadReplay:"auto"：离线新建的稿回线自动补推（草稿本来就该同步，不问）。

import { createStore, createOneDriveProvider, requestStoragePersistence, isCached, isDirty } from "@internal/store";
import type { Store, Collection, OneDriveAuth, CloudProvider } from "@internal/store";
import { APP_ID, CLIENT_ID, AUTHORITY, SCOPES, MSAL_URL, COLLECTIONS } from "./config.ts";
import { storeUI } from "./store-ui.ts";
import { appEncryption } from "./encryption.ts";
import { getPassword } from "./crypto-state.ts";
import { looksLikeTextDoc } from "./doc-model.ts";

const od = createOneDriveProvider({ clientId: CLIENT_ID, scopes: SCOPES, authority: AUTHORITY, msalUrl: MSAL_URL });
/** OneDrive auth 面（signIn/signOut/isSignedIn/onAuthChanged）。 */
export const auth: OneDriveAuth = od.auth;

let _activeFileName: string | null = null;
/** 当前打开的稿（全名）：cloud-gone 去抖 trash 绝不碰它。 */
export function setActiveFileName(name: string | null): void { _activeFileName = name; }

const store: Store = createStore({
  provider: od.provider,
  ui: storeUI,
  appId: APP_ID,
  persistence: "app-managed",
  encryption: appEncryption,
  reconcilePolicy: "app-driven",
  crypt: { ext: "txt", getPassword, makePeek: async () => null },   // peek 空也加密（verifyPassword 靠它便宜验密码）
  // 2.0 两档：txt 走编码链验真；工程 zip 只看魔数 PK\x03\x04（内容在 project/format.ts 解包时再验）。挡的是 captive-portal HTML / 截断字节。
  validateAdopt: async (plain) => { const b = new Uint8Array(await plain.arrayBuffer()); return (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) || looksLikeTextDoc(b); },
  // store 0.13.0（ADR-0008 §7 前置）：云端名 → 身份。默认只去尾一个 .zip 会把明文工程 `X.webxiaoheiwu.zip` 当加密容器；
  //   本 app 规则 = 去掉 .zip 后剩下的仍是本 app 合法身份（.txt / .webxiaoheiwu.zip）才算加密件。
  toName: (cloudName) => (cloudName.endsWith(".zip") && /(\.txt|\.webxiaoheiwu\.zip)$/i.test(cloudName.slice(0, -4))) ? cloudName.slice(0, -4) : cloudName,
  autoCacheOpenedFile: true,
  offlineUploadReplay: "auto",
  signedIn: () => od.auth.isSignedIn(),
  activeFileName: () => _activeFileName,
});

export function requireStore(): Store { return store; }

// ── collections（app schema；名字见 config.COLLECTIONS）──
export const prefs: Collection = store.collection(COLLECTIONS.prefs);
export const appState: Collection = store.collection(COLLECTIONS.appState);
export const rimeDict: Collection = store.collection(COLLECTIONS.rimeDict);

/** boot 门：hydrate 三个 collection（本地快、离线 OK、不碰网；云端后台对齐）。 */
export async function initCollections(): Promise<void> {
  await Promise.all([prefs.init(), appState.init(), rimeDict.init()]);
}
/** 事件驱动对齐（focus/online/idle 复查）——读 status，别只 await。 */
export async function reconcileCollections(): Promise<void> {
  await Promise.allSettled([prefs.reconcileWithRemote(), appState.reconcileWithRemote(), rimeDict.reconcileWithRemote()]);
}
export async function flushCollections(): Promise<void> {
  await Promise.allSettled([prefs.flushLocal(), appState.flushLocal(), rimeDict.flushLocal()]);
}

export { requestStoragePersistence, isCached, isDirty };
export { wipeAppNamespace, scanAppNamespace } from "@internal/store";   // maintenance 面经接缝转口（factory-reset.ts 消费；库内 typed consent）
/** 还原出厂前置：释放本 store 实例（否则库进 blocked 报告）。之后任何面抛 StoreDisposedError——只能 reload。 */
export async function disposeStore(): Promise<void> { await store.dispose(); }
export type { Store, Collection, OneDriveAuth };
