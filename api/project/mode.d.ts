import { type OpenResult } from "./session.ts";
import { type LocalHome } from "./local-home.ts";
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
    /** 章节名框（纸面顶部；工程模式才显示）：显示当前节点名（不带 .txt），改了 = 改名。 */
    titleEl: HTMLInputElement;
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
        addLink: (to: string, at?: "top" | "bottom" | undefined) => boolean;
        removeLink: (to: string) => boolean;
        setLinksOrder: (links: string[]) => void;
        rename: (from: string, to: string) => void;
        remove: (target: string) => boolean;
        drop: (to: string, orphanPrefix: string) => string | null;
        purge: (target: string) => boolean;
        orphan: (target: string) => boolean;
        setReadOnly: (v: boolean) => void;
        sidebar: () => {
            name: string;
            stub: boolean;
        }[];
        backlinksOf: (target: string) => string[];
        find: (q: string, limit?: number) => string[];
        exists: (target: string) => boolean;
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
    jump: (target: string) => void;
    goBack: () => boolean;
    canGoBack: () => boolean;
    spawnFromSelection: () => Promise<boolean>;
    newNode: (rawName: string) => boolean;
    addLink: (to: string) => boolean;
    removeLink: (to: string) => boolean;
    moveLink: (to: string, dir: 1 | -1) => boolean;
    dropRef: (to: string) => boolean;
    lastDropped: () => string | null;
    purgeOrphan: (target: string) => boolean;
    isOrphan: (n: string) => boolean;
    commitTitle: () => boolean;
    focusTitle: () => void;
    nodeNames: () => string[];
    current: () => string | null;
};
export type ProjectMode = ReturnType<typeof createProjectMode>;
/** spawn 默认名：选中文字首行前 12 个字（去路径字符）。空 → ""（调用方退到章节名）。 */
export declare function defaultNodeName(sel: string): string;
/** 用户输入 → 合法节点名（没扩展名补 .txt；非法 → null）。 */
export declare function normalizeNodeName(raw: string): string | null;
