export interface GalleryHostDeps {
    mountEl: HTMLElement;
    fullEl: HTMLElement;
    activeName: () => string | null;
    isDirty: () => boolean;
    /** 打开任一身份（txt / 工程）。返回 true = 编辑器已切过去。 */
    openAny: (name: string, opts?: {
        promptUnlock?: boolean;
    }) => Promise<boolean>;
    renameActive: () => Promise<void>;
    pushNow: () => Promise<void>;
    flushLocal: () => Promise<void>;
    ensureUnlocked: () => Promise<boolean>;
    setStatus: (text: string, opts?: {
        error?: boolean;
    }) => void;
    /** 「上次在哪个夹」跟着编辑器走（打开图库时跳到当前稿的夹）。 */
    currentDir: () => string;
    onOpened?: () => void;
    onClosed?: () => void;
}
export declare function initGalleryHost(d: GalleryHostDeps): {
    open: () => Promise<void>;
    close: () => void;
    isOpen: () => boolean;
    refresh: () => void | undefined;
    setView: (v: "files" | "trash") => void;
    getView: () => "files" | "trash";
    emptyTrash: (scope: "local" | "cloud" | "both") => void;
    currentFolder: () => string;
    invalidateEncrypted: (name: string) => void | undefined;
};
export type GalleryHost = ReturnType<typeof initGalleryHost>;
