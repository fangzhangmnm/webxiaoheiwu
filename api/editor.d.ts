export interface StatusOpts {
    error?: boolean;
    unsynced?: boolean;
}
export type SyncKind = "none" | "locked" | "unavailable" | "encryptPending" | "local" | "offline" | "unsynced" | "clean";
export interface EditorDeps {
    editor: HTMLTextAreaElement;
    /** 纸的滚动容器（main.surface；v2.1.26 一张纸模型：正文框自己不滚，打开落在开头 = 纸滚回顶）。 */
    /** 纸在哪滚：只用 scrollTop（换页回到开头 / 重载放回原位）。平时 = main.surface，小窗开着 = 小窗的 body（v2.3.60，app.ts paperScroll）。 */
    sheet: {
        scrollTop: number;
    };
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
    /** 云端新版正在换掉本地这一篇（干净快进）：true = 开始，false = 新版已载入 / 没换成。app 据此升 / 收整屏等待
     *  （user 2026-09-29「wxhw 要不要快进的时候就 waiting，这样稳一点。写书本来就没有画画那么短平快」）。 */
    onReplacing?: (on: boolean) => void;
    /** 编辑框现在归不归文本稿管（v3.0.19 第三层：app 注入 `() => !project.active()`）。为假时保存不写、报错——书开着时这里的保存一个字节都不落。 */
    ownsTextarea?: () => boolean;
    /** 离开这一篇时，没存上的字存不进去、另存一份也没成（v3.0.19，user 2026-11-10「同意，挽留，加出口，这时候应该有导出对吧」）：
     *  app 弹面问人。"go" = 人导出了 / 说丢掉，可以走；"stay" = 留在这一篇；"not-asked" = 现在弹不了面（别的面 / 遮罩开着），按留下算。没给 = 一律留下（v3.0.18）。 */
    onCannotKeep?: (o: {
        name: string;
        text: string;
        error: string;
    }) => Promise<"go" | "stay" | "not-asked">;
}
export interface EditorState {
    name: string | null;
    pendingDate: string | null;
    pendingDir: string;
    pendingTitle: string | null;
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
    refreshIfClean: () => Promise<string | undefined>;
    toggleEncryption: (confirmDecrypt: () => Promise<boolean>, busy: <T>(label: string, fn: () => Promise<T>) => Promise<T>) => Promise<void>;
    rekeyToCurrent: (busy: <T>(label: string, fn: () => Promise<T>) => Promise<T>) => Promise<void>;
    noteExternalEdit: () => void;
    moveTo: (dir: string) => Promise<string | null>;
    currentDir: () => string;
    renameTo: (raw: string) => Promise<boolean>;
    displayName: () => string | null;
    canEdit: () => boolean;
    statusForDoc: () => string;
    syncKind: () => SyncKind;
    isDirty: () => boolean;
    /** 编辑器里有没存进本地的字（isDirty 还算着没推上云的；这个只管落盘没有）。 */
    hasUnsavedText: () => boolean;
    isUnlockedDoc: () => boolean;
    lastOpenName: () => string | null;
    /** 工程模式 / 书库接管前：离开这一篇（冻结 → 保存全部做完）后静默、放下身份；resume 后恢复守卫。parked 期间 canEdit/isDirty 恒 false，syncKind 由 app 门面绕开。
     *  返回 false = 没放下（没存上的字也没能另存：人留在这一篇上，调用方别接着换）。 */
    park: () => Promise<boolean>;
    /** 没有身份的那一刻（放下之后、下一篇 show 之前）：编辑框只读，里面的字不算没存（不归任何一篇）。 */
    resume: () => void;
    /** 回收站那条路：离开这一篇（冻结 → 保存全部做完）。**必须紧跟 clear()**（冻结由它解开）。返回 false = 没离开（存不上、另存不了，人选了留下 / 被别的换稿压过）：调用方别扔、别 clear。 */
    leave: () => Promise<boolean>;
    /** 离开前另存成功的那句提示（书那边开书会用「加载中…」盖掉它）：取走，调用方开完再说一次。 */
    takeLeaveNote: () => string | null;
    isParked: () => boolean;
};
export type Editor = ReturnType<typeof createEditor>;
