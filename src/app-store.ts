// app-store —— @internal/store 的**唯一接缝**（本仓唯一值级 import 点，build.sh lint 守着）。created 2026-09-03 by Claude Fable 5.1
// 只做 config 注入（provider / ui bundle / encryption / crypt / validateAdopt）+ collections 装配 + 窄再导出。
// 消费方拿 requireStore() / auth / prefs / appState / rimeDict / rimeEncDict；类型用 `import type` 从本文件或 @internal/store 拿。
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
import { DOC_KINDS } from "./identifiers.ts";
import { storeUI } from "./store-ui.ts";
import { appEncryption } from "./encryption.ts";
import { getPassword } from "./crypto-state.ts";
import { looksLikeTextDoc } from "./doc-model.ts";
import { zipReadEntry } from "./zip.ts";
import { THUMBNAIL_ENTRY } from "./project/format.ts";
import { cloudOnline } from "./cloud-gate.ts";

const od = createOneDriveProvider({ clientId: CLIENT_ID, scopes: SCOPES, authority: AUTHORITY, msalUrl: MSAL_URL });
/** OneDrive auth 面（signIn/signOut/isSignedIn/onAuthChanged）。 */
export const auth: OneDriveAuth = od.auth;
/** 问云端一次、真走一趟网（闸门「离线继续」期间静默再试用；家族设计稿 cloud-gate §3，WeebPaint / KudsRocket 同形）：名字不存在 = 云端答了 null，也算通；不通 = 抛。
 *  **不经 store**：选了离线时 store 不出网（isOnline = cloudOnline），这一问正是要在放开离线之前先确认网通。只读、零记账。added 2026-11-04 by Claude Opus 5.5 */
export async function cloudReachable(): Promise<void> { await od.provider.getItemByPath(".reachable-probe"); }

let _activeFileName: string | null = null;
/** 当前打开的稿（全名）：cloud-gone 去抖 trash 绝不碰它。 */
export function setActiveFileName(name: string | null): void { _activeFileName = name; }

/** 加密书的封面尾片（ADR-0012）：明文是书（zip 魔数）就抽封面；txt 稿 / 没封面 → null。库封容器时用，docs.ts「先封再存」也用同一个。 */
export async function makeDocPeek(plain: Blob): Promise<Uint8Array | null> {
  const head = new Uint8Array(await plain.slice(0, 4).arrayBuffer());
  if (!(head.length === 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04)) return null;
  try { return await zipReadEntry(plain, THUMBNAIL_ENTRY); } catch { return null; }
}

const store: Store = createStore({
  provider: od.provider,
  ui: storeUI,
  appId: APP_ID,
  persistence: "app-managed",
  encryption: appEncryption,
  reconcilePolicy: "app-driven",
  // peek（2.1，ADR-0012）：加密书的封面另封成密文尾片——明文是书（zip 魔数）就抽 Thumbnails/thumbnail.png；txt 稿 / 没封面 → null（空 peek 也加密，verifyPassword 靠它便宜验密码）。
  crypt: { getPassword, makePeek: makeDocPeek },
  // 2.0 两档：txt 走编码链验真；工程 zip 只看魔数 PK\x03\x04（内容在 project/format.ts 解包时再验）。挡的是 captive-portal HTML / 截断字节。
  validateAdopt: async (plain) => { const b = new Uint8Array(await plain.arrayBuffer()); return (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) || looksLikeTextDoc(b); },
  // 文档种类表（store 0.16，提案 = 库仓 ai-docs/20260929-proposal-doc-types.md）：身份怎么切、云端名是不是加密容器、取回撞名戳插在哪、
  //   哪些能 zip() / 能加密，全由这张表推导。同一张表 src/identifiers.ts 也造了一份给纯代码用。
  docKinds: DOC_KINDS,
  autoCacheOpenedFile: true,
  offlineUploadReplay: "auto",
  signedIn: () => od.auth.isSignedIn(),
  isOnline: cloudOnline,   // 2026-11-03 闸门：选了「离线继续」= 库一条网都不打（家族设计稿 cloud-gate §3）
  activeIdentifier: () => _activeFileName,
});

export function requireStore(): Store { return store; }

// ── collections（app schema；名字见 config.COLLECTIONS）──
export const prefs: Collection = store.collection(COLLECTIONS.prefs);
export const appState: Collection = store.collection(COLLECTIONS.appState);
export const rimeDict: Collection = store.collection(COLLECTIONS.rimeDict);
export const rimeEncDict: Collection = store.collection(COLLECTIONS.rimeEncDict);

/** boot 门：hydrate 四个 collection（本地快、离线 OK、不碰网；云端后台对齐）。 */
export async function initCollections(): Promise<void> {
  await Promise.all([prefs.init(), appState.init(), rimeDict.init(), rimeEncDict.init()]);
}
/** 事件驱动对齐（focus/online/idle 复查）——读 status，别只 await。 */
export async function reconcileCollections(): Promise<void> {
  if (!cloudOnline()) return;   // 2026-11-03 闸门：库的 collection 不看 isOnline（store 2.2.3 create-store.js collection() 没把它递给 createCollection），选了离线这里自己不去问；已报家族工单 D 报告
  await Promise.allSettled([prefs.reconcileWithRemote(), appState.reconcileWithRemote(), rimeDict.reconcileWithRemote(), rimeEncDict.reconcileWithRemote()]);
}
export async function flushCollections(): Promise<void> {
  await Promise.allSettled([prefs.flushLocal(), appState.flushLocal(), rimeDict.flushLocal(), rimeEncDict.flushLocal()]);
}

export { requestStoragePersistence, isCached, isDirty };
export { wipeAppNamespace, scanAppNamespace } from "@internal/store";   // maintenance 面经接缝转口（factory-reset.ts 消费；库内 typed consent）
/** 还原出厂前置：释放本 store 实例（否则库进 blocked 报告）。之后任何面抛 StoreDisposedError——只能 reload。 */
export async function disposeStore(): Promise<void> { await store.dispose(); }
export type { Store, Collection, OneDriveAuth };
