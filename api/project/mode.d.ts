import { type OpenResult } from "./session.ts";
import { type LocalHome } from "./local-home.ts";
import { type NodeKind } from "./format.ts";
import type { SyncKind } from "../editor.ts";
export type ProjectHome = {
    kind: "store";
    name: string;
} | {
    kind: "local";
    home: LocalHome;
};
export interface ProjectModeDeps {
    editorEl: HTMLTextAreaElement;
    /** 章节名框（纸面顶部；工程模式才显示）：显示当前节点名（不带 .txt），改了 = 改名。图片页显示 stem，扩展名锁死。 */
    titleEl: HTMLInputElement;
    /** 图片页视图（2.1）：#pageImage 容器 / <img> / 元信息行。当前页是图片时 textarea 让位。 */
    imageBox: HTMLElement;
    imageEl: HTMLImageElement;
    imageMeta: HTMLElement;
    /** 图片元信息行文案（宿主 i18n）。 */
    imageMetaText: (o: {
        name: string;
        w: number;
        h: number;
        bytes: number;
    }) => string;
    setStatus: (text: string, opts?: {
        error?: boolean;
        unsynced?: boolean;
    }) => void;
    setState: (text: string, opts?: {
        error?: boolean;
        unsynced?: boolean;
    }) => void;
    isSignedIn: () => boolean;
    /** 身份/节点/脏态变了 → 顶栏 + 边栏重画。 */
    onChanged: () => void;
    onBeforeLoad?: () => void;
    /** 新节点 / 分裂的名字框（app 注入 in-app sheet）。返回 null = 取消。 */
    askName: (title: string, def: string, hint: string) => Promise<string | null>;
    /** 加密：解锁循环（手势里才调）；锁态查询；锁态变化订阅（crypto-state）。 */
    isUnlocked: () => boolean;
    ensureUnlocked: () => Promise<boolean>;
    onLockChange: (cb: (unlocked: boolean) => void) => void;
}
export declare function createProjectMode(d: ProjectModeDeps): {
    active: () => boolean;
    canEdit: () => boolean;
    name: () => string | null;
    displayName: () => string | null;
    syncKind: () => SyncKind;
    stateText: () => string;
    home: () => ProjectHome | null;
    session: () => {
        open: (projectName: string) => Promise<OpenResult>;
        create: (projectName: string, firstNode: string) => void;
        close: () => void;
        flush: (push: boolean, opts?: {
            force?: boolean;
        }) => Promise<{
            wrote: boolean;
            pushed?: boolean;
        }>;
        toBlob: () => Promise<Blob>;
        adoptName: (newName: string) => void;
        setBack: (list: readonly string[]) => void;
        readonly name: string | null;
        readonly dirty: boolean;
        readonly readOnly: boolean;
        readonly project: import("./format.ts").Project;
        current: () => string | null;
        currentText: () => string;
        setCurrentText: (text: string) => boolean;
        jump: (target: string) => string;
        spawn: (newName: string, selectedText: string) => string;
        addLink: (to: string, at?: "bottom" | "top" | undefined) => boolean;
        removeLink: (to: string) => boolean;
        setLinksOrder: (list: string[]) => void;
        rename: (from: string, to: string) => void;
        remove: (target: string) => boolean;
        discard: (target: string, prefix: string, prefixes?: readonly string[] | undefined) => {
            renamed: {
                from: string;
                to: string;
            }[];
            detached: number;
        };
        purge: (target: string, prefixes: readonly string[]) => string[];
        setReadOnly: (v: boolean) => void;
        cutIncoming: (from: string) => boolean;
        addBytesPage: (pageName: string, bytes: Uint8Array<ArrayBufferLike>) => string;
        replaceBytes: (target: string, bytes: Uint8Array<ArrayBufferLike>) => void;
        currentBytes: () => Uint8Array | null;
        bytesOf: (target: string) => Uint8Array | null;
        setThumbnail: (png: Uint8Array<ArrayBufferLike> | null) => void;
        thumbnail: () => Uint8Array | null;
        treeUp: (target: string) => boolean;
        treeDown: (target: string) => boolean;
        treeOutdent: (target: string) => boolean;
        treeIndent: (target: string) => boolean;
        treeDetach: (target: string) => number | null;
        archiveAfter: (target: string, anchor: string) => void;
        archiveUnder: (target: string, parent: string) => void;
        archiveAtEnd: (target: string) => void;
        newSibling: (newName: string) => import("./graph.ts").InsertResult;
        newChild: (newName: string) => import("./graph.ts").InsertResult;
        neighborhood: () => {
            current: null;
            inTree: boolean;
            parent: null;
            siblings: string[];
            children: string[];
            links: string[];
            incoming: string[];
            prev: null;
            next: null;
        } | {
            current: string;
            inTree: boolean;
            parent: string | null;
            siblings: string[];
            children: string[];
            links: string[];
            incoming: string[];
            prev: string | null;
            next: string | null;
        };
        sidebar: () => string[];
        backlinksOf: (target: string) => string[];
        find: (q: string, limit?: number) => string[];
        exists: (target: string) => boolean;
        pathOf: (target: string) => string[];
        isInTree: (target: string) => boolean;
        order: () => string[];
        exportBranch: (target: string) => string;
        canMutate: () => boolean;
    } | null;
    encrypted: () => boolean;
    locked: () => boolean;
    unlock: () => Promise<boolean>;
    toggleEncryption: (confirmDecrypt: () => Promise<boolean>, busy: <T>(label: string, fn: () => Promise<T>) => Promise<T>) => Promise<void>;
    readOnly: () => boolean;
    toggleReadOnly: () => Promise<void>;
    openStore: (projectName: string, opts?: {
        promptUnlock?: boolean;
    }) => Promise<boolean>;
    openLocal: (lh: LocalHome) => Promise<boolean>;
    createInStore: (projectName: string, firstNode: string) => Promise<void>;
    adoptName: (newName: string) => void;
    close: () => Promise<void>;
    flushLocal: () => Promise<void>;
    pushNow: () => Promise<void>;
    noteExternalEdit: () => void;
    pendingLocalSave: () => boolean;
    lastPersistMs: () => number;
    jump: (target: string) => void;
    goBack: () => boolean;
    goForward: () => boolean;
    canGoBack: () => boolean;
    canGoForward: () => boolean;
    prevPage: () => boolean;
    nextPage: () => boolean;
    neighborhood: () => {
        current: null;
        inTree: boolean;
        parent: null;
        siblings: string[];
        children: string[];
        links: string[];
        incoming: string[];
        prev: null;
        next: null;
    } | {
        current: string;
        inTree: boolean;
        parent: string | null;
        siblings: string[];
        children: string[];
        links: string[];
        incoming: string[];
        prev: string | null;
        next: string | null;
    } | null;
    spawnFromSelection: () => Promise<boolean>;
    newNode: (rawName: string, text?: string) => boolean;
    newSibling: (rawName: string) => boolean;
    newChild: (rawName: string) => boolean;
    treeMove: (target: string, op: "up" | "down" | "outdent" | "indent") => boolean;
    detachFromTree: (target: string) => boolean;
    archiveAfterCurrent: (target: string) => boolean;
    archiveUnderCurrent: (target: string) => boolean;
    exportBranchText: (target: string) => string;
    addLink: (to: string) => boolean;
    removeLink: (to: string) => boolean;
    moveLink: (to: string, dir: 1 | -1) => boolean;
    lastDetached: () => number;
    discardPage: (target: string) => boolean;
    lastDiscarded: () => {
        from: string;
        to: string;
    }[];
    subtreeCount: (target: string) => number;
    isDiscarded: (target: string) => boolean;
    purgePage: (target: string) => boolean;
    isInTree: (n: string) => boolean;
    commitTitle: () => boolean;
    focusTitle: () => void;
    nodeNames: () => string[];
    current: () => string | null;
    currentKind: () => NodeKind | null;
    cutIncoming: (from: string) => boolean;
    backlinksOfCurrent: () => string[];
    backlinksOfPage: (target: string) => string[];
    addImagePages: (items: {
        name: string;
        bytes: Uint8Array;
    }[], opts?: {
        as?: "sibling" | "child" | "link";
    } | undefined) => boolean;
    lastAdded: () => string[];
    lastPlaced: () => "link" | "sibling" | "child";
    pageBytes: () => Uint8Array | null;
    replaceImage: (bytes: Uint8Array<ArrayBufferLike>, ext: string) => boolean;
    setThumbnail: (png: Uint8Array<ArrayBufferLike> | null) => boolean;
    thumbnail: () => Uint8Array | null;
};
export type ProjectMode = ReturnType<typeof createProjectMode>;
/** spawn 默认名：选中文字首行前 12 个字（去路径字符）。空 → ""（调用方退到章节名）。 */
export declare function defaultNodeName(sel: string): string;
/** 用户输入 → 合法节点名（没扩展名补 .txt；非法 → null）。 */
export declare function normalizeNodeName(raw: string): string | null;
