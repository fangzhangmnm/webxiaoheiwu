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
    };
    /** 软键盘现在该不该露（设置 + 设备 + 有没有见过实体键盘，app 说了算）。 */
    keyboardWanted(): boolean;
    /** 用户按了「收起键盘」。 */
    onHideRequest(): void;
    /** 那一块的高度变了（露 / 收 / 换布局）：纸面要重算。 */
    onLayout(): void;
}
export interface ImeDock {
    render(): void;
    /** 软键盘此刻露着吗。 */
    keyboardShown(): boolean;
    keyboard: ReturnType<typeof createSoftKeyboard>;
}
export declare function createImeDock(d: ImeDockDeps): ImeDock;
