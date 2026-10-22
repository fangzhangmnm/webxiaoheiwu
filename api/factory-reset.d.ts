export interface FactoryResetDeps {
    setStatus: (msg: string, opts?: {
        error?: boolean;
    }) => void;
    /** 未同步的稿数（dirty / local-only + 编辑器未落盘）。>0 = 拒绝。 */
    unsyncedCount: () => Promise<number>;
    /** wipe 前收口：flush 编辑器与 collections、清空编辑器（之后 store 就 dispose 了）。 */
    beforeWipe: () => Promise<void>;
}
/** 还原出厂主流程（设置 → 开发者 节的钮调；全程 in-app sheet）。家族规矩 2½（2026-10-21 user「全家swipe的语义统一，然后full swipe应该有二次确定护栏，而且是开发者菜单里面」）：
 *  整个 app 自己的命名空间清成新装；**两步护栏** = ① 说明 sheet（有 N 篇没同步会一起删、不造逃生副本，可取消）② 逐字确认（库内比对）；**不硬拦**——
 *  2026-09-03～10-21 的「有一篇没同步就拒绝」是硬拦，和家规 09-29「app 不许硬拦」打架，同日撤；A12 的「不造逃生副本」照旧。 */
export declare function runFactoryReset(d: FactoryResetDeps): Promise<void>;
