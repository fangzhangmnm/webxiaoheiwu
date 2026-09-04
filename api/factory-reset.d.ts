export interface FactoryResetDeps {
    setStatus: (msg: string, opts?: {
        error?: boolean;
    }) => void;
    /** 未同步的稿数（dirty / local-only + 编辑器未落盘）。>0 = 拒绝。 */
    unsyncedCount: () => Promise<number>;
    /** wipe 前收口：flush 编辑器与 collections、清空编辑器（之后 store 就 dispose 了）。 */
    beforeWipe: () => Promise<void>;
}
/** 还原出厂主流程（设置页按钮调）。全程 in-app sheet。 */
export declare function runFactoryReset(d: FactoryResetDeps): Promise<void>;
