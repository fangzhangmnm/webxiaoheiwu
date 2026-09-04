import { requestStoragePersistence, isCached, isDirty } from "@internal/store";
import type { Store, Collection, OneDriveAuth } from "@internal/store";
/** OneDrive auth 面（signIn/signOut/isSignedIn/onAuthChanged）。 */
export declare const auth: OneDriveAuth;
/** 当前打开的稿（全名）：cloud-gone 去抖 trash 绝不碰它。 */
export declare function setActiveFileName(name: string | null): void;
export declare function requireStore(): Store;
export declare const prefs: Collection;
export declare const appState: Collection;
export declare const rimeDict: Collection;
/** boot 门：hydrate 三个 collection（本地快、离线 OK、不碰网；云端后台对齐）。 */
export declare function initCollections(): Promise<void>;
/** 事件驱动对齐（focus/online/idle 复查）——读 status，别只 await。 */
export declare function reconcileCollections(): Promise<void>;
export declare function flushCollections(): Promise<void>;
export { requestStoragePersistence, isCached, isDirty };
export { wipeAppNamespace, scanAppNamespace } from "@internal/store";
/** 还原出厂前置：释放本 store 实例（否则库进 blocked 报告）。之后任何面抛 StoreDisposedError——只能 reload。 */
export declare function disposeStore(): Promise<void>;
export type { Store, Collection, OneDriveAuth };
