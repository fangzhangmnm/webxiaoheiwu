export interface StatusOpts {
    error?: boolean;
    unsynced?: boolean;
}
export interface EditorDeps {
    editor: HTMLTextAreaElement;
    titleInput: HTMLInputElement;
    wordCount: HTMLElement;
    setStatus: (text: string, opts?: StatusOpts) => void;
    isSignedIn: () => boolean;
    /** 当前稿变了（身份/加密态/只读态）→ 抽屉/顶栏重画。 */
    onDocChanged: () => void;
    /** 解锁循环（busy 外）；返回是否已解锁。 */
    ensureUnlocked: () => Promise<boolean>;
    /** 「这篇稿用的不是当前密码」循环（app 注入：弹框 + verifyDocPassword）。 */
    ensureFileUnlocked: (name: string) => Promise<boolean>;
}
export interface EditorState {
    name: string | null;
    pendingDate: string | null;
    encrypted: boolean;
    locked: boolean;
    readOnly: boolean;
    unavailable: boolean;
}
export declare function createEditor(d: EditorDeps): {
    state: EditorState;
    open: (name: string, opts?: {
        keepCaret?: boolean;
    }) => Promise<boolean>;
    newDoc: (opts?: {
        encrypted?: boolean;
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
    canEdit: () => boolean;
    statusForDoc: () => string;
    renderWordCount: () => void;
    isDirty: () => boolean;
    isUnlockedDoc: () => boolean;
    lastOpenName: () => string | null;
};
export type Editor = ReturnType<typeof createEditor>;
