import type { SyncState, SaveResult, FreshResult, DelResult, TrashItem, WatchFolderErrorPhase } from "@internal/store";
import { type TextEncodingName } from "./doc-model.ts";
export interface DocListItem {
    name: string;
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
    items: DocListItem[];
    complete: boolean;
    stale: boolean;
}
export declare function invalidateEncryptedFlag(name: string): void;
export declare function watchDocs(cb: (frame: DocListFrame) => void, opts?: {
    onError?: (err: unknown, phase: WatchFolderErrorPhase) => void;
}): () => void;
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
/** 新建（惰性物化：编辑器在首次有内容时才调）。撞名自动追加 " 1"…；返回最终身份。 */
export declare function createDoc(title: string, text: string, date?: string): Promise<string>;
export interface RenameResult {
    name: string;
    oldKept?: boolean;
    cloudDeferred?: boolean;
}
/** 改标题 = 改身份（tryMove）。撞名追加后缀。返回 {name(未变 → 原名), oldKept(库把旧名原地留着), cloudDeferred(云端腿待推)}；失败 → null（调用方报错）。 */
export declare function renameDoc(name: string, newTitle: string): Promise<RenameResult | null>;
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
