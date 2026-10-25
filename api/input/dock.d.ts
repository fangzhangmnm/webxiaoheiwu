import type { NaturalCodeIME } from "../ime.ts";
import type { InputPipeline } from "./pipeline.ts";
import { createSoftKeyboard, type SoftKeyboardDeps } from "./soft-keyboard.ts";
export interface ImeDockDeps {
    ime: NaturalCodeIME;
    pipeline: InputPipeline;
    /** 手机式那一块（#imeDock）与 PC 式悬浮条（#candidateBar）。 */
    dock: HTMLElement;
    floating: HTMLElement;
    labels: SoftKeyboardDeps["labels"] & {
        hide: string;
        prevPage: string;
        nextPage: string;
        toggleMode: string;
    };
    /** 手机键盘底排的话筒键（v2.3.31）：点了 = 纸面话筒钮同一个动作。 */
    onMic?(): void;
    /** 软键盘现在该不该露（设置 + 设备 + 有没有见过实体键盘，app 说了算）。 */
    keyboardWanted(): boolean;
    /** 用户按了「收起键盘」。 */
    onHideRequest(): void;
    /** 那一块的高度变了（露 / 收 / 换布局）：纸面要重算。 */
    onLayout(): void;
}
export interface ImeDock {
    render(): void;
    /** 预热（v2.1.24，user「启动打第一个字的时候会卡」）：把候选条用几个样例候选不可见地画一次，逼浏览器先做样式计算和汉字字形整形——
     *  量过：首键 20–30 ms、后续 7 ms，差额全在主线程首次画候选条（worker 那边只要 1 ms）；预热后首键 = 后续键。空闲时调，正在组字就不动。 */
    warmUp(): void;
    /** 软键盘此刻露着吗。 */
    keyboardShown(): boolean;
    /** 中 / 英 切换了：PC 式悬浮条空着也闪一下芯片（v2.1.26，顶栏不再有「中 / 英」一字；软键盘露着时键盘自己的中 / 英键就是状态，不闪）。 */
    flashMode(): void;
    /** 话筒此刻在键盘里（手机式那一块露着）：纸面的悬浮话筒钮让位（v2.3.31「语音也收进来」）。 */
    micInKeyboard(): boolean;
    /** 再挂一个文档（小窗，v2.3.60）：那里的焦点变化也重画候选。返回解绑。 */
    attachDocument(doc: Document): () => void;
    keyboard: ReturnType<typeof createSoftKeyboard>;
}
export declare function createImeDock(d: ImeDockDeps): ImeDock;
