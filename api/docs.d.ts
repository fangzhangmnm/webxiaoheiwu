import type { SyncState, SaveResult, FreshResult, DelResult, TrashItem, WatchFolderErrorPhase } from "@internal/store";
import { type TextEncodingName } from "./doc-model.ts";
export interface DocListItem {
    name: string;
    dir: string;
    stem: string;
    title: string;
    date: string | null;
    syncState: SyncState;
    cached: boolean;
    dirty: boolean;
    /** true/false = 本地字节已判；null = 未缓存、不知道（列表不为此下载）。 */
    encrypted: boolean | null;
    lastModified?: number;
    size?: number;
}
export interface DocListFrame {
    folder: string;
    items: DocListItem[];
    folders: string[];
    complete: boolean;
    stale: boolean;
}
export declare function readProjectBlob(name: string): Promise<Blob | null>;
export declare function pullProjectIfClean(name: string): Promise<FreshResult>;
/** 本地字节是不是加密容器（两档：txt 走 RawFile、工程走 ZipFile）。 */
export declare function isDocEncrypted(name: string): Promise<boolean>;
export declare function saveProjectBlob(name: string, blob: Blob, opts: {
    push: boolean;
}): Promise<SaveResult>;
/** 新建工程文件：撞名自动追加 " 1"…；返回最终身份（全路径）。 */
export declare function createProjectDoc(title: string, blob: Blob, date?: string, dir?: string): Promise<string>;
export declare function invalidateEncryptedFlag(name: string): void;
export declare function watchDocs(folder: string, cb: (frame: DocListFrame) => void, opts?: {
    onError?: (err: unknown, phase: WatchFolderErrorPhase) => void;
}): () => void;
/** 一次性拿某夹的 immediate 子夹名（移动稿的目标列表用）：订阅一帧就退。 */
export declare function snapshotFolders(folder?: string): Promise<string[]>;
export declare function newFolder(path: string): Promise<void>;
/** 只删空夹（库内强制证实为空；非空/无法确认 → 抛）。 */
export declare function deleteFolder(path: string): Promise<void>;
/** 有未推字节的稿数（全库标量，不列名字）——出厂重置等门用。 */
export declare function dirtyDocCount(): Promise<number>;
export type ReadDocResult = {
    kind: "ok";
    text: string;
    encoding: TextEncodingName;
    encrypted: boolean;
} | {
    kind: "locked";
} | {
    kind: "other-password";
} | {
    kind: "unavailable";
};
export declare function readDoc(name: string): Promise<ReadDocResult>;
export declare function saveDoc(name: string, text: string, opts: {
    push: boolean;
}): Promise<SaveResult>;
/** 新建（惰性物化：编辑器在首次有内容时才调）。撞名自动追加 " 1"…；返回最终身份（全路径）。 */
export declare function createDoc(title: string, text: string, date?: string, dir?: string): Promise<string>;
export interface RenameResult {
    name: string;
    oldKept?: boolean;
    cloudDeferred?: boolean;
}
/** 改文件名 = 改身份（tryMove；ADR-0007：文件名是管理句柄不是标题）。撞名追加后缀。
 *  ⚠ 改名后新名不带日期前缀 → 名字降序排序下这篇会跳位——**user 2026-09-09 拍板「是 feature 不是 bug」**，别「修」（ai-docs/20260909-sync-hardening-round-vs-weebpaint.md §4）。返回 {name(未变 → 原名), oldKept(库把旧名原地留着), cloudDeferred(云端腿待推)}；失败 → null（调用方报错）。 */
export declare function renameDoc(name: string, newTitle: string): Promise<RenameResult | null>;
/** 转加密后藏标题：改成日期码名 `yyyymmdd-hex4`（日期沿用原名的 8 位前缀，没有则今天）。已是日期码 → 原名不动。失败 → null。 */
export declare function renameDocToOpaque(name: string): Promise<RenameResult | null>;
/** 移到别的夹（身份变 = tryMove，同名撞则追加后缀）。toDir "" = 根。 */
export declare function moveDoc(name: string, toDir: string): Promise<RenameResult | null>;
export declare function trashDoc(name: string): Promise<DelResult>;
/** 事件驱动干净快进（focus/online/idle 复查）。status: fast-forwarded → 调用方整体重载；escaped/其余 → 不动。 */
export declare function pullDocIfClean(name: string, opts?: {
    onReplaceStart?: () => void;
    probe?: Promise<unknown>;
}): Promise<FreshResult>;
export declare function setActiveDoc(name: string | null): void;
export declare function encryptDoc(name: string): Promise<{
    status: string;
}>;
export declare function decryptDoc(name: string): Promise<{
    status: string;
}>;
/** 换钥匙（store 0.12.0 rekey）：密文→密文，旧钥经 crypto-state seam（这篇自己的 ?? 当前）、新钥显式传入，**明文不上云**。
 *  换密码迁移 / 横幅「换成当前密码」只准走这个——以前 decryptDoc→encryptDoc 的中间态把明文 push 上 OneDrive（版本历史永久留明文；2026-09-09 加密合规审计 ①②）。 */
export declare function rekeyDoc(name: string, newPassword: string): Promise<{
    status: string;
}>;
export declare function verifyDocPassword(name: string, pw: string): Promise<boolean>;
export interface TrashDocItem {
    name: string;
    stem: string;
    ts: string | null;
    side: TrashItem["side"];
    encrypted: boolean;
    conflictLive: boolean;
    localKey: string | null;
    cloudRef: string | null;
}
export declare function listTrash(): Promise<TrashDocItem[]>;
export declare function restoreDoc(it: TrashDocItem): Promise<string>;
export declare function purgeDoc(it: TrashDocItem): Promise<void>;
export declare function emptyTrash(): Promise<number>;
