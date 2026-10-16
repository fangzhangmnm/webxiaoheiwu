export type KeyboardMode = "zh" | "en";
export type KeyboardForm = "phone" | "tablet";
export interface SoftKeyboardDeps {
    onKey(key: string): void;
    onLiteral(text: string): void;
    onToggleMode(): void;
    /** 「收起键盘」键（v2.1.24 从候选条右侧搬进最下一排最右，像 iPad；候选条整行都留给候选词——user 2026-09-29「那个下箭头的位置也不对，吃掉了候选词需要的宝贵的横向空间」）。 */
    onHide(): void;
    /** 话筒键（手机底排 iPhone 话筒那格；v2.3.31「语音也收进来」）：点了 = 纸面话筒钮同一个动作。 */
    onMic?(): void;
    /** 引号风格（设置项；缺省 curly）：符号层第一层放哪对引号。 */
    quoteStyle?(): "curly" | "corner";
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
        hide: string;
        mic?: string;
        confirm?: string;
    };
}
export interface SoftKeyboard {
    el: HTMLElement;
    /** 外部输入变了（引号风格）：重画键面（有手指按着时等抬手）。 */
    refresh(): void;
    setMode(mode: KeyboardMode): void;
    /** 密码框：只有英文层，中 / 英键灰掉。 */
    setMasked(masked: boolean): void;
    setForm(form: KeyboardForm): void;
    /** 这个方案把哪些标点当字母用（微软双拼的 `;`）：字母层多给一个键。 */
    setExtraLetters(keys: string[]): void;
    /** 回到字母层、放开上档（换了文本框 / 收起键盘时）。 */
    reset(): void;
    /** 话筒键的样子：absent = 这台设备 / 这一页没有语音（空格吃掉那格）；其余照纸面话筒钮的 data-state。 */
    setMic(state: MicKeyState): void;
    /** 正在组字（拼音 / 临时英文）：回车键帽写「确认」（照 iOS；回车 = 原样上屏，v2.3.33）。 */
    setComposing(on: boolean): void;
}
export type MicKeyState = "absent" | "idle" | "recording" | "listening" | "transcribing" | "error" | "disabled";
export declare function createSoftKeyboard(d: SoftKeyboardDeps): SoftKeyboard;
