/** 当前是否在程序性改字中——beforeinput / compositionend 守卫据此让路（execCommand 也会触发它们）。 */
export declare function isProgrammaticEdit(): boolean;
/** 把 [start, end) 换成 text（text 为空 = 删除）；光标落在替换段末尾。 */
export declare function replaceRange(el: HTMLTextAreaElement | HTMLInputElement, start: number, end: number, text: string): void;
