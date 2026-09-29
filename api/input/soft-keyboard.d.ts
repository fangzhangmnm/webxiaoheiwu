export type KeyboardMode = "zh" | "en";
export type KeyboardForm = "phone" | "tablet";
export interface SoftKeyboardDeps {
    onKey(key: string): void;
    onLiteral(text: string): void;
    onToggleMode(): void;
    /** 键帽上的字（界面语言）。 */
    labels: {
        space: string;
        symbols: string;
        letters: string;
        more: string;
        zh: string;
        en: string;
        enter: string;
        backspace: string;
        shift: string;
    };
}
export interface SoftKeyboard {
    el: HTMLElement;
    setMode(mode: KeyboardMode): void;
    /** 密码框：只有英文层，中 / 英键灰掉。 */
    setMasked(masked: boolean): void;
    setForm(form: KeyboardForm): void;
    /** 这个方案把哪些标点当字母用（微软双拼的 `;`）：字母层多给一个键。 */
    setExtraLetters(keys: string[]): void;
    /** 回到字母层、放开上档（换了文本框 / 收起键盘时）。 */
    reset(): void;
}
export declare function createSoftKeyboard(d: SoftKeyboardDeps): SoftKeyboard;
