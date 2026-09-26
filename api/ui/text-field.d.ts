export interface TextFieldOpts {
    onEnter?: (e: KeyboardEvent) => void;
    onEscape?: (e: KeyboardEvent) => void;
    /** 每次 input（含合成中的 insertCompositionText）；composing 让调用方自己决定要不要理。 */
    onInput?: (value: string, composing: boolean) => void;
    onBlur?: () => void;
}
export interface TextField {
    el: HTMLInputElement;
    composing(): boolean;
    /** 受控回写：见文件头 ③。 */
    setValue(v: string): void;
}
/** 这一击是不是输入法在组字（Enter = 上屏、Escape = 取消组字，都不是 app 的命令）。 */
export declare const isCompositionKey: (e: KeyboardEvent) => boolean;
export declare function bindTextField(el: HTMLInputElement, opts?: TextFieldOpts): TextField;
