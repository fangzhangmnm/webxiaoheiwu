export interface StatusOpts {
    error?: boolean;
    unsynced?: boolean;
}
export type SyncKind = "none" | "locked" | "unavailable" | "encryptPending" | "local" | "offline" | "unsynced" | "clean";
export interface EditorDeps {
    editor: HTMLTextAreaElement;
    titleInput: HTMLInputElement;
    setStatus: (text: string, opts?: StatusOpts) => void;
    setState: (text: string, opts?: StatusOpts) => void;
    isSignedIn: () => boolean;
    /** 当前稿变了（身份/加密态/只读态）→ 抽屉/顶栏重画。 */
    onDocChanged: () => void;
    /** 解锁循环（busy 外）；返回是否已解锁。 */
    ensureUnlocked: () => Promise<boolean>;
    /** 「这篇稿用的不是当前密码」循环（app 注入：弹框 + verifyDocPassword）。 */
    ensureFileUnlocked: (name: string) => Promise<boolean>;
    /** 切稿/新建/清空前（语音会话必须先中止——转写结果不能落进别的稿）。 */
    onBeforeLoad?: () => void;
}
export interface EditorState {
    name: string | null;
    pendingDate: string | null;
    pendingDir: string;
    encrypted: boolean;
    locked: boolean;
    readOnly: boolean;
    unavailable: boolean;
}
export declare function createEditor(d: EditorDeps): {
    state: EditorState;
    open: (name: string, opts?: {
        keepCaret?: boolean;
        promptUnlock?: boolean;
    }) => Promise<boolean>;
    newDoc: (opts?: {
        encrypted?: boolean;
        dir?: string;
    }) => Promise<boolean>;
    clear: () => void;
    reload: (name: string) => Promise<void>;
    flushLocal: () => Promise<void>;
    pushNow: () => Promise<void>;
    refreshIfClean: () => Promise<void>;
    toggleReadOnly: () => void;
    toggleEncryption: (confirmDecrypt: () => Promise<boolean>, busy: <T>(label: string, fn: () => Promise<T>) => Promise<T>) => Promise<void>;
    rekeyToCurrent: (busy: <T>(label: string, fn: () => Promise<T>) => Promise<T>) => Promise<void>;
    noteExternalEdit: () => void;
    moveTo: (dir: string) => Promise<string | null>;
    currentDir: () => string;
    canEdit: () => boolean;
    statusForDoc: () => string;
    syncKind: () => SyncKind;
    isDirty: () => boolean;
    isUnlockedDoc: () => boolean;
    lastOpenName: () => string | null;
};
export type Editor = ReturnType<typeof createEditor>;
