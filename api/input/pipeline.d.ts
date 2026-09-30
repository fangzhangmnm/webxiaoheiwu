import type { NaturalCodeIME } from "../ime.ts";
import { type TextField } from "./field.ts";
export interface PipelineDeps {
    ime: NaturalCodeIME;
    /** 这个框现在能不能改（正文框问 app 的锁 / 只读 / 世界线守卫；其余框看 readOnly）。 */
    canEdit(el: TextField): boolean;
    /** 键盘敲了一个键（不含修饰键；不含本模块自己合成的回车）：语音模式退场；e.isTrusted = 真的实体键盘 → 软键盘据此让位。el = 当时焦点所在的文本框（没有 = null）。 */
    onKeydown?(el: TextField | null, e: KeyboardEvent): void;
    /** 任何一次输入活动（闲置计时用）。 */
    onActivity?(): void;
    /** 输入法上屏了一个词（用户词库节流推）。 */
    onCommit?(): void;
    /** 组字状态可能变了：重画顶栏中 / 英、候选。 */
    onChange(): void;
}
export interface InputPipeline {
    /** CapsLock 是语音键时 app 设 true：实体键盘打进内置输入法的单字母折回小写（CapsLock 翻大小写锁；2026-09-30）。 */
    foldCapsLock: boolean;
    /** app 自己的键要打进哪个框：焦点所在的文本框；焦点丢了就回到上一个还在屏上的文本框并把焦点还给它。没有 → null。 */
    target(): TextField | null;
    /** 只看不动（画候选用）：焦点所在的文本框。 */
    focused(): TextField | null;
    /** 按一个键（KeyboardEvent.key 词汇："a" / "Backspace" / "Enter" / " " / "ArrowLeft"）：先问输入法，它不要就做默认动作。 */
    press(key: string): Promise<void>;
    /** 原样落字（符号层 / 大写字母）：组字中先把首选上屏，再落字；不经输入法。 */
    literal(text: string): Promise<void>;
    /** 点第 index 个候选（当前页，0 起）；index < 0 = 首选上屏。 */
    pick(index: number): Promise<void>;
    /** 候选翻页。 */
    page(prev: boolean): Promise<void>;
    /** 中 ↔ 英（同实体键盘单击 Shift）。 */
    toggleMode(): Promise<void>;
    /** 把一个已经到手的 keydown 交给输入法（焦点不在任何框上时 app 把第一击救回正文用）。 */
    routeHardwareKey(el: TextField, e: KeyboardEvent): Promise<void>;
}
export declare function createInputPipeline(d: PipelineDeps): InputPipeline;
