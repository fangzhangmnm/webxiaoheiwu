import { requestStoragePersistence, isCached, isDirty } from "@internal/store";
import type { Store, Collection, OneDriveAuth } from "@internal/store";
/** OneDrive auth 面（signIn/signOut/isSignedIn/onAuthChanged）。 */
export declare const auth: OneDriveAuth;
/** 问云端一次、真走一趟网（闸门「离线继续」期间静默再试用；家族设计稿 cloud-gate §3，WeebPaint / KudsRocket 同形）：名字不存在 = 云端答了 null，也算通；不通 = 抛。
 *  **不经 store**：选了离线时 store 不出网（isOnline = cloudOnline），这一问正是要在放开离线之前先确认网通。只读、零记账。added 2026-11-04 by Claude Opus 5.5 */
export declare function cloudReachable(): Promise<void>;
/** 当前打开的稿（全名）：cloud-gone 去抖 trash 绝不碰它。 */
export declare function setActiveFileName(name: string | null): void;
/** 加密书的封面尾片（ADR-0012）：明文是书（zip 魔数）就抽封面；txt 稿 / 没封面 → null。库封容器时用，docs.ts「先封再存」也用同一个。 */
export declare function makeDocPeek(plain: Blob): Promise<Uint8Array | null>;
export declare function requireStore(): Store;
export declare const prefs: Collection;
export declare const appState: Collection;
export declare const rimeDict: Collection;
export declare const rimeEncDict: Collection;
/** boot 门：hydrate 四个 collection（本地快、离线 OK、不碰网；云端后台对齐）。 */
export declare function initCollections(): Promise<void>;
/** 事件驱动对齐（focus/online/idle 复查）——读 status，别只 await。 */
export declare function reconcileCollections(): Promise<void>;
export declare function flushCollections(): Promise<void>;
export { requestStoragePersistence, isCached, isDirty };
export { wipeAppNamespace, scanAppNamespace } from "@internal/store";
/** 还原出厂前置：释放本 store 实例（否则库进 blocked 报告）。之后任何面抛 StoreDisposedError——只能 reload。 */
export declare function disposeStore(): Promise<void>;
export type { Store, Collection, OneDriveAuth };
