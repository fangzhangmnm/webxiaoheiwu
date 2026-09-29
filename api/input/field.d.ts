export type TextField = HTMLTextAreaElement | HTMLInputElement;
/** 是不是能打字的框（textarea / 文本类 input）；不是 → null。 */
export declare function asTextField(x: unknown): TextField | null;
/** 密码框（type=password 或 -webkit-text-security 打码）：不走内置输入法（密码是 ASCII，拼音组字会把它吃掉），候选不显示。 */
export declare const isMasked: (el: HTMLElement) => boolean;
export declare const isWritable: (el: TextField) => boolean;
export declare function insertText(el: TextField, text: string): void;
/** 退格：有选区删选区，否则删光标前一个字。返回删没删。 */
export declare function deleteBackward(el: TextField): boolean;
/** 左右挪一个字（有选区 → 收到选区那一头）。 */
export declare function moveCaret(el: TextField, dir: -1 | 1): void;
/** 这个 keydown 是不是本模块自己发的（软键盘的回车在单行框里 = 合成一次 Enter 让框自己的处理器去提交）。输入管线据此不再路由它。 */
export declare const isOwnSyntheticKey: (e: Event) => boolean;
/** 回车：多行框 = 换行；单行框 = 让这个框自己的 Enter 处理器去做（sheet 确定 / 章节名提交 / 检索）。 */
export declare function pressEnter(el: TextField): void;
